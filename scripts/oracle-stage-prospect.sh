#!/usr/bin/env bash
# Run the Manual Prospect Play on the Oracle VM, where .env lives.
#
# A Cursor cloud agent has no HUBSPOT_API_KEY and no egress to api.hubapi.com, so it
# cannot stage a prospect itself. Oracle has both. This script is piped to the box over
# ssh by .github/workflows/stage-prospect-on-trigger.yml; it runs stage-manual-prospect.cjs
# there and tars back whatever the run wrote under docs/selling, so the registry and the
# drafts can be committed to git. That commit is not optional: /go/outreach-email/{slug}
# resolves the slug from the committed registry, so an uncommitted staging run leaves the
# email button answering "Unknown outreach email slug".
#
# Usage (on Oracle): bash oracle-stage-prospect.sh <ref> <domain> [flags...]
set -uo pipefail

REF="${1:?ref required}"
DOMAIN="${2:?domain required}"
shift 2
FLAGS=("$@")

AIPA_DIR=/home/ubuntu/cto-aipa
[ -d "$AIPA_DIR/.git" ] || AIPA_DIR=/home/ubuntu/AIPA_AITCF
cd "$AIPA_DIR" || { echo "FATAL: no cto-aipa checkout on this box"; exit 1; }
echo "--- staging $DOMAIN in $AIPA_DIR as $(whoami) ---"

if [ ! -f .env ]; then
  echo "FATAL: .env missing on Oracle — HUBSPOT_API_KEY unavailable"
  exit 1
fi

# Match the scripts to the reviewed branch, the same way deploy-oracle-on-trigger.yml does.
echo "--- fetching $REF ---"
git fetch origin "$REF" 2>&1 || { echo "FATAL: fetch $REF failed"; exit 1; }
git checkout FETCH_HEAD -- scripts/ 2>&1 || echo "WARN: scripts/ checkout failed — using the copy already on the box"

# Ship back ONLY what this run wrote. Oracle's docs/selling is routinely dirty with
# in-flight work — the first run of this bridge found 21 already-modified files — and
# packing the whole dirty tree would commit someone else's uncommitted edits. Compare
# content hashes before and after, so an edit to an already-dirty file is still caught.
# Plain `sort` (whole line), not `sort -k2`: comm compares full lines and rejects input
# sorted on a field, which is what silently lost the first real staging run's files.
snapshot() { find docs/selling -type f -exec md5sum {} + 2>/dev/null | sort; }
BEFORE=$(mktemp)
snapshot > "$BEFORE"

