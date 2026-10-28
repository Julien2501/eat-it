// Relais Eat-it : reçoit une proposition de l'app et la transforme en issue GitHub.
// Secrets/variables (voir README.md) : GITHUB_TOKEN (secret), GITHUB_REPO, ALLOWED_ORIGIN.

const LIMITS = { title: 120, list: 4000, text: 1500, short: 80, url: 300, body: 700000, image: 560000 };
const IMAGE_TTL = 90 * 24 * 3600; // les photos reçues sont supprimées au bout de 90 jours
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map(); // IP -> horodatages ; par instance du Worker, donc un garde-fou « au mieux »

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
// Rend le texte inoffensif dans l'issue : pas de @mentions, pas de balises HTML, pas de #123 qui lierait d'autres issues.
const safe = (s) => s.replace(/</g, "&lt;").replace(/@/g, "@​").replace(/#(\d)/g, "#​$1");

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(status, obj, origin) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return true;
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

// Enregistre la photo (JPEG en base64) dans KV et renvoie son adresse, ou "" si absente/invalide.
async function storeImage(p, env, origin) {
  const m = typeof p.image === "string" && /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(p.image);
  if (!m || !env.IMAGES || m[1].length > LIMITS.image || !m[1].startsWith("/9j/")) return "";
  const id = crypto.randomUUID();
  await env.IMAGES.put(id, m[1], { expirationTtl: IMAGE_TTL });
  return `${origin}/img/${id}.jpg`;
}

function buildIssue(p, photo) {
  const photoMd = photo ? `\n**Photo** : ${photo}\n\n![photo](${photo})\n` : "";
  const from = safe(str(p.from, LIMITS.short)) || "anonyme";
  const message = safe(str(p.message, LIMITS.text));
  if (p.type === "edit") {
    const id = str(p.recipeId, LIMITS.short).replace(/[^a-z0-9-]/gi, "");
    const name = safe(str(p.recipeTitle, LIMITS.title));
    if (!id || !message) return null;
    return {
      title: `[Modification] ${name}`.slice(0, 200),
      body: `**Recette** : ${name} (\`${id}\`)\n**De** : ${from}\n\n${message}\n${photoMd}`,
    };
  }
  const title = safe(str(p.title, LIMITS.title));
  const ingredients = safe(str(p.ingredients, LIMITS.list));
  const steps = safe(str(p.steps, LIMITS.list));
  if (!title || !ingredients || !steps) return null;
  const source = str(p.source, LIMITS.url);
  const link = /^https?:\/\/[^\s<>]+$/.test(source) ? source : "";
  const lines = [
    `**De** : ${from}`,
    `**Personnes** : ${safe(str(p.servings, 3)) || "?"} · **Durée** : ${safe(str(p.time, 4)) || "?"} min · **Type** : ${safe(str(p.category, LIMITS.short)) || "?"}`,
    "",
    "### Ingrédients",
    ingredients,
    "",
    "### Étapes",
    steps,
  ];
  if (link) lines.push("", `**Source** : ${link}`);
  if (message) lines.push("", "### Mot", message);
  if (photo) lines.push(photoMd);
  return { title: `[Nouvelle recette] ${title}`.slice(0, 200), body: lines.join("\n") + "\n" };
}

export default {
  async fetch(request, env) {
    const allowed = env.ALLOWED_ORIGIN;
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") {
      return new Response(null, { status: origin === allowed ? 204 : 403, headers: origin === allowed ? cors(allowed) : {} });
    }
    const url = new URL(request.url);
    const img = /^\/img\/([0-9a-f-]{36})\.jpg$/.exec(url.pathname);
    if (request.method === "GET" && img && env.IMAGES) {
      const b64 = await env.IMAGES.get(img[1]);
      if (!b64) return new Response("not found", { status: 404 });
      const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      return new Response(bin, {
        headers: { "Content-Type": "image/jpeg", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" },
      });
    }
    if (request.method !== "POST") return json(405, { error: "method" }, allowed);
    if (origin !== allowed) return json(403, { error: "origin" }, allowed);

    if (limited(request.headers.get("CF-Connecting-IP") || "?")) return json(429, { error: "rate" }, allowed);

    const raw = await request.text();
    if (raw.length > LIMITS.body) return json(413, { error: "size" }, allowed);
    let p;
    try {
      p = JSON.parse(raw);
    } catch {
      return json(400, { error: "json" }, allowed);
    }
    if (!p || typeof p !== "object") return json(400, { error: "json" }, allowed);
    // Champ piège rempli = robot : on répond « ok » sans rien créer.
    if (str(p.website, 100)) return json(200, { ok: true }, allowed);

    if (!buildIssue(p, "")) return json(400, { error: "fields" }, allowed);
    const photo = await storeImage(p, env, url.origin);
    const issue = buildIssue(p, photo);

    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "eat-it-relay",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify(issue),
    });
    if (!res.ok) return json(502, { error: "github" }, allowed);
    return json(200, { ok: true }, allowed);
  },
};
