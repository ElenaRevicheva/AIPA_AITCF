# Make.com + LinkedIn CMO — Fix “accessToken” Error

**Error you saw:** `TypeError: Cannot read properties of undefined (reading 'accessToken')` in the **Buffer** step of the scenario **"Vibejobhunter + CMO AIPA"**.

**Cause:** The **Buffer** connection in Make.com has no valid token (expired, revoked, or never completed). The scenario tries to read `accessToken` from that connection and it’s undefined.

---

## What to do

### 1. Reconnect Buffer in Make.com

1. Open **Make.com** → [us2.make.com](https://us2.make.com) → your org.
2. Go to **Scenarios** → open **"Vibejobhunter + CMO AIPA"**.
3. Find the **Buffer** module (the one that failed — after “Set multiple variables”).
4. Open that module (click it).
5. At the top, next to the connection dropdown, click **Reconnect** (or **Add** if there’s no connection).
6. Complete Buffer’s OAuth flow (log in to Buffer, approve Make.com).
7. Save the module and the scenario.

### 2. Run the scenario once

1. In the same scenario, click **Run once** at the bottom.
2. Check that all steps complete (including the Buffer step) with a green check.
3. If it still errors on Buffer, repeat step 1 and make sure you finish the full OAuth in Buffer.

### 3. If the error persists

- In Make.com go to **Data storage** → **Connections** (or **Connections** in the left menu).
- Find the **Buffer** connection used by this scenario.
- Remove it and run the scenario again; when the Buffer module asks for a connection, create a **new** Buffer connection and authorize it.

---

## Flow reminder

- **VibeJobHunter (CMO)** generates the post and sends it to your Make.com webhook (`MAKE_WEBHOOK_URL_LINKEDIN`).
- **Make.com** receives the webhook → “Set multiple variables” → **Buffer** → Buffer posts to LinkedIn (and optionally Instagram).
- The break was in **Buffer** (missing/invalid `accessToken`), not in VibeJobHunter or the webhook.

After Buffer is re-authorized, daily LinkedIn CMO posts should work again without code changes.
