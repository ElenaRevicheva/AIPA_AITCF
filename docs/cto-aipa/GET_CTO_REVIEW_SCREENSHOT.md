# Get a GitHub PR or commit with CTO AIPA review comment

Use this to capture the **readme-pr-review.png** screenshot (PR or commit with a CTO AIPA review comment).

---

## 1. Add the GitHub webhook (one-time per repo)

1. Open the repo on GitHub (e.g. **cto-aipa** or any repo you want reviewed).
2. **Settings** → **Webhooks** → **Add webhook**.
3. Set:
   - **Payload URL:** `http://170.9.242.90:3000/webhook/github`
   - **Content type:** `application/json`
   - **Which events?** → **Let me select individual events** → enable:
     - **Pull requests**
     - **Pushes**
   - **Active:** checked.
4. **Add webhook**.

---

## 2. Trigger a review (choose one)

### Option A – Pull request (recommended for screenshot)

1. Create a branch and make a small change (e.g. add a line to `README.md` or a doc file).
2. Open a **Pull request** to `main` (or `master`).
3. Within a short time CTO AIPA will post a comment on the PR: **"🤖 CTO AIPA Code Review (v3.0 - Tech Co-Founder)"**.
4. Take a screenshot of the PR with that comment for **readme-pr-review.png**.

### Option B – Push to main/master

1. Push one or more commits directly to **main** (or **master**).
2. CTO AIPA will post a **commit comment** on the latest commit: **"🤖 CTO AIPA Push Review (v3.0)"**.
3. Open the commit on GitHub, then take a screenshot for **readme-pr-review.png**.

---

## 3. If no comment appears

- **Webhook:** In GitHub → **Settings** → **Webhooks**, open your webhook and check **Recent Deliveries**. A 200 response means CTO AIPA received the event.
- **Server:** Ensure CTO AIPA is running at `http://170.9.242.90:3000` and that `GITHUB_TOKEN` (or equivalent) is set in `.env` on the server so it can post comments.
- **PR:** Only **opened** and **synchronize** (new commits on the PR) trigger a review.
- **Push:** Only pushes to **main** or **master** trigger a commit review.

---

## Quick test from this repo (cto-aipa)

1. Add the webhook to **cto-aipa** (as above).
2. Create a branch, e.g. `git checkout -b doc-readme-screenshot`.
3. Make a tiny edit (e.g. add a blank line to `README.md`), commit, push.
4. Open a PR to `main` on GitHub.
5. Wait for the CTO AIPA comment and capture the screenshot.
