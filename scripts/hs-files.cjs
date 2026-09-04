/**
 * hs-files.cjs — put a file INTO HubSpot and hang it off a note.
 *
 * Why this exists: outreach attachments lived only in the repo and travelled
 * only through Resend. So a letter went out with the signed NDA attached, and
 * the CRM record of that letter had no file on it — anyone opening the deal,
 * or Elena sending the second option (HubSpot UI Email), had nothing to attach.
 * The Datastar NDA, 4 Sep 2026, is the case that made it obvious.
 *
 * Two calls, both idempotent:
 *   uploadOutreachFile(...)  — reuses an existing file of the same name in the
 *                              same folder instead of creating a duplicate
 *   addNoteAttachments(...)  — unions onto hs_attachment_ids, never replaces
 *
 * Needs the `files` scope on the Service Key, which the CRM scopes do not
 * imply. filesScopeOk() proves the API is reachable, but read and write are
 * SEPARATE grants: search can answer 200 while upload answers 403. So the
 * upload path carries its own actionable error rather than trusting the
 * preflight — a preflight that cannot test the write it is gating is only
 * half a check.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { hubspotKey, hubspotBase } = require('./hs-env.cjs');

/** Where uploaded outreach attachments live in HubSpot's file manager. */
const FOLDER_PATH = '/outreach-attachments';

/** hs_attachment_ids is a SEMICOLON-separated list, not comma. */
const ATTACH_SEP = ';';

const MIME = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function authHeaders() {
  const key = hubspotKey();
  if (!key) throw new Error('HUBSPOT_API_KEY missing (environment or .env)');
  return { Authorization: `Bearer ${key}` };
}

async function api(method, urlPath, { json, form } = {}) {
  const headers = authHeaders();
  if (json) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${hubspotBase()}${urlPath}`, {
    method,
    headers,
    body: form || (json ? JSON.stringify(json) : undefined),
  });
  const text = await r.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* non-JSON is the finding */
  }
  return { ok: r.ok, status: r.status, json: parsed, text };
}

/**
 * True when the Service Key can use the Files API at all.
 *
 * Probes /files/v3/files/search, not /files/v3/files — the latter is not a GET
 * route and answers 405 with an HTML body, which reads exactly like a broken
 * key. Search is the readable endpoint, so a 403 here really is the scope.
 */
async function filesScopeOk() {
  const r = await api('GET', '/files/v3/files/search?limit=1');
  if (r.ok) return { ok: true };
  if (r.status === 403 || r.status === 401) {
    return {
      ok: false,
      reason:
        'the Service Key is missing the `files` scope — HubSpot → Development → Keys → ' +
        'Service Keys → Aldeazz_Marketing_Engine → add `files`, then re-run',
    };
  }
  return { ok: false, reason: `Files API returned ${r.status}: ${r.text.slice(0, 160)}` };
}

async function findExistingFile(name) {
  const q = new URLSearchParams({ name, limit: '10' });
  const r = await api('GET', `/files/v3/files/search?${q}`);
  if (!r.ok) return null;
  const hit = (r.json?.results || []).find(
    (f) => f.name === path.parse(name).name || f.name === name,
  );
  return hit || null;
}

/**
 * Upload one attachment. Returns { id, name, reused }.
 * `access: PRIVATE` — a signed contract must not become a public URL.
 */
async function uploadOutreachFile(absPath, displayName) {
  if (!fs.existsSync(absPath)) throw new Error(`no such file: ${absPath}`);
  const name = displayName || path.basename(absPath);

  const existing = await findExistingFile(name);
  if (existing?.id) return { id: String(existing.id), name, reused: true };

  const ext = path.extname(name).toLowerCase();
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(absPath)], { type: MIME[ext] || 'application/octet-stream' }), name);
  form.append('fileName', name);
  form.append('folderPath', FOLDER_PATH);
  form.append(
    'options',
    JSON.stringify({
      access: 'PRIVATE',
      overwrite: false,
      duplicateValidationStrategy: 'RETURN_EXISTING',
      duplicateValidationScope: 'EXACT_FOLDER',
    }),
  );

  const r = await api('POST', '/files/v3/files', { form });
  if (r.status === 403) {
    // Reading and writing files are separate grants, and the read one is what
    // the preflight can see. A raw HubSpot scope error here is unactionable, so
    // it becomes the one instruction that fixes it.
    const err = new Error(
      'HubSpot refused the upload: the Service Key can READ files but not write them.\n' +
        '  Fix (Elena, once): HubSpot → Settings → Integrations → Private Apps /' +
        ' Development → Keys → Service Keys → Aldeazz_Marketing_Engine → Scopes →' +
        ' tick `files` (write) → Save. Then re-run this attach.\n' +
        '  Nothing else is blocked by this: the letter and its attachment already' +
        ' went out through Resend; only the CRM copy of the file is missing.',
    );
    err.code = 'FILES_SCOPE';
    throw err;
  }
  if (!r.ok) throw new Error(`upload failed ${r.status}: ${r.text.slice(0, 200)}`);
  const id = r.json?.id;
  if (!id) throw new Error(`upload returned no id: ${r.text.slice(0, 160)}`);
  return { id: String(id), name, reused: false };
}

/** Union file ids onto a note. Returns { before, after, added }. */
async function addNoteAttachments(noteId, fileIds) {
  const cur = await api('GET', `/crm/v3/objects/notes/${noteId}?properties=hs_attachment_ids`);
  if (!cur.ok) throw new Error(`note ${noteId} not readable: ${cur.text.slice(0, 160)}`);
  const before = String(cur.json?.properties?.hs_attachment_ids || '')
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);

  const after = [...new Set([...before, ...fileIds.map(String)])];
  const added = after.filter((id) => !before.includes(id));
  if (!added.length) return { before, after, added };

  const r = await api('PATCH', `/crm/v3/objects/notes/${noteId}`, {
    json: { properties: { hs_attachment_ids: after.join(ATTACH_SEP) } },
  });
  if (!r.ok) throw new Error(`note attach failed ${r.status}: ${r.text.slice(0, 200)}`);
  return { before, after, added };
}

/** The outreach note on a deal — the one carrying the SEND anchor. */
async function findOutreachNoteId(dealId) {
  const assoc = await api('GET', `/crm/v4/objects/deals/${dealId}/associations/notes`);
  const ids = (assoc.json?.results || []).map((r) => r.toObjectId || r.id).filter(Boolean);
  let fallback = null;
  for (const id of ids) {
    const n = await api('GET', `/crm/v3/objects/notes/${id}?properties=hs_note_body,hs_timestamp`);
    const body = n.json?.properties?.hs_note_body || '';
    if (/SEND BY EMAIL/i.test(body)) return String(id);
    if (!fallback) fallback = String(id);
  }
  return fallback;
}

module.exports = {
  FOLDER_PATH,
  ATTACH_SEP,
  filesScopeOk,
  uploadOutreachFile,
  addNoteAttachments,
  findOutreachNoteId,
};
