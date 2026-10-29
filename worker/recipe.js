// Fabrication et modification des recettes dans data/recipes.json, sans reformater le fichier :
// chaque recette est réécrite dans le style exact du fichier (tableaux de tags sur une ligne,
// un ingrédient par ligne, une étape par ligne).

export const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const KEY_ORDER = [
  "id", "title", "servings", "scalable", "yieldLabel", "time", "image", "imageFocus",
  "categories", "tags", "source", "ingredients", "steps", "notes", "toCheck",
];

const j = JSON.stringify;
const arr = (v) => `[${v.map((x) => j(x)).join(", ")}]`;

function fmtTags(tags) {
  const parts = Object.entries(tags || {}).map(([k, v]) => `${j(k)}: ${arr(v)}`);
  return parts.length ? `{ ${parts.join(", ")} }` : "{}";
}

function fmtIngredient(i) {
  const f = [`"name": ${j(i.name)}`];
  if (i.plural) f.push(`"plural": ${j(i.plural)}`);
  f.push(`"qty": ${j(i.qty)}`, `"unit": ${j(i.unit)}`, `"aisle": ${j(i.aisle)}`);
  return `      { ${f.join(", ")} }`;
}

export function formatRecipe(r) {
  const lines = [];
  for (const k of KEY_ORDER) {
    if (r[k] === undefined) continue;
    const v = r[k];
    if (k === "tags") lines.push(`    "tags": ${fmtTags(v)}`);
    else if (k === "ingredients") lines.push(`    "ingredients": [\n${v.map(fmtIngredient).join(",\n")}\n    ]`);
    else if (k === "steps") lines.push(`    "steps": [\n${v.map((s) => `      ${j(s)}`).join(",\n")}\n    ]`);
    else if (k === "categories") lines.push(`    "categories": ${arr(v)}`);
    else lines.push(`    ${j(k)}: ${j(v)}`);
  }
  return `  {\n${lines.join(",\n")}\n  }`;
}

// Découpe le fichier en entrées (blocs « {…} » en retrait de 2 espaces).
const BLOCK = /^ {2}\{\n[\s\S]*?\n {2}\}/gm;

export function listRecipes(text) {
  const t = text.replace(/\r\n/g, "\n");
  return (t.match(BLOCK) || []).map((b) => JSON.parse(b));
}

export function addRecipe(text, recipe) {
  const crlf = text.includes("\r\n");
  const t = text.replace(/\r\n/g, "\n");
  const end = t.lastIndexOf("\n]");
  if (end < 0) throw new Error("recipes.json: fin introuvable");
  const out = `${t.slice(0, end)},\n${formatRecipe(recipe)}${t.slice(end)}`;
  return crlf ? out.replace(/\n/g, "\r\n") : out;
}

export function replaceRecipe(text, id, recipe) {
  const crlf = text.includes("\r\n");
  const t = text.replace(/\r\n/g, "\n");
  let done = false;
  const out = t.replace(BLOCK, (b) => {
    if (done || JSON.parse(b).id !== id) return b;
    done = true;
    return formatRecipe(recipe);
  });
  if (!done) throw new Error(`recette introuvable : ${id}`);
  return crlf ? out.replace(/\n/g, "\r\n") : out;
}

/* ---------- Ingrédients : « 200 g de spaghetti » → { name, qty, unit, aisle } ---------- */

const UNITS = [
  ["c. à soupe", "c\\. ?à ?soupe|c\\.?à\\.?s|cuill?[èe]res? à soupe"],
  ["c. à café", "c\\. ?à ?caf[ée]|c\\.?à\\.?c|cuill?[èe]res? à caf[ée]"],
  ["kg", "kg|kilos?"],
  ["g", "g|gr|grammes?"],
  ["ml", "ml|millilitres?"],
  ["cl", "cl|centilitres?"],
  ["l", "l|litres?"],
  ["cm", "cm"],
  ["gousse", "gousses?"],
  ["boîte", "bo[iî]tes?"],
  ["bouquet", "bouquets?"],
  ["botte", "bottes?"],
  ["pincée", "pinc[ée]es?"],
  ["feuille", "feuilles?"],
  ["tranche", "tranches?"],
  ["sachet", "sachets?"],
].map(([unit, src]) => [unit, new RegExp(`^(?:${src})(?=\\s|$)`, "i")]);

const FRACTIONS = { "¼": 0.25, "½": 0.5, "¾": 0.75 };

export function buildLibrary(recipes) {
  const lib = new Map();
  for (const r of recipes)
    for (const i of r.ingredients) {
      const entry = { name: i.name, aisle: i.aisle, plural: i.plural };
      lib.set(norm(i.name), lib.get(norm(i.name)) || entry);
      if (i.plural) lib.set(norm(i.plural), lib.get(norm(i.plural)) || entry);
    }
  return lib;
}

function resolve(lib, name) {
  const n = norm(name);
  if (lib.has(n)) return lib.get(n);
  if (/[sx]$/.test(n) && lib.has(n.slice(0, -1))) return lib.get(n.slice(0, -1));
  return null;
}

