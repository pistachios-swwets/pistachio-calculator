/*
 * Pistachio Calculator — cloud-sync Worker.
 *
 * Holds the GitHub token SERVER-SIDE and is the ONLY thing that can write the repo.
 * The browser calls this Worker; the token never ships to the page.
 *
 * Deploy (Cloudflare dashboard → Workers, or wrangler):
 *   1. Create a Worker named exactly:  pistachio-calc-sync
 *      (so its URL is https://pistachio-calc-sync.<your-subdomain>.workers.dev/,
 *       which is what index.html's SYNC_URL points at — adjust if your subdomain differs).
 *   2. Paste this file as the Worker code.
 *   3. Add two secrets/variables (Settings → Variables):
 *        GITHUB_TOKEN = <a GitHub token with contents:write on pistachio-calculator ONLY>
 *                       (prefer a FINE-GRAINED token limited to this one repo — NOT the
 *                        broad repo-scoped PAT — so the Worker's blast radius is one file.)
 *        APP_KEY      = psweet-calc-key-2026   (must match SYNC_KEY in index.html)
 *   4. Deploy. The calculator will start syncing automatically.
 *
 * Endpoints:
 *   GET  /  -> returns the current data.json (or null if missing)
 *   POST / -> body = {materials,packaging,recipes,sales}; validates shape and commits data.json
 */
const OWNER = "pistachios-swwets";
const REPO = "pistachio-calculator";
const PATH = "data.json";

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-app-key",
    };
    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // Low-security speed-bump (see index.html note). Not real auth.
    if (env.APP_KEY && request.headers.get("x-app-key") !== env.APP_KEY) return json({ error: "unauthorized" }, 401);

    const gh = {
      "Authorization": "token " + env.GITHUB_TOKEN,
      "User-Agent": "pistachio-calc-sync",
      "Accept": "application/vnd.github+json",
    };
    const contentsUrl = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;

    if (request.method === "GET") {
      const r = await fetch(contentsUrl + "?ref=main", { headers: gh });
      if (r.status === 404) return json(null);
      if (!r.ok) return json({ error: "read_failed", status: r.status }, 502);
      const meta = await r.json();
      const bin = atob((meta.content || "").replace(/\n/g, ""));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const text = new TextDecoder("utf-8").decode(bytes);
      return new Response(text, { headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
    }

    if (request.method === "POST") {
      let data;
      try { data = await request.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
      const ok = data && typeof data === "object" &&
        Array.isArray(data.materials) && Array.isArray(data.packaging) &&
        Array.isArray(data.recipes) && Array.isArray(data.sales);
      if (!ok) return json({ error: "bad_shape" }, 400);

      const text = JSON.stringify(data, null, 2);
      const utf8 = new TextEncoder().encode(text);
      let bin = "";
      for (const b of utf8) bin += String.fromCharCode(b);
      const contentB64 = btoa(bin);

      const putOnce = async () => {
        let sha;
        const g = await fetch(contentsUrl + "?ref=main", { headers: gh });
        if (g.ok) { const m = await g.json(); sha = m.sha; }
        const body = { message: "data update (calc sync)", content: contentB64, branch: "main" };
        if (sha) body.sha = sha;
        return fetch(contentsUrl, { method: "PUT", headers: { ...gh, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      };

      let resp = await putOnce();
      if (resp.status === 409) resp = await putOnce(); // conflict → refetch SHA + retry once
      if (!resp.ok) { const t = await resp.text(); return json({ error: "write_failed", status: resp.status, detail: t.slice(0, 200) }, 502); }
      return json({ ok: true });
    }

    return json({ error: "method_not_allowed" }, 405);
  },
};