# On a dry run, also print the full audit. The pitch copy in PROSPECT_META quotes the
# site's real weaknesses, and writing it from a bare score invites the "we told an
# A-grade site it was invisible" mistake. Oracle can reach both the engine and the site.
case " ${FLAGS[*]-} " in
  *" --dry-run "*)
    VIS_KEY=$(sed -n 's/^VISIBILITY_API_KEY=//p' .env | head -1 | tr -d '[:space:]')
    [ -n "$VIS_KEY" ] || VIS_KEY=$(sed -n 's/^VISIBILITY_API_KEYS=//p' .env | head -1 | cut -d, -f1 | tr -d '[:space:]')
    [ -n "$VIS_KEY" ] || VIS_KEY=aidz_demo_visibility_2026
    # Widen the contact hunt. stage-manual-prospect.cjs reads the homepage plus three
    # contact paths; a Panama site that publishes its number only on an "about" or
    # Spanish page reads as EMAIL-PRIMARY when it is not. Never invent a number —
    # this prints candidates for a human to confirm.
    echo "--- contact recon for $DOMAIN ---"
    node -e '
      const domain = process.argv[1];
      const paths = ["", "/contact", "/contact-us", "/contacto", "/contactenos", "/es",
                     "/about", "/about-us", "/nosotros", "/quienes-somos", "/team", "/equipo"];
      (async () => {
        const phones = new Set(), mails = new Set(), seen = [];
        for (const p of paths) {
          const u = `https://${domain}${p}`;
          try {
            const r = await fetch(u, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; AIPA/1.0)" } });
            if (!r.ok) continue;
            const h = await r.text();
            seen.push(`${p || "/"} ${r.status} ${(h.match(/<title[^>]*>([^<]*)/i) || [,""])[1].trim().slice(0, 70)}`);
            for (const m of h.matchAll(/wa\.me\/(\d+)|api\.whatsapp\.com\/send[^"´]*phone=(\d+)/gi)) phones.add(`WA ${m[1] || m[2]}`);
            for (const m of h.matchAll(/tel:([+\d()\s.-]{7,})/gi)) phones.add(`tel ${m[1].trim()}`);
            for (const m of h.matchAll(/\+?507[\s.-]?\d{3,4}[\s.-]?\d{4}/g)) phones.add(`text ${m[0].trim()}`);
            for (const m of h.matchAll(/mailto:([^"´\s?<>]+)/gi)) mails.add(m[1].toLowerCase());
          } catch { /* path absent */ }
        }
        for (const s of seen) console.log("  page", s);
        console.log("  PHONE CANDIDATES:", phones.size ? [...phones].join(" | ") : "NONE FOUND");
        console.log("  MAILTO:", mails.size ? [...mails].join(" | ") : "NONE FOUND");
      })();
    ' "$DOMAIN" || echo "WARN: contact recon failed"

    echo "--- full audit for $DOMAIN ---"
    curl -sS -m 60 -X POST https://webhook.aideazz.xyz/cto/v1/visibility \
      -H "Content-Type: application/json" -H "X-API-Key: $VIS_KEY" \
      -d "{\"url\":\"https://$DOMAIN\"}" |
      node -e '
        let s = "";
        process.stdin.on("data", (d) => (s += d)).on("end", () => {
          const r = JSON.parse(s);
          console.log("score", r.score, r.grade, "|", (r.categories || []).map((c) => `${c.id}:${c.score}`).join(" "));
          console.log("verdict:", r.verdict);
          for (const f of r.topFixes || []) console.log("  fix:", f);
          for (const c of (r.checks || []).filter((x) => x.status !== "pass")) {
            console.log(`  ${c.status.toUpperCase()} ${c.id} — ${c.detail}`);
          }
        });
      ' || echo "WARN: audit detail unavailable"
    ;;
esac

# --collect-only recovers a staging run whose files never made it back, without
# re-running the play: a second real run would create a duplicate deal, and --update
# would post a duplicate note. Recovery must not cost CRM noise.
case " ${FLAGS[*]-} " in
  *" --collect-only "*)
    echo "--- collect-only: no CRM writes, packing recent docs/selling output ---"
    RC=0
    ;;
  *)
    echo "--- node scripts/stage-manual-prospect.cjs $DOMAIN ${FLAGS[*]-} ---"
    set +e
    node scripts/stage-manual-prospect.cjs "$DOMAIN" "${FLAGS[@]}" 2>&1
    RC=$?
    set -e
    echo "--- stage exit code: $RC ---"
    ;;
esac

AFTER=$(mktemp)
snapshot > "$AFTER"

CHANGED=$(mktemp)
case " ${FLAGS[*]-} " in
  *" --collect-only "*)
    # Nothing ran, so there is no before/after delta. Recency alone would sweep in files
    # another Oracle job touched, so also require the file to differ from git.
    DIRTY=$(mktemp)
    git status --porcelain -- docs/selling | sed 's/^...//' | sort -u > "$DIRTY"
    find docs/selling -type f -mmin -240 2>/dev/null | sort -u | comm -12 - "$DIRTY" > "$CHANGED"
    rm -f "$DIRTY"
    ;;
  *)
    # Any hash line present after but not before = created or rewritten by this run.
    comm -13 "$BEFORE" "$AFTER" | sed 's/^[0-9a-f]*  //' | sort -u > "$CHANGED"
    ;;
esac

OUT=/tmp/stage-prospect-output.tar.gz
rm -f "$OUT"
if [ -s "$CHANGED" ]; then
  echo "--- this run touched: ---"
  sed 's/^/      /' "$CHANGED"
  tar -czf "$OUT" -T "$CHANGED" 2>/dev/null && echo "--- packed $(wc -l < "$CHANGED") file(s) → $OUT ---"
else
  echo "--- no docs/selling changes to pack (dry run, or nothing written) ---"
fi
rm -f "$BEFORE" "$AFTER" "$CHANGED"

exit $RC