export function parseIngredient(line, lib) {
  let rest = String(line).replace(/\s+/g, " ").trim();
  let qty = null;
  const m = /^(\d+(?:[.,]\d+)?)?\s?([¼½¾])?\s*/.exec(rest);
  if (m && (m[1] || m[2])) {
    qty = (m[1] ? parseFloat(m[1].replace(",", ".")) : 0) + (m[2] ? FRACTIONS[m[2]] : 0);
    rest = rest.slice(m[0].length);
  }
  let unit = "";
  if (qty !== null) {
    for (const [u, re] of UNITS) {
      const um = re.exec(rest);
      if (!um) continue;
      unit = u;
      rest = rest.slice(um[0].length).trim();
      rest = rest.replace(/^(?:de la |de l['’]|de |d['’]|du |des )/i, "");
      break;
    }
    if (unit === "kg") [unit, qty] = ["g", qty * 1000];
    else if (unit === "l") [unit, qty] = ["ml", qty * 1000];
  }
  const raw = rest.replace(/’/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
  const known = resolve(lib, raw);
  const ing = { name: known ? known.name : raw, qty, unit, aisle: known ? known.aisle : "other" };
  if (known && known.plural) return { name: ing.name, plural: known.plural, qty, unit, aisle: ing.aisle };
  return ing;
}

/* ---------- Nouvelle recette et modification ---------- */

const COURSES = ["repas", "entrée", "apéro", "dessert", "encas", "boisson", "cocktail"];
const nums = (v) => parseInt(String(v || "").replace(/[^0-9]/g, ""), 10) || 0;
const plain = (s) => String(s || "").replace(/[<>]/g, "").trim(); // pas de balises dans les données
const lines = (s) => String(s || "").split("\n").map(plain).filter(Boolean);

export function slugify(title, taken) {
  const base = norm(title).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "recette";
  let id = base;
  for (let k = 2; taken.has(id); k++) id = `${base}-${k}`;
  return id;
}

export function buildNewRecipe(p, recipes, hasPhoto) {
  const lib = buildLibrary(recipes);
  const title = plain(p.title);
  const id = slugify(title, new Set(recipes.map((r) => r.id)));
  const servings = nums(p.servings);
  const time = nums(p.time);
  const notes = [`Proposée via l'app${p.from ? ` par ${plain(p.from)}` : ""}.`];
  if (!servings || !time) notes.push(`${!servings ? "Nombre de personnes" : "Durée"} non précisé : valeur par défaut.`);
  if (p.message) notes.push(plain(p.message));
  const r = {
    id,
    title,
    servings: servings || 2,
    time: time || 30,
    ...(hasPhoto ? { image: `images/${id}.jpg` } : {}),
    categories: [COURSES.includes(p.category) ? p.category : "repas"],
    tags: {},
    ...(/^https?:\/\/\S+$/.test(p.source || "") ? { source: p.source } : {}),
    ingredients: lines(p.ingredients).map((l) => parseIngredient(l, lib)),
    steps: lines(p.steps),
    notes: notes.join(" "),
    toCheck: true,
  };
  return r;
}

// Applique les champs changés d'une proposition de modification. Lève une erreur si la recette a
// changé depuis l'envoi (la valeur « avant » ne correspond plus).
export function applyChanges(recipe, changes, recipes, hasPhoto) {
  const r = { ...recipe };
  const lib = buildLibrary(recipes);
  const stale = (what) => {
    throw new Error(`La recette a changé depuis la proposition (${what}).`);
  };
  const c = changes || {};
  if (c.title) {
    if (r.title !== c.title.before) stale("titre");
    r.title = plain(c.title.after) || r.title;
  }
  if (c.servings) {
    if (String(r.servings) !== c.servings.before) stale("personnes");
    r.servings = nums(c.servings.after) || r.servings;
  }
  if (c.time) {
    if (String(r.time) !== c.time.before) stale("durée");
    r.time = nums(c.time.after) || r.time;
  }
  if (c.category && COURSES.includes(c.category.after)) r.categories = [c.category.after];
  if (c.source) {
    if (/^https?:\/\/\S+$/.test(c.source.after)) r.source = c.source.after;
    else delete r.source;
  }
  if (c.steps) {
    if (r.steps.join("\n") !== c.steps.before) stale("étapes");
    r.steps = lines(c.steps.after);
  }
  if (c.ingredients) {
    const before = lines(c.ingredients.before);
    if (before.length !== r.ingredients.length) stale("ingrédients");
    const kept = new Map(before.map((l, i) => [l, r.ingredients[i]]));
    r.ingredients = lines(c.ingredients.after).map((l) => kept.get(l) || parseIngredient(l, lib));
  }
  if (hasPhoto && !r.image) r.image = `images/${r.id}.jpg`;
  return r;
}

/* ---------- Page de partage (équivalent de tools/build_share_pages.py) ---------- */

const BASE = "https://julien2501.github.io/eat-it/";
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

export function fmtMinutes(m) {
  m = parseInt(m, 10);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
}

export function sharePage(r) {
  const tags = r.tags || {};
  const labels = [];
  for (const k of ["dish", "cuisine", "protein"]) for (const v of tags[k] || []) if (!labels.includes(v)) labels.push(v);
  const description = `${["⏱ " + fmtMinutes(r.time), ...labels.slice(0, 3)].join(" · ")} · recette Eat-it`;
  const image = BASE + (r.image ? r.image : "icons/icon-512.png");
  const t = esc(r.title);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t} · Eat-it</title>
<meta property="og:type" content="article">
<meta property="og:site_name" content="Eat-it">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${BASE}r/${r.id}/">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=../../#/r/${r.id}">
<script>location.replace("../../#/r/${r.id}");</script>
<style>body{font:16px -apple-system,system-ui,sans-serif;text-align:center;padding:48px 16px;color:#241d1a}a{color:#e8590c;font-weight:600}</style>
</head>
<body>
<p>Ouverture de la recette…</p>
<p><a href="../../#/r/${r.id}">Ouvrir « ${t} » dans Eat-it</a></p>
</body>
</html>
`;
}
