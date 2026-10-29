// Page de validation (ouverte depuis le lien de l'issue) : aperçu, puis Valider / Refuser.
import { publish } from "./publish.js";
import { addRecipe, applyChanges, buildNewRecipe, fmtMinutes, listRecipes, replaceRecipe, sharePage } from "./recipe.js";
import { diffLines, FIELD_LABELS, LIST_FIELDS } from "./diff.js";

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const RECORD_TTL = 14 * 24 * 3600;

const HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
};

function page(title, body, status = 200) {
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)}</title><style>
:root{color-scheme:light dark;--bg:#faf6f1;--card:#fff;--text:#241d1a;--muted:#857870;--line:#eee3d9;--accent:#e8590c}
@media(prefers-color-scheme:dark){:root{--bg:#14110f;--card:#211c19;--text:#f4ece7;--muted:#a09289;--line:#322b27;--accent:#ff7a2f}}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 -apple-system,system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:20px 16px 40px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:18px;margin:22px 0 8px}
.card{background:var(--card);border-radius:18px;padding:16px;margin:12px 0;box-shadow:0 2px 12px rgba(60,30,10,.08)}
.muted{color:var(--muted);font-size:14px}img{width:100%;border-radius:14px;display:block;margin:12px 0}
ul,ol{padding-left:22px;margin:6px 0}li{margin:4px 0}
pre{background:var(--bg);border-radius:12px;padding:10px;overflow-x:auto;font:14px/1.5 ui-monospace,monospace;margin:6px 0;white-space:pre-wrap}
.add{color:#1a7f37;font-weight:700}.del{color:#cf222e}del{color:var(--muted)}
form{display:flex;gap:12px;margin-top:20px}
button{flex:1;padding:16px;border:0;border-radius:16px;font-weight:700;font-size:17px;font-family:inherit;color:#fff;background:var(--accent)}
button.no{background:transparent;color:var(--muted);border:1px solid var(--line)}
.warn{background:#fff4e5;color:#7a4b00;border-radius:12px;padding:10px 12px;font-size:14px}
</style></head><body><main>${body}</main></body></html>`;
  return new Response(html, { status, headers: HEADERS });
}

function changesHtml(changes) {
  const parts = [];
  for (const key of Object.keys(FIELD_LABELS)) {
    const c = changes && changes[key];
    if (!c) continue;
    if (LIST_FIELDS.has(key)) {
      const rows = diffLines(c.before, c.after)
        .split("\n")
        .map((l) => (l.startsWith("+ ") ? `<span class="add">${esc(l)}</span>` : l.startsWith("- ") ? `<span class="del">${esc(l)}</span>` : esc(l)))
        .join("\n");
      parts.push(`<h2>${FIELD_LABELS[key]}</h2><pre>${rows}</pre>`);
    } else {
      parts.push(`<p><b>${FIELD_LABELS[key]}</b> : <del>${esc(c.before) || "(vide)"}</del> → <b>${esc(c.after) || "(vide)"}</b></p>`);
    }
  }
  return parts.join("") || '<p class="muted">Aucun champ modifié.</p>';
}

const lines = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);

export function previewHtml(rec, imgUrl) {
  const p = rec.p;
  const photo = imgUrl ? `<img src="${esc(imgUrl)}" alt="Photo proposée">` : "";
  const from = p.from ? ` · de ${esc(p.from)}` : "";
  if (p.type === "edit") {
    return `<h1>Modification</h1><p class="muted">${esc(p.recipeTitle)}${from}</p>
      <div class="card">${changesHtml(p.changes)}${p.message ? `<h2>Pourquoi</h2><p>${esc(p.message)}</p>` : ""}${photo ? `<h2>Nouvelle photo</h2>${photo}` : ""}</div>`;
  }
  const meta = [p.servings ? `${esc(p.servings)} pers.` : "", p.time ? esc(fmtMinutes(p.time)) : "", p.category ? esc(p.category) : ""].filter(Boolean).join(" · ");
  return `<h1>${esc(p.title)}</h1><p class="muted">${meta}${from}</p>
    <div class="card">${photo}<h2>Ingrédients</h2><ul>${lines(p.ingredients).map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
    <h2>Préparation</h2><ol>${lines(p.steps).map((l) => `<li>${esc(l)}</li>`).join("")}</ol>
    ${p.source ? `<p class="muted">Source : ${esc(p.source)}</p>` : ""}${p.message ? `<p><i>${esc(p.message)}</i></p>` : ""}</div>
    <p class="warn">Publiée telle quelle : les tags et les rayons seront à compléter ensuite.</p>`;
}

async function inboxIssue(env, number, comment, reason) {
  const h = {
    Authorization: `Bearer ${env.INBOX_TOKEN}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "eat-it-relay",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const base = `https://api.github.com/repos/${env.INBOX_REPO}/issues/${number}`;
  try {
    await fetch(`${base}/comments`, { method: "POST", headers: h, body: JSON.stringify({ body: comment }) });
    await fetch(base, { method: "PATCH", headers: h, body: JSON.stringify({ state: "closed", state_reason: reason }) });
  } catch {
    /* le suivi de l'issue n'est pas critique */
  }
}

async function apply(env, rec) {
  const p = rec.p;
  const photo = rec.photoId ? await env.IMAGES.get(rec.photoId) : null;
  return publish(env, (text) => {
    const recipes = listRecipes(text);
    if (p.type === "edit") {
      const cur = recipes.find((r) => r.id === p.recipeId);
      if (!cur) throw new Error("Cette recette n'existe plus.");
      const changed = Object.keys(p.changes || {}).length > 0;
      if (!changed && !photo) throw new Error("Cette proposition ne contient aucun changement applicable.");
      const r = applyChanges(cur, p.changes, recipes, !!photo);
      const files = [
        { path: "data/recipes.json", text: replaceRecipe(text, r.id, r) },
        { path: `r/${r.id}/index.html`, text: sharePage(r) },
      ];
      if (photo) files.push({ path: r.image, base64: photo });
      return { message: `Modification via proposition : ${r.title}`, files };
    }
    const r = buildNewRecipe(p, recipes, !!photo);
    const files = [
      { path: "data/recipes.json", text: addRecipe(text, r) },
      { path: `r/${r.id}/index.html`, text: sharePage(r) },
    ];
    if (photo) files.push({ path: `images/${r.id}.jpg`, base64: photo });
    return { message: `Ajout via proposition : ${r.title}`, files };
  });
}

export async function decision(request, env, url, id) {
  const key = `p:${id}`;
  const raw = await env.IMAGES.get(key);
  if (!raw) return page("Introuvable", '<h1>Proposition introuvable</h1><p class="muted">Ce lien a expiré ou n\'existe pas.</p>', 404);
  const rec = JSON.parse(raw);
  const imgUrl = rec.photoId ? `/img/${rec.photoId}.jpg` : "";

  if (request.method === "GET") {
    if (rec.status !== "pending") {
      const label = { approved: "✅ déjà publiée", rejected: "❌ déjà refusée", working: "⏳ en cours de publication" }[rec.status] || "déjà traitée";
      return page("Proposition", `${previewHtml(rec, imgUrl)}<p class="warn">Cette proposition est ${label}.</p>`);
    }
    return page(
      "Valider une proposition",
      `${previewHtml(rec, imgUrl)}<form method="post"><button class="no" name="a" value="reject">Refuser</button><button name="a" value="approve">✅ Valider et publier</button></form>`
    );
  }

  if (request.method !== "POST") return new Response("method", { status: 405 });
  // Le formulaire vient de cette même page : on refuse une requête qui vient d'ailleurs.
  if (request.headers.get("Origin") !== url.origin) return page("Refusé", "<h1>Requête refusée</h1>", 403);
  if (rec.status !== "pending") return page("Proposition", `<h1>Déjà traitée</h1><p class="muted">Statut : ${esc(rec.status)}.</p>`);
  const form = await request.formData();
  const action = form.get("a");

  if (action === "reject") {
    rec.status = "rejected";
    await env.IMAGES.put(key, JSON.stringify(rec), { expirationTtl: RECORD_TTL });
    await inboxIssue(env, rec.issue, "❌ Refusée.", "not_planned");
    return page("Refusée", "<h1>❌ Refusée</h1><p class=\"muted\">Rien n'a été publié.</p>");
  }
  if (action !== "approve") return page("Refusé", "<h1>Requête invalide</h1>", 400);

  rec.status = "working";
  await env.IMAGES.put(key, JSON.stringify(rec), { expirationTtl: RECORD_TTL });
  try {
    const sha = await apply(env, rec);
    rec.status = "approved";
    await env.IMAGES.put(key, JSON.stringify(rec), { expirationTtl: RECORD_TTL });
    await inboxIssue(env, rec.issue, `✅ Publiée (commit ${sha.slice(0, 7)}).`, "completed");
    return page("Publiée", "<h1>✅ Publiée</h1><p class=\"muted\">L'app se met à jour dans environ une minute : ferme-la puis rouvre-la pour voir le changement.</p>");
  } catch (e) {
    rec.status = "pending";
    await env.IMAGES.put(key, JSON.stringify(rec), { expirationTtl: RECORD_TTL });
    return page("Échec", `<h1>Publication impossible</h1><p class="warn">${esc(e.message)}</p><p class="muted">Rien n'a été publié. Tu peux réessayer depuis le lien.</p>`, 500);
  }
}
