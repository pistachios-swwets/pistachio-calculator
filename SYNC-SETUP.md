# Cloud sync setup (one-time)

The calculator syncs all data (materials, packaging, recipes, sales) to `data.json` in this
repo, so it survives a browser-clear and works across devices. A small Cloudflare Worker holds
the GitHub token **server-side** — the token is never in the public page.

## Why a Worker (and not the token in the page)
`index.html` is public. Anything in it (including any GitHub token) is readable by anyone.
A `repo`-scoped token in the page would expose the **production Odoo repo** and every other repo
on the account, and GitHub would auto-revoke it. The Worker keeps the token off the client.

## Steps
1. **Create a GitHub token** for the Worker — a **fine-grained token** scoped to **only**
   `pistachios-swwets/pistachio-calculator` with **Contents: Read and write**. (This limits the
   Worker's blast radius to this one repo's files.)
2. **Create a Cloudflare Worker** named `pistachio-calc-sync` (dashboard → Workers & Pages → Create).
   - Its URL should be `https://pistachio-calc-sync.<your-subdomain>.workers.dev/`.
   - If your subdomain isn't `almarzooqh`, update `SYNC_URL` at the top of the script block in
     `index.html` to match, and re-push.
3. **Paste** `cloudflare-worker.js` as the Worker code.
4. **Add variables** (Worker → Settings → Variables and Secrets):
   - `GITHUB_TOKEN` = the fine-grained token from step 1 (mark as **Secret/Encrypted**).
   - `APP_KEY` = `psweet-calc-key-2026` (must match `SYNC_KEY` in `index.html`).
5. **Deploy.** Open the calculator — the header shows **☁️ محفوظ** after edits sync.

## How it behaves
- **Load:** reads the cloud `data.json` (via the Worker; falls back to the public raw file, then
  to this browser's localStorage if offline). If this device's local data is *richer* than the
  cloud (more recipes/sales), it uploads local first so migrating an in-use device loses nothing.
- **Save:** debounced 3s after the last change → one commit to `data.json`. Also cached to
  localStorage immediately (fast + offline fallback).
- **Conflicts:** the Worker always re-fetches the file SHA before writing and retries once on 409.

## Security note (residual risk, by design)
`SYNC_KEY` ships in the public page, so it's a speed-bump, not real auth. Worst case if someone
reads it: they could overwrite **this calculator's `data.json`** (recoverable from git history).
No token, and no access to any other repo, is exposed. That's the trade-off for a keyless,
login-less internal tool — and it's vastly safer than putting a GitHub token in the page.
