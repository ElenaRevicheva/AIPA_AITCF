/**
 * Hashnode GraphQL: list publications + publish a post (or smoke test).
 * Secrets: HASHNODE_ACCESS_TOKEN in .env only (never commit .env).
 *
 * Usage:
 *   node scripts/hashnode-publish.mjs                    # delisted smoke post
 *   node scripts/hashnode-publish.mjs --public --file scripts/hashnode-posts/article.md
 *   HASHNODE_POST_FILE=... HASHNODE_POST_TITLE=... node scripts/hashnode-publish.mjs --public
 * First line of markdown file may be "# Title" (title stripped from body for Hashnode).
 * Docs: https://apidocs.hashnode.com/
 */
import fs from "fs";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const GQL = "https://gql.hashnode.com/";

/** Hashnode expects the PAT as the raw Authorization value (see hashnode.com blog API guide). */
function authHeader(token) {
  const t = (token || "").trim();
  if (!t) return "";
  return t.replace(/^Bearer\s+/i, "");
}

async function gql(query, variables, token) {
  const res = await fetch(GQL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(token),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(JSON.stringify(json.errors, null, 2));
  }
  return json.data;
}

const ME = `
  query Me {
    me {
      id
      username
      publications(first: 20) {
        edges {
          node {
            id
            title
            url
            domainInfo {
              hashnodeSubdomain
            }
          }
        }
      }
    }
  }
`;

const PUBLISH = `
  mutation PublishPost($input: PublishPostInput!) {
    publishPost(input: $input) {
      post {
        id
        slug
        title
        url
        publication {
          id
          title
          url
        }
      }
    }
  }
`;

const PUBLICATION_BY_HOST = `
  query PublicationByHost($host: String!) {
    publication(host: $host) {
      id
      title
      url
      domainInfo {
        hashnodeSubdomain
      }
    }
  }
`;

async function publicationByHost(token, host) {
  const data = await gql(PUBLICATION_BY_HOST, { host }, token);
  return data.publication || null;
}

function pickPublication(me, publicationId, subdomainHint) {
  const edges = me?.publications?.edges ?? [];
  const nodes = edges.map((e) => e.node).filter(Boolean);
  if (publicationId) {
    const found = nodes.find((n) => n.id === publicationId);
    if (!found) throw new Error(`HASHNODE_PUBLICATION_ID not found in your publications`);
    return found;
  }
  const hint = (subdomainHint || "").toLowerCase().trim();
  if (hint) {
    const found = nodes.find(
      (n) =>
        (n.domainInfo?.hashnodeSubdomain || "").toLowerCase() === hint ||
        (n.url || "").toLowerCase().includes(hint)
    );
    if (found) return found;
  }
  if (nodes.length === 1) return nodes[0];
  if (nodes.length === 0) return null;
  throw new Error(
    `Multiple publications (${nodes.length}). Set HASHNODE_PUBLICATION_ID or HASHNODE_SUBDOMAIN in .env. IDs:\n` +
      nodes.map((n) => `  ${n.id}  ${n.title}  (${n.domainInfo?.hashnodeSubdomain || n.url})`).join("\n")
  );
}

/** @param {string} filePath relative to repo root or absolute */
function loadMarkdownFile(filePath) {
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.join(path.dirname(fileURLToPath(import.meta.url)), "..", filePath);
  const raw = fs.readFileSync(abs, "utf8");
  const lines = raw.split(/\r?\n/);
  let title = null;
  let body = raw.trim();
  if (lines[0]?.startsWith("# ")) {
    title = lines[0].slice(2).trim();
    body = lines.slice(1).join("\n").replace(/^\s+/, "").trim();
  }
  return { title, body, abs };
}

async function main() {
  const token = process.env.HASHNODE_ACCESS_TOKEN;
  if (!token) {
    console.error("Missing HASHNODE_ACCESS_TOKEN in .env");
    process.exit(1);
  }

  const argv = process.argv;
  const wantPublic = argv.includes("--public");
  let fileArg = null;
  const fi = argv.indexOf("--file");
  if (fi >= 0 && argv[fi + 1]) fileArg = argv[fi + 1];
  if (!fileArg && process.env.HASHNODE_POST_FILE?.trim()) {
    fileArg = process.env.HASHNODE_POST_FILE.trim();
  }
  const data = await gql(ME, {}, token);
  const me = data.me;
  if (!me) throw new Error("me: null — check token at https://hashnode.com/settings/developer");

  let pub = pickPublication(
    me,
    process.env.HASHNODE_PUBLICATION_ID?.trim(),
    process.env.HASHNODE_SUBDOMAIN?.trim()
  );

  if (!pub) {
    const sub = process.env.HASHNODE_SUBDOMAIN?.trim() || me.username;
    if (!sub) throw new Error("No publications found and could not infer host (no username).");
    const host = sub.includes(".") ? sub : `${sub}.hashnode.dev`;
    pub = await publicationByHost(token, host);
    if (!pub?.id) {
      throw new Error(
        `No publication found. Create a blog at https://hashnode.com/ — then set HASHNODE_SUBDOMAIN in .env if needed. Tried host: ${host}`
      );
    }
    console.log("Using publication (by host):", host, "→", pub.id);
  }

  let title = process.env.HASHNODE_POST_TITLE?.trim() || null;
  let body = process.env.HASHNODE_POST_MARKDOWN?.trim() || null;
  if (fileArg) {
    const loaded = loadMarkdownFile(fileArg);
    title = title || loaded.title;
    body = body || loaded.body;
    console.log("Post file:", loaded.abs);
  }
  title =
    title ||
    `CTO AIPA — Hashnode API smoke test (${new Date().toISOString().slice(0, 16)} UTC)`;
  body =
    body ||
    [
      "This is an **automated smoke test** from the CTO AIPA repo (`scripts/hashnode-publish.mjs`).",
      "",
      "- If this post was created, the Hashnode **Personal Access Token** and **publication ID** are valid.",
      "- Delete or unpublish this post from Hashnode if you do not want it on your blog.",
      "",
      "[AIdeazz](https://aideazz.xyz)",
    ].join("\n");

  const input = {
    publicationId: pub.id,
    title,
    contentMarkdown: body,
    tags: [
      { slug: "ai", name: "AI" },
      { slug: "machine-learning", name: "Machine Learning" },
      { slug: "programming", name: "Programming" },
      { slug: "startup", name: "Startup" },
    ],
    settings: {
      delisted: !wantPublic,
      enableTableOfContent: false,
      isNewsletterActivated: false,
    },
  };

  const out = await gql(PUBLISH, { input }, token);
  const post = out.publishPost?.post;
  if (!post?.url) {
    console.error(JSON.stringify(out, null, 2));
    throw new Error("publishPost failed");
  }

  console.log("Published:", post.title);
  console.log("URL:", post.url);
  console.log(wantPublic ? "(visible in feed)" : "(delisted — not shown in public feed; use --public for visible)");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
