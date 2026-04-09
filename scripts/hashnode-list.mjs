/**
 * Print Hashnode account + publications (debug). Uses HASHNODE_ACCESS_TOKEN from .env.
 * If publications is empty, finish blog setup on hashnode.com and/or set HASHNODE_PUBLICATION_ID
 * from your blog dashboard URL (see .env.example).
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const GQL = "https://gql.hashnode.com/";

function authHeader(token) {
  const t = (token || "").trim();
  return t.replace(/^Bearer\s+/i, "");
}

async function main() {
  const token = process.env.HASHNODE_ACCESS_TOKEN;
  if (!token) {
    console.error("Set HASHNODE_ACCESS_TOKEN in .env");
    process.exit(1);
  }
  const query = `
    query Me {
      me {
        id
        username
        name
        publications(first: 20) {
          totalDocuments
          edges {
            node {
              id
              title
              url
              domainInfo { hashnodeSubdomain }
            }
          }
        }
      }
    }
  `;
  const res = await fetch(GQL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authHeader(token),
    },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
