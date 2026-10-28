"use strict";

const AISLES = [
  ["produce", "Fruits & légumes", "🥬"],
  ["meat", "Viandes & poissons", "🥩"],
  ["dairy", "Crèmerie & œufs", "🧀"],
  ["pantry", "Épicerie", "🥫"],
  ["bakery", "Boulangerie", "🥖"],
  ["frozen", "Surgelés", "🧊"],
  ["drinks", "Boissons & alcools", "🥤"],
  ["other", "Autre", "🛍️"],
];

// Catégories de plats (navigation principale de l'accueil). Une recette peut être dans plusieurs :
// champ `categories` (tableau). Seules celles qui contiennent au moins une recette sont affichées.
const COURSES = [
  { key: "repas", label: "Repas", emoji: "🍽️" },
  { key: "entrée", label: "Entrées", emoji: "🥗" },
  { key: "apéro", label: "Apéro", emoji: "🥂" },
  { key: "dessert", label: "Desserts", emoji: "🍰" },
  { key: "encas", label: "Encas", emoji: "🍿" },
  { key: "boisson", label: "Boissons", emoji: "🥤" },
  { key: "cocktail", label: "Cocktails", emoji: "🍹" },
];
const courseOf = (r) => r.categories || ["repas"];

// Catégories de filtres : la clé est celle utilisée dans `tags` des recettes (voir SKILL.md).
const FILTERS = [
  { key: "protein", label: "Protéine", emoji: "🍗" },
  { key: "vegetable", label: "Légume", emoji: "🥕" },
  { key: "season", label: "Saison", emoji: "🍂" },
  { key: "dish", label: "Plat", emoji: "🍜" },
  { key: "method", label: "Cuisson", emoji: "🔥" },
  { key: "cuisine", label: "Cuisine", emoji: "🌍" },
];
const SEASONS = [
  ["printemps", "🌸"],
  ["été", "☀️"],
  ["automne", "🍂"],
  ["hiver", "❄️"],
];
const ALL_YEAR = "toute l'année"; // compte comme n'importe quelle saison
const QUICK_MAX_MIN = 25; // « Rapide » : recette de 25 minutes ou moins
const RESHUFFLE_AFTER_MS = 10 * 60 * 1000; // nouvel ordre si l'app revient au premier plan après 10 min

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const DAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];
const DEFAULT_HIDDEN = ["sel", "poivre"]; // basiques masqués de la liste de courses au départ
const FRIDGE_IGNORED = ["sel", "poivre", "huile", "eau"]; // jamais comptés « manquants » pour le frigo

const STORE_KEY = "eatit.v1";
const DRAFT_KEY = "eatit.draft"; // brouillon de proposition, à part de STORE_KEY pour ne pas toucher aux données existantes
// Adresse du relais qui reçoit les propositions (voir worker/README.md). Vide : l'envoi passe par la feuille de partage.
const SUGGEST_URL = "https://eat-it-relay.eatit-julien.workers.dev";
const PHOTO_MAX_BYTES = 400 * 1024;
const SUGGEST_LIMITS = { title: 120, list: 4000, text: 1500, short: 80 };
const MAX_SERVINGS = 50;
// Nombre de personnes affiché par défaut, quelle que soit la portion d'origine de la recette.
const DEFAULT_SERVINGS = 2;
const $app = document.getElementById("app");

const state = {
  recipes: [],
  loading: true,
  error: null,
  view: "recipes", // recipes | plan | shop | suggest | about
  menuOpen: false, // menu ☰ de l'accueil
  suggest: null, // { mode: "new" | "edit", id, sending, sent, f: { champs du formulaire } }
  query: "",
  course: null, // catégorie de plat choisie (null = tout)
  filters: {}, // { catégorie: [valeurs choisies] } : OU dans une catégorie, ET entre catégories
  quick: false,
  favsOnly: false,
  fridgeOpen: false,
  openCat: null, // catégorie dont les choix sont dépliés
  rank: {}, // { recipeId: position } : ordre d'affichage aléatoire de la session
  openId: null,
  detailServings: null,
  cook: null, // { id, step, ing } : mode cuisine
  lastCook: null,
  timers: [], // { id, label, end, done } : minuteurs du mode cuisine
  pantryOpen: false,
  shopMode: "aisle", // aisle | recipe : liste de courses par rayon ou par recette
  // --- données de l'utilisateur, enregistrées sur le téléphone ---
  plan: {}, // { recipeId: nombre de personnes }
  planDay: {}, // { recipeId: 0..6 } (0 = lundi)
  checked: {}, // { clé d'ingrédient: true }
  favs: {}, // { recipeId: true }
  journal: {}, // { recipeId: { rating, note, cooked: [dates ISO] } }
  extras: [], // articles ajoutés à la main dans la liste de courses : { id, text, done }
  hidden: [...DEFAULT_HIDDEN], // noms normalisés d'ingrédients masqués de la liste de courses
  fridge: [], // ingrédients que j'ai déjà
};

/* ---------- Persistance (état de l'utilisateur, jamais les recettes) ---------- */

const persistable = () => ({
  plan: state.plan,
  planDay: state.planDay,
  checked: state.checked,
  favs: state.favs,
  journal: state.journal,
  extras: state.extras,
  hidden: state.hidden,
  fridge: state.fridge,
  shopMode: state.shopMode,
});

function applySaved(s) {
  state.plan = s.plan || {};
  state.planDay = s.planDay || {};
  state.checked = s.checked || {};
  state.favs = s.favs || {};
  state.journal = s.journal || {};
  state.extras = Array.isArray(s.extras) ? s.extras : [];
  state.hidden = Array.isArray(s.hidden) ? s.hidden : [...DEFAULT_HIDDEN];
  state.fridge = Array.isArray(s.fridge) ? s.fridge : [];
  state.shopMode = s.shopMode === "recipe" ? "recipe" : "aisle";
}

function loadState() {
  try {
    applySaved(JSON.parse(localStorage.getItem(STORE_KEY) || "{}"));
  } catch {
    /* localStorage indisponible : l'app marche sans mémoire */
  }
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(persistable()));
  } catch {
    /* idem */
  }
}

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 400);
}

/* ---------- Utilitaires ---------- */

const byId = (id) => state.recipes.find((r) => r.id === id);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const norm = (s) =>
  s
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

function toast(msg) {
  try {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  } catch {
    /* pas de DOM : rien à afficher */
  }
}

function fmtQty(q) {
  if (q == null) return "";
  let r = q >= 10 ? Math.round(q) : Math.round(q * 4) / 4;
  r = Math.max(r, 0.25);
  const whole = Math.floor(r);
  const frac = { 0: "", 0.25: "¼", 0.5: "½", 0.75: "¾" }[r - whole];
  return `${whole || ""}${frac}`;
}

const ASPIRATED_H = /^h(aricot|ach|areng|amburger|omard|ollandaise)/i;

// Pièces sans unité : « 2 oignons ». Pluriel auto pour un nom simple, sinon champ `plural` de la recette.
function pluralName(name, plural) {
  if (plural) return plural;
  return /^[\p{L}œ]+$/u.test(name) && !/[sxz]$/.test(name) ? `${name}s` : name;
}

function ingText(name, qty, unit, plural) {
  name = name.replace(/'/g, "’");
  const q = fmtQty(qty);
  if (!q) return name;
  if (!unit) return `${q} ${qty > 1 ? pluralName(name, plural) : name}`;
  // « boîte » → « boîtes » si plusieurs ; les abréviations (g, ml, c. à soupe) ne changent pas.
  const u = qty > 1 && /^[a-zéèêôîâ]{3,}$/i.test(unit) ? `${unit}s` : unit;
  const elide = /^[aeiouyàâéèêëîïôöûüœ]/i.test(name) || (/^h/i.test(name) && !ASPIRATED_H.test(name));
  return `${q} ${u} ${elide ? "d’" : "de "}${name}`;
}

const unitLabel = (qty, unit) => (qty > 1 && /^[a-zéèêôîâ]{3,}$/i.test(unit) ? `${unit}s` : unit);

function deName(name) {
  name = name.replace(/'/g, "’");
  const elide = /^[aeiouyàâéèêëîïôöûüœ]/i.test(name) || (/^h/i.test(name) && !ASPIRATED_H.test(name));
  return `${elide ? "d’" : "de "}${name}`;
}

function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}

const fmtDate = (iso) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
const todayIdx = () => (new Date().getDay() + 6) % 7; // 0 = lundi

/* ---------- Images ---------- */

const hue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const placeholder = (id, cls) => `<div class="${cls} ph" style="--h:${hue(id)}">🍽️</div>`;

// Photo de la recette, ou dégradé coloré si elle n'en a pas (ou si elle ne charge pas hors ligne).
function imgHtml(r, cls = "thumb") {
  if (!r.image) return placeholder(r.id, cls);
  const focus = r.imageFocus ? ` style="object-position:${esc(r.imageFocus)}"` : "";
  return `<img class="${cls}" src="${esc(r.image)}" alt="" loading="lazy" data-fallback="${esc(r.id)}"${focus}>`;
}

$app.addEventListener(
  "error",
  (e) => {
    const img = e.target;
    if (img.tagName !== "IMG" || !img.dataset.fallback) return;
    img.outerHTML = placeholder(img.dataset.fallback, img.className);
  },
  true
);

/* ---------- Liste de courses ---------- */

// Regroupe les unités qui se convertissent sans deviner (cl→ml, kg→g, c. à café→c. à soupe),
// seulement si l'autre unité est déjà présente : « 4 c. à café » + « 2 c. à soupe » → « 3⅓ c. à soupe ».
function mergeUnits(parts) {
  const p = new Map(parts);
  const move = (from, to, mult) => {
    if (p.has(from) && p.has(to)) {
      p.set(to, p.get(to) + p.get(from) * mult);
      p.delete(from);
    }
  };
  move("cl", "ml", 10);
  move("l", "ml", 1000);
  move("kg", "g", 1000);
  move("c. à café", "c. à soupe", 1 / 3);
  return [...p.entries()].map(([unit, qty]) => ({ unit, qty }));
}

// Un seul article par produit, même si les recettes le comptent en unités différentes
// (« 25 g + 1 c. à soupe de sauce soja »). La clé (nom normalisé) sert aux cases cochées.
function shoppingList() {
  const map = new Map();
  for (const [id, servings] of Object.entries(state.plan)) {
    const r = byId(id);
    if (!r) continue;
    const factor = servings / r.servings;
    for (const ing of r.ingredients) {
      const key = norm(ing.name);
      let e = map.get(key);
      if (!e) {
        e = { key, name: ing.name, plural: ing.plural, aisle: ing.aisle || "other", raw: new Map(), from: new Set() };
        map.set(key, e);
      }
      if (ing.qty != null) {
        const u = ing.unit || "";
        e.raw.set(u, (e.raw.get(u) || 0) + ing.qty * factor);
      }
      e.from.add(r.title);
    }
  }
  return [...map.values()].map((e) => ({ ...e, parts: mergeUnits(e.raw) }));
}

const ALWAYS_HIDDEN = ["eau"]; // jamais dans la liste de courses (robinet)
const hiddenName = (name) => ALWAYS_HIDDEN.includes(norm(name)) || state.hidden.includes(norm(name));
const isHidden = (i) => hiddenName(i.name);
const rowsFor = (items, key) =>
  items.filter((i) => i.aisle === key || (!AISLES.some(([k]) => k === i.aisle) && key === "other"));
function itemText(i) {
  const withUnit = i.parts.filter((p) => p.unit);
  const pieces = i.parts.filter((p) => !p.unit);
  if (!i.parts.length) return i.name.replace(/'/g, "’");
  if (!withUnit.length) return ingText(i.name, pieces.reduce((n, p) => n + p.qty, 0), "", i.plural);
  if (!pieces.length) {
    if (withUnit.length === 1) return ingText(i.name, withUnit[0].qty, withUnit[0].unit, i.plural);
    const qs = withUnit.map((p) => `${fmtQty(p.qty)} ${unitLabel(p.qty, p.unit)}`).join(" + ");
    return `${qs} ${deName(i.name)}`;
  }
  return i.parts.map((p) => ingText(i.name, p.qty, p.unit, i.plural)).join(" + ");
}

function shopText() {
  const items = shoppingList().filter((i) => !isHidden(i));
  const lines = ["🛒 Liste de courses"];
  const extras = state.extras.filter((e) => !e.done);
  if (extras.length) {
    lines.push("", "✍️ Mes ajouts");
    extras.forEach((e) => lines.push(`• ${e.text}`));
  }
  for (const [key, label, ico] of AISLES) {
    const rows = rowsFor(items, key)
      .filter((i) => !state.checked[i.key])
      .sort((a, b) => a.name.localeCompare(b.name, "fr"));
    if (!rows.length) continue;
    lines.push("", `${ico} ${label}`);
    rows.forEach((i) => lines.push(`• ${itemText(i)}`));
  }
  return lines.join("\n");
}

/* ---------- Frigo : ce que j'ai déjà ---------- */

const isIgnored = (name) => FRIDGE_IGNORED.some((b) => norm(name).startsWith(b));

function termMatches(term, name) {
  const t = norm(term);
  const n = norm(name);
  if (!t) return false;
  return n.includes(t) || (t.length > 3 && t.endsWith("s") && n.includes(t.slice(0, -1)));
}

function fridgeScore(r) {
  const ings = r.ingredients.filter((i) => !isIgnored(i.name));
  const have = ings.filter((i) => state.fridge.some((t) => termMatches(t, i.name))).length;
  return { have, total: ings.length };
}

/* ---------- Vues : accueil ---------- */

function shuffleOrder() {
  const ids = state.recipes.map((r) => r.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  state.rank = Object.fromEntries(ids.map((id, i) => [id, i]));
}

const tagValues = (r, key) => (r.tags && r.tags[key]) || [];
const activeCount = () =>
  Object.values(state.filters).reduce((n, v) => n + v.length, 0) +
  (state.quick ? 1 : 0) +
  (state.favsOnly ? 1 : 0) +
  (state.fridge.length ? 1 : 0);

// Une recette correspond-elle à la sélection ? `except` ignore un critère (une catégorie de filtre,
// "quick" ou "favs") pour calculer ce que donnerait un autre choix dans cette catégorie.
function matchesExcept(r, except) {
  if (state.course && !courseOf(r).includes(state.course)) return false;
  for (const { key } of FILTERS) {
    if (key === except) continue;
    const chosen = state.filters[key];
    if (!chosen || !chosen.length) continue;
    const have = tagValues(r, key);
    const ok = chosen.some((v) => have.includes(v) || (key === "season" && have.includes(ALL_YEAR)));
    if (!ok) return false;
  }
  if (except !== "quick" && state.quick && r.time > QUICK_MAX_MIN) return false;
  if (except !== "favs" && state.favsOnly && !state.favs[r.id]) return false;
  if (state.fridge.length && fridgeScore(r).have === 0) return false;
  const q = norm(state.query);
  if (!q) return true;
  const hay = norm([r.title, ...Object.values(r.tags || {}).flat(), ...r.ingredients.map((i) => i.name)].join(" "));
  return hay.includes(q);
}

const recipeMatches = (r) => matchesExcept(r, null);

// Étiquettes affichées sur une recette : plat, cuisine puis protéine.
function pillsHtml(r, max) {
  const labels = [...new Set([...tagValues(r, "dish"), ...tagValues(r, "cuisine"), ...tagValues(r, "protein")])].slice(0, max);
  return `<span class="pill">⏱ ${fmtMinutes(r.time)}</span>${labels.map((l) => `<span class="pill plain">${esc(l)}</span>`).join("")}`;
}

const heartBtn = (r, cls = "") =>
  `<button class="heart ${cls} ${state.favs[r.id] ? "on" : ""}" data-action="fav" data-id="${esc(r.id)}"
    aria-label="${state.favs[r.id] ? "Retirer des favoris" : "Ajouter aux favoris"}">${state.favs[r.id] ? "♥" : "♡"}</button>`;

function feedHtml() {
  const items = state.recipes.filter(recipeMatches);
  if (state.fridge.length) {
    const ratio = (r) => {
      const s = fridgeScore(r);
      return s.have / Math.max(1, s.total);
    };
    items.sort((a, b) => ratio(b) - ratio(a) || fridgeScore(b).have - fridgeScore(a).have || state.rank[a.id] - state.rank[b.id]);
  } else {
    items.sort((a, b) => state.rank[a.id] - state.rank[b.id]);
  }
  const bar = `<div class="listbar"><span>${plural(items.length, "recette", "recettes")}${state.fridge.length ? " · triées selon ton frigo" : ""}</span>
    <button class="shuffle" data-action="shuffle">🔀 Mélanger</button></div>`;
  if (!items.length) return `${bar}<p class="empty"><span class="big">🔍</span>Aucune recette ne correspond.</p>`;
  return `${bar}<ul class="feed">${items
    .map((r) => {
      const inPlan = r.id in state.plan;
      const rating = journalOf(r.id).rating;
      const fr = state.fridge.length ? fridgeScore(r) : null;
      const extra =
        (fr ? `<span class="pill fridge">🧊 ${fr.have}/${fr.total}</span>` : "") +
        (rating ? `<span class="pill star">★ ${rating}</span>` : "");
      return `<li class="rcard">
        ${heartBtn(r)}
        <button class="fab ${inPlan ? "on" : ""}" data-action="${inPlan ? "remove" : "add"}" data-id="${esc(r.id)}"
          aria-label="${inPlan ? "Retirer de la semaine" : "Ajouter à la semaine"}">${inPlan ? "✓" : "+"}</button>
        <button class="open" data-action="open" data-id="${esc(r.id)}">
          ${imgHtml(r)}
          <div class="body">
            <div class="title">${esc(r.title)}</div>
            <div class="pills">${pillsHtml(r, 2)}${extra}</div>
          </div>
        </button>
      </li>`;
    })
    .join("")}</ul>`;
}

// Choix d'une catégorie de filtre avec, pour chacun, le nombre de recettes qu'il donnerait
// (les autres critères restent appliqués). `useful` : la catégorie sert à trier la sélection en cours.
function filterChoices(key) {
  const pool = state.recipes.filter((r) => matchesExcept(r, key));
  const chosen = state.filters[key] || [];
  const countOf = (pred) => pool.filter(pred).length;
  let choices;
  if (key === "season") {
    const specific = pool.some((r) => tagValues(r, "season").some((s) => s !== ALL_YEAR));
    choices = specific
      ? SEASONS.map(([name, emoji]) => ({
          value: name,
          label: `${emoji} ${name}`,
          count: countOf((r) => tagValues(r, "season").includes(name) || tagValues(r, "season").includes(ALL_YEAR)),
        }))
      : [];
  } else {
    const values = new Set(pool.flatMap((r) => tagValues(r, key)));
    choices = [...values]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .map((v) => ({ value: v, label: v, count: countOf((r) => tagValues(r, key).includes(v)) }));
  }
  choices = choices.filter((c) => c.count > 0 || chosen.includes(c.value));
  const useful = chosen.length > 0 || choices.some((c) => c.count < pool.length);
  return { choices, useful };
}

function filtersHtml() {
  const cats = FILTERS.map((f) => ({ ...f, ...filterChoices(f.key) })).filter((c) => c.useful && c.choices.length);
  const pills = cats
    .map(({ key, label, emoji }) => {
      const n = (state.filters[key] || []).length;
      return `<button class="cat ${n ? "on" : ""} ${state.openCat === key ? "open" : ""}" data-action="cat" data-cat="${key}">${emoji} ${label}${n ? `<b>${n}</b>` : ""}</button>`;
    })
    .join("");
  // « Rapide » et « Favoris » n'apparaissent que s'ils permettent de trier la sélection.
  const poolQ = state.recipes.filter((r) => matchesExcept(r, "quick"));
  const quickN = poolQ.filter((r) => r.time <= QUICK_MAX_MIN).length;
  const poolF = state.recipes.filter((r) => matchesExcept(r, "favs"));
  const favN = poolF.filter((r) => state.favs[r.id]).length;
  const extras =
    (state.quick || (quickN > 0 && quickN < poolQ.length)
      ? `<button class="cat ${state.quick ? "on" : ""}" data-action="quick">⚡ Rapide</button>`
      : "") +
    (state.favsOnly || (favN > 0 && favN < poolF.length)
      ? `<button class="cat ${state.favsOnly ? "on" : ""}" data-action="favs">♥ Favoris<b>${favN}</b></button>`
      : "");
  const reset = activeCount() ? `<button class="cat reset" data-action="reset">✕ Réinitialiser</button>` : "";
  const open = cats.find((c) => c.key === state.openCat);
  const panel = open
    ? `<div class="panel">${open.choices
        .map(({ value, label, count }) => {
          const on = (state.filters[open.key] || []).includes(value);
          return `<button class="chip ${on ? "on" : ""}" data-action="tag" data-cat="${open.key}" data-tag="${esc(value)}">${esc(label)}<i>${count}</i></button>`;
        })
        .join("")}</div>`
    : "";
  if (!pills && !extras && !reset) return "";
  return `<div class="cats small">${pills}${extras}${reset}</div>${panel}`;
}

function fridgePanelHtml() {
  if (!state.fridgeOpen) return "";
  return `<div class="panel fridge-panel">
    <div class="addrow"><input id="fridge-in" type="text" placeholder="Un ingrédient que j'ai (poulet, riz…)" autocomplete="off">
      <button data-action="fridge-add">Ajouter</button></div>
    ${state.fridge.length ? `<div class="fridge-chips">${state.fridge.map((t) => `<button class="chip on" data-action="fridge-del" data-term="${esc(t)}">${esc(t)} ✕</button>`).join("")}</div>` : ""}
    <p class="muted small">Les recettes qui utilisent le plus d’ingrédients que tu as déjà passent en premier. Sel, poivre, huile et eau ne comptent pas.</p>
  </div>`;
}

function coursesHtml() {
  const count = (key) => state.recipes.filter((r) => courseOf(r).includes(key)).length;
  const present = COURSES.filter(({ key }) => count(key));
  if (present.length < 2) return "";
  const all = `<button class="course ${state.course ? "" : "on"}" data-action="course" data-course="">Tout</button>`;
  const pills = present
    .map(
      ({ key, label, emoji }) =>
        `<button class="course ${state.course === key ? "on" : ""}" data-action="course" data-course="${key}">${emoji} ${label}<i>${count(key)}</i></button>`
    )
    .join("");
  return `<div class="courses">${all}${pills}</div>`;
}

function recipesView() {
  const narrowed = activeCount() || state.course;
  return `<div class="brand"><div class="logo">🍽️</div><div class="name">Eat-it</div>
    <button class="menubtn" data-action="menu" aria-label="Menu" aria-expanded="${state.menuOpen}">${state.menuOpen ? "✕" : "☰"}</button></div>
    ${state.menuOpen ? `<div class="menu"><button data-action="suggest-new">✍️ Proposer une recette</button><button data-action="about">ℹ️ À propos</button></div>` : ""}
    <input id="q" class="search" type="search" placeholder="Rechercher une recette, un ingrédient…" value="${esc(state.query)}">
    ${coursesHtml()}
    ${filtersHtml()}
    <div class="actions">
      <button class="surprise" data-action="random"><span class="dice">🎲</span><div><b>Pas d’idée ?</b><span>${narrowed ? "Dans la sélection" : "Au hasard"}</span></div></button>
      <button class="fridgebtn ${state.fridge.length || state.fridgeOpen ? "on" : ""}" data-action="fridge"><span class="dice">🧊</span><div><b>Mon frigo</b><span>${state.fridge.length ? plural(state.fridge.length, "ingrédient", "ingrédients") : "Ce que j’ai déjà"}</span></div></button>
    </div>
    ${fridgePanelHtml()}
    <div id="feed">${feedHtml()}</div>`;
}

/* ---------- Vues : fiche recette ---------- */

function stepperHtml(id, servings) {
  return `<div class="stepper">
    <button data-action="step" data-id="${esc(id)}" data-delta="-1" aria-label="Moins de personnes">−</button>
    <span>${plural(servings, "personne", "personnes")}</span>
    <button data-action="step" data-id="${esc(id)}" data-delta="1" aria-label="Plus de personnes">+</button>
  </div>`;
}

// Recette à quantités fixes (gâteau, cake…) : on ne l'ajuste pas au nombre de personnes.
const isFixed = (r) => r.scalable === false;

function currentServings(r) {
  if (isFixed(r)) return r.servings;
  return state.plan[r.id] ?? state.detailServings ?? DEFAULT_SERVINGS;
}

function servingsLabel(r, n) {
  return isFixed(r) ? `${n} ${r.yieldLabel || "parts"}` : plural(n, "personne", "personnes");
}

function servingsControl(r, n) {
  return isFixed(r) ? `<div class="fixed-yield">${esc(servingsLabel(r, n))}</div>` : stepperHtml(r.id, n);
}

const journalOf = (id) => state.journal[id] || { rating: 0, note: "", cooked: [] };
const ensureJournal = (id) => (state.journal[id] ||= { rating: 0, note: "", cooked: [] });

function avisHtml(r) {
  const j = journalOf(r.id);
  const stars = [1, 2, 3, 4, 5]
    .map((n) => `<button class="${j.rating >= n ? "on" : ""}" data-action="rate" data-id="${esc(r.id)}" data-n="${n}" aria-label="${n} sur 5">★</button>`)
    .join("");
  const last = j.cooked[j.cooked.length - 1];
  const cooked = j.cooked.length ? `Cuisiné ${j.cooked.length} fois · dernière fois le ${fmtDate(last)}` : "Pas encore cuisiné";
  return `<h2>Mon avis</h2>
    <div class="avis">
      <div class="stars">${stars}</div>
      <textarea class="note" data-note="${esc(r.id)}" placeholder="Mes notes : ajustements, astuces, ce que j'ai changé…">${esc(j.note)}</textarea>
      <div class="cooked-row"><button class="btn soft" data-action="cooked" data-id="${esc(r.id)}">✓ Je l’ai cuisiné</button>
        <span class="muted">${cooked}</span></div>
    </div>`;
}

function detailView(r) {
  const servings = currentServings(r);
  const factor = servings / r.servings;
  const seasons = tagValues(r, "season").filter((s) => s !== ALL_YEAR);
  const seasonPill = seasons.length
    ? `<span class="pill plain">${seasons.map((s) => (SEASONS.find(([n]) => n === s) || [, ""])[1] + " " + s).join(" · ")}</span>`
    : "";
  return `<div class="hero">${imgHtml(r)}<button class="back" data-action="close" aria-label="Retour">‹</button>${heartBtn(r, "hero-heart")}<button class="heart hero-share" data-action="share-recipe" data-id="${esc(r.id)}" aria-label="Partager la recette">⤴</button></div>
    <div class="sheet">
      <h1>${esc(r.title)}</h1>
      <div class="pills">${pillsHtml(r, 6)}${seasonPill}</div>
      <div class="servings-card"><b>${isFixed(r) ? "Donne" : "Pour"}</b>${servingsControl(r, servings)}</div>
      <button class="btn cookbtn" data-action="cook" data-id="${esc(r.id)}">👨‍🍳 Mode cuisine</button>
      <h2>Ingrédients</h2>
      <ul class="ingredients">${r.ingredients
        .map((i) => `<li>${esc(ingText(i.name, i.qty == null ? null : i.qty * factor, i.unit, i.plural))}</li>`)
        .join("")}</ul>
      <h2>Préparation</h2>
      <ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      ${r.notes ? `<p class="notes">${esc(r.notes)}</p>` : ""}
      ${r.source ? `<a class="source" href="${esc(r.source)}" target="_blank" rel="noopener">Voir la source ↗</a>` : ""}
      ${avisHtml(r)}
      <button class="linkbtn" data-action="suggest-edit" data-id="${esc(r.id)}">✏️ Suggérer une modification</button>
    </div>`;
}

function ctaBar(r) {
  const inPlan = r.id in state.plan;
  const servings = currentServings(r);
  return `<div class="cta"><div>
    <button class="btn ${inPlan ? "soft" : ""}" data-action="${inPlan ? "remove" : "add"}" data-id="${esc(r.id)}" data-servings="${servings}">
      ${inPlan ? "✓ Dans la semaine · retirer" : `Ajouter à la semaine · ${servingsLabel(r, servings)}`}
    </button></div></div>`;
}

/* ---------- Mode cuisine (étapes en grand, écran allumé, minuteurs) ---------- */

let wakeLock = null;
async function requestWake() {
  try {
    if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    /* non disponible : l'écran pourra se mettre en veille */
  }
}
function releaseWake() {
  try {
    if (wakeLock) wakeLock.release();
  } catch {
    /* ignore */
  }
  wakeLock = null;
}

// Durées citées dans une étape : « 5 à 6 minutes », « 1 heure », « 30 secondes »… (la plus courte est retenue).
function detectTimers(text) {
  const out = [];
  const seen = new Set();
  const re = /(\d+)(?:\s*(?:à|-|–)\s*\d+)?\s*(heures?|h|minutes?|min|secondes?)\b/gi;
  let m;
  while ((m = re.exec(text))) {
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    const seconds = u.startsWith("h") ? n * 3600 : u.startsWith("s") ? n : n * 60;
    const label = m[0].trim();
    if (!seconds || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, seconds });
  }
  return out;
}

const fmtClock = (s) => {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h ? h + ":" + String(m).padStart(2, "0") : m}:${String(sec).padStart(2, "0")}`;
};

function timersInner() {
  const now = Date.now();
  return state.timers
    .map((t) => {
      const left = (t.end - now) / 1000;
      return `<div class="tchip ${t.done ? "done" : ""}"><b>${t.done ? "Terminé !" : fmtClock(left)}</b><span>${esc(t.label)}</span>
        <button data-action="timer-del" data-tid="${t.id}" aria-label="Arrêter">✕</button></div>`;
    })
    .join("");
}

function cookView(r) {
  const c = state.cook;
  const n = r.steps.length;
  const i = clamp(c.step, 0, n - 1);
  const servings = currentServings(r);
  const factor = servings / r.servings;
  const timers = detectTimers(r.steps[i])
    .map(
      (t) => `<button class="tstart" data-action="timer-start" data-sec="${t.seconds}" data-label="Étape ${i + 1} · ${esc(t.label)}">⏱ Lancer ${esc(t.label)}</button>`
    )
    .join("");
  const body = c.ing
    ? `<ul class="ingredients cook-ing">${r.ingredients
        .map((g) => `<li>${esc(ingText(g.name, g.qty == null ? null : g.qty * factor, g.unit, g.plural))}</li>`)
        .join("")}</ul>`
    : `<p class="cook-step">${esc(r.steps[i])}</p><div class="tstarts">${timers}</div>`;
  const last = i === n - 1;
  return `<div class="cook">
    <header class="cook-top">
      <button class="cook-x" data-action="cook-exit" aria-label="Quitter le mode cuisine">✕</button>
      <div class="cook-title"><b>${esc(r.title)}</b><small>Étape ${i + 1} sur ${n}</small></div>
      <button class="cook-ingbtn ${c.ing ? "on" : ""}" data-action="cook-ing" aria-label="Ingrédients">🧾</button>
    </header>
    <div class="cook-progress"><i style="width:${((i + 1) / n) * 100}%"></i></div>
    <div id="timers" class="timers">${timersInner()}</div>
    <main class="cook-body" id="cookbody">${body}</main>
    <footer class="cook-nav">
      <button data-action="cook-prev" ${i === 0 ? "disabled" : ""}>‹ Précédent</button>
      <button class="next" data-action="${last ? "cook-exit" : "cook-next"}">${last ? "Terminé ✓" : "Suivant ›"}</button>
    </footer>
  </div>`;
}

let tickHandle = null;
let audioCtx = null;

function ensureAudio() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {
    /* pas de son */
  }
}

function alarm() {
  try {
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
    if (!audioCtx) return;
    for (let k = 0; k < 4; k++) {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = 880;
      o.connect(g);
      g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + k * 0.45;
      g.gain.setValueAtTime(0.25, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.start(t);
      o.stop(t + 0.4);
    }
  } catch {
    /* ignore */
  }
}

function tick() {
  const now = Date.now();
  let rang = false;
  for (const t of state.timers) {
    if (!t.done && now >= t.end) {
      t.done = true;
      rang = true;
    }
  }
  if (rang) alarm();
  const el = document.getElementById("timers");
  if (el) el.innerHTML = timersInner();
  const pill = document.getElementById("tpill");
  if (pill) pill.innerHTML = timerPillInner();
  if (!state.timers.length && tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function timerPillInner() {
  const active = state.timers.filter((t) => !t.done);
  const done = state.timers.some((t) => t.done);
  if (done) return `⏰ Minuteur terminé · voir`;
  const next = active.sort((a, b) => a.end - b.end)[0];
  return `⏱ ${fmtClock((next.end - Date.now()) / 1000)} · ${active.length > 1 ? active.length + " minuteurs" : "voir"}`;
}

const timerPill = () =>
  state.timers.length && state.lastCook
    ? `<button id="tpill" class="timerpill ${state.timers.some((t) => t.done) ? "ring" : ""}" data-action="cook-resume">${timerPillInner()}</button>`
    : "";

/* ---------- Vues : semaine ---------- */

function dayPickerHtml(id) {
  const cur = state.planDay[id];
  return `<div class="dayrow">${DAY_LETTERS.map(
    (l, d) =>
      `<button class="dayb ${cur === d ? "on" : ""} ${todayIdx() === d ? "today" : ""}" data-action="day" data-id="${esc(id)}" data-day="${d}" aria-label="${DAYS[d]}">${l}</button>`
  ).join("")}</div>`;
}

function planCard(r) {
  return `<li class="prow">
    ${imgHtml(r)}
    <div class="info">
      <button class="title" data-action="open" data-id="${esc(r.id)}">${esc(r.title)}</button>
      ${servingsControl(r, state.plan[r.id])}
      ${dayPickerHtml(r.id)}
    </div>
    <button class="x" data-action="remove" data-id="${esc(r.id)}" aria-label="Retirer">×</button>
  </li>`;
}

function planView() {
  const ids = Object.keys(state.plan).filter(byId);
  if (!ids.length) {
    return `<h1>Ma semaine</h1><p class="empty"><span class="big">📅</span>Aucune recette choisie.<br>Ajoute-en depuis l’onglet Recettes avec le bouton +.</p>`;
  }
  const total = ids.reduce((n, id) => n + (isFixed(byId(id)) ? 0 : state.plan[id]), 0);
  const placed = DAYS.map((name, d) => ({ d, name, list: ids.filter((id) => state.planDay[id] === d) })).filter((g) => g.list.length);
  const loose = ids.filter((id) => !(id in state.planDay));
  const section = (title, list) =>
    `${title ? `<h3 class="daytitle">${title}</h3>` : ""}<ul class="plan">${list.map((id) => planCard(byId(id))).join("")}</ul>`;
  const groups =
    placed.map((g) => section(g.name + (g.d === todayIdx() ? " · aujourd’hui" : ""), g.list)).join("") +
    (loose.length ? section(placed.length ? "Pas encore placé" : "", loose) : "");
  return `<h1>Ma semaine</h1>
    <p class="muted">${plural(ids.length, "recette", "recettes")} · ${plural(total, "repas", "repas")} au total. Touche une lettre pour choisir le jour.</p>
    ${groups}
    <button class="btn" data-action="tab" data-view="shop">🛒 Voir la liste de courses</button>
    <button class="btn soft" data-action="clear-plan">Vider la semaine</button>`;
}

/* ---------- Vues : courses ---------- */

function pantryHtml(all) {
  const names = new Map();
  for (const i of all) names.set(norm(i.name), i.name);
  const chips = [...names.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "fr"))
    .map(
      ([n, label]) =>
        `<button class="chip ${state.hidden.includes(n) ? "on" : ""}" data-action="pantry-toggle" data-name="${esc(n)}">${esc(label)}</button>`
    )
    .join("");
  return `<div class="panel pantry"><p class="muted small">Touche ce que tu as déjà à la maison : ça disparaît de la liste.</p><div class="fridge-chips">${chips || "<span class='muted'>Rien à afficher.</span>"}</div></div>`;
}

function shopByRecipeHtml() {
  const ids = Object.keys(state.plan)
    .filter(byId)
    .sort((a, b) => (state.planDay[a] ?? 9) - (state.planDay[b] ?? 9) || byId(a).title.localeCompare(byId(b).title, "fr"));
  return ids
    .map((id) => {
      const r = byId(id);
      const factor = state.plan[id] / r.servings;
      const rows = r.ingredients
        .filter((g) => !hiddenName(g.name))
        .map((g) => {
          const key = norm(g.name);
          const text = ingText(g.name, g.qty == null ? null : g.qty * factor, g.unit, g.plural);
          return `<li><button class="row ${state.checked[key] ? "done" : ""}" data-action="check" data-key="${esc(key)}">
            <span class="box">✓</span><span class="label">${esc(text)}</span></button></li>`;
        })
        .join("");
      return `<div class="aisle"><span>🍽️</span>${esc(r.title)} · ${esc(servingsLabel(r, state.plan[id]))}</div><ul class="shop">${rows}</ul>`;
    })
    .join("");
}

function shopView() {
  const all = shoppingList();
  const items = all.filter((i) => !isHidden(i));
  const hiddenN = all.length - items.length;
  const extras = state.extras;
  const doneN = items.filter((i) => state.checked[i.key]).length + extras.filter((e) => e.done).length;
  const totalN = items.length + extras.length;

  const addRow = `<div class="addrow"><input id="extra-in" type="text" placeholder="Ajouter un article (lait, papier toilette…)" autocomplete="off">
    <button data-action="extra-add">Ajouter</button></div>`;
  const bar = `<div class="shopbar">
    <button data-action="share">📤 Partager</button>
    <button class="${state.pantryOpen ? "on" : ""}" data-action="pantry">🏠 J’ai déjà${hiddenN ? ` (${hiddenN})` : ""}</button></div>${state.pantryOpen ? pantryHtml(all) : ""}`;
  const seg = items.length
    ? `<div class="seg"><button class="${state.shopMode === "aisle" ? "on" : ""}" data-action="shop-mode" data-mode="aisle">Par rayon</button>
        <button class="${state.shopMode === "recipe" ? "on" : ""}" data-action="shop-mode" data-mode="recipe">Par recette</button></div>`
    : "";

  const extrasHtml = extras.length
    ? `<div class="aisle"><span>✍️</span>Mes ajouts</div><ul class="shop">${extras
        .map(
          (e) => `<li class="withx"><button class="row ${e.done ? "done" : ""}" data-action="extra-check" data-id="${e.id}">
            <span class="box">✓</span><span class="label">${esc(e.text)}</span></button>
            <button class="x" data-action="extra-del" data-id="${e.id}" aria-label="Supprimer">×</button></li>`
        )
        .join("")}</ul>`
    : "";

  const byAisle = AISLES.map(([key, label, ico]) => {
    const rows = rowsFor(items, key).sort(
      (a, b) => !!state.checked[a.key] - !!state.checked[b.key] || a.name.localeCompare(b.name, "fr")
    );
    if (!rows.length) return "";
    return `<div class="aisle"><span>${ico}</span>${label}</div><ul class="shop">${rows
      .map((i) => {
        const isDone = !!state.checked[i.key];
        const from = i.from.size > 1 ? `<span class="from">${esc([...i.from].join(", "))}</span>` : "";
        return `<li><button class="row ${isDone ? "done" : ""}" data-action="check" data-key="${esc(i.key)}">
          <span class="box">✓</span><span class="label">${esc(itemText(i))}${from}</span></button></li>`;
      })
      .join("")}</ul>`;
  }).join("");
  const groups = state.shopMode === "recipe" ? shopByRecipeHtml() : byAisle;

  const empty = !totalN
    ? `<p class="empty"><span class="big">🛒</span>La liste est vide.<br>Choisis des recettes pour la semaine, ou ajoute un article ci-dessus.</p>`
    : "";
  const progress = totalN
    ? `<p class="muted">${doneN} sur ${totalN} dans le panier</p><div class="progress"><i style="width:${(doneN / totalN) * 100}%"></i></div>`
    : "";
  const cleanup =
    (doneN ? `<div style="height:20px"></div><button class="btn soft" data-action="uncheck-all">Tout décocher</button>` : "") +
    (extras.some((e) => e.done) ? `<button class="btn soft" data-action="extras-clean">Retirer mes ajouts cochés</button>` : "");
  return `<h1>Courses</h1>${addRow}${bar}${seg}${progress}${extrasHtml}${groups}${empty}${cleanup}`;
}

/* ---------- Vue : à propos ---------- */

function aboutView() {
  return `<button class="backlink" data-action="tab" data-view="recipes">‹ Retour</button>
    <h1>À propos</h1>
    <p>Eat-it est un carnet de recettes pour les jours où on ne sait pas quoi cuisiner. On parcourt les recettes, on filtre (protéine, saison, rapidité, ce qu'il y a dans le frigo…), on choisit celles de la semaine, et l'app prépare la liste de courses, regroupée par rayon et adaptée au nombre de personnes.</p>
    <p>Tout fonctionne sur le téléphone, même sans réseau : les favoris, les notes et les listes y restent. Une recette manque ? Elle peut être proposée depuis le menu ☰ ; elle est relue avant d'être ajoutée.</p>
    <h2>Crédits</h2>
    <p>Imaginée et créée par <b>Julien</b>, développée avec l'aide de Claude (Anthropic).</p>
    <p class="muted">Les recettes viennent de blogs, de vidéos et de créateurs de contenu, réécrites pour l'app : le lien « Voir la source » d'une recette renvoie vers l'original. Les photos appartiennent à leurs auteurs ; celles issues de Wikimedia Commons sont sous licence libre, <a class="source" href="https://github.com/Julien2501/eat-it/blob/main/images/CREDITS.md" target="_blank" rel="noopener">crédits ↗</a>.</p>`;
}

/* ---------- Vues : proposer une recette ou une modification ---------- */

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function saveDraft() {
  try {
    if (state.suggest && state.suggest.mode === "new") localStorage.setItem(DRAFT_KEY, JSON.stringify(state.suggest.f));
  } catch {
    /* brouillon non enregistré : sans conséquence */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* idem */
  }
}

// Champs numériques à boutons − / + : personnes (pas de 1) et durée (pas de 5 minutes).
const NUM_FIELDS = {
  servings: { step: 1, min: 1, max: MAX_SERVINGS, start: DEFAULT_SERVINGS },
  time: { step: 5, min: 5, max: 600, start: 30 },
};

// 45 → « 45 min », 60 → « 1h », 125 → « 2h05 ».
function fmtMinutes(v) {
  const m = parseInt(v, 10);
  if (!m) return "";
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, "0") : ""}`;
}

function numField(key, label, value) {
  const c = NUM_FIELDS[key];
  if (key === "time") {
    return `<div class="field"><span>${label}</span><div class="stepper numstep">
    <button type="button" data-action="num-step" data-field="time" data-dir="-1" aria-label="Moins">−</button>
    <input readonly inputmode="none" value="${esc(fmtMinutes(value))}" placeholder="${fmtMinutes(c.start)}" aria-label="${esc(label)}">
    <button type="button" data-action="num-step" data-field="time" data-dir="1" aria-label="Plus">+</button></div></div>`;
  }
  return `<div class="field"><span>${label}</span><div class="stepper numstep">
    <button type="button" data-action="num-step" data-field="${key}" data-dir="-1" aria-label="Moins">−</button>
    <input data-field="${key}" inputmode="numeric" maxlength="3" value="${esc(value || "")}" placeholder="${c.start}" aria-label="${esc(label)}">
    <button type="button" data-action="num-step" data-field="${key}" data-dir="1" aria-label="Plus">+</button></div></div>`;
}

// Liste de cases (ingrédients ou étapes) avec ajout et suppression.
function rowsHtml(key, label, placeholder, addLabel) {
  const rows = state.suggest.f[key];
  const isStep = key === "steps";
  const max = isStep ? SUGGEST_LIMITS.text : SUGGEST_LIMITS.short * 2;
  return `<div class="field"><span>${label}</span>${rows
    .map(
      (v, i) => `<div class="rowbox">${isStep ? `<b class="rownum">${i + 1}</b>` : ""}
        ${isStep
          ? `<textarea class="note" rows="2" maxlength="${max}" data-list="${key}" data-i="${i}" placeholder="${esc(placeholder)}">${esc(v)}</textarea>`
          : `<input maxlength="${max}" data-list="${key}" data-i="${i}" value="${esc(v)}" placeholder="${esc(placeholder)}" autocomplete="off">`}
        <button class="rowdel" data-action="list-del" data-list="${key}" data-i="${i}" aria-label="Supprimer">✕</button></div>`
    )
    .join("")}<button class="btn soft rowadd" data-action="list-add" data-list="${key}">＋ ${addLabel}</button></div>`;
}

// Photo : réduite sur le téléphone (960 px, JPEG) avant l'envoi.
function photoHtml(sg) {
  return `<div class="field"><span>${sg.mode === "edit" ? "Nouvelle photo du plat (facultatif)" : "Photo du plat (facultatif)"}</span>${
    sg.photo
      ? `<div class="photo-prev"><img src="${sg.photo.url}" alt="Aperçu de la photo"><button class="rowdel" data-action="photo-del" aria-label="Retirer la photo">✕</button></div>`
      : `<label class="btn soft rowadd">📷 Ajouter une photo<input type="file" accept="image/*" data-photo hidden></label>`
  }</div>`;
}

// Réduit une image choisie : retourne { url (aperçu), blob } ou null.
async function shrinkImage(file, max = 960) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    for (const q of [0.82, 0.7, 0.55, 0.4]) {
      const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", q));
      if (blob && blob.size <= PHOTO_MAX_BYTES) return { blob, url: URL.createObjectURL(blob) };
    }
  } catch {
    /* format non lisible */
  }
  return null;
}

const blobToDataUrl = (blob) =>
  new Promise((ok, ko) => {
    const fr = new FileReader();
    fr.onload = () => ok(fr.result);
    fr.onerror = ko;
    fr.readAsDataURL(blob);
  });

function suggestView() {
  const sg = state.suggest;
  if (!sg) return "";
  if (sg.sent) {
    const msg =
      sg.sent === "relay"
        ? "Ta proposition est bien partie. Elle sera lue et, si elle est validée, elle apparaîtra dans l'app."
        : "Ton message est prêt à être envoyé. Une fois reçu, il sera lu et, s'il est validé, il apparaîtra dans l'app.";
    return `<h1>Merci !</h1><p class="muted">${msg}</p><button class="btn" data-action="suggest-done">Retour aux recettes</button>`;
  }
  const f = sg.f;
  const r = sg.mode === "edit" ? byId(sg.id) : null;
  const val = (k) => esc(f[k] || "");
  const field = (k, label, extra = "") =>
    `<label class="field"><span>${label}</span><input data-field="${k}" value="${val(k)}" ${extra}></label>`;
  const area = (k, label, ph, max, rows) =>
    `<label class="field"><span>${label}</span><textarea class="note" data-field="${k}" rows="${rows}" maxlength="${max}" placeholder="${esc(ph)}">${val(k)}</textarea></label>`;
  const courses = [["", "Je ne sais pas"], ...COURSES.map((c) => [c.key, c.label])];
  const edit = sg.mode === "edit";
  const body = `<p class="muted">${
      edit
        ? `Voici la recette <b>${esc(r ? r.title : "")}</b> : corrige ce qui doit l'être. Seuls tes changements seront transmis, et ils seront relus avant d'être appliqués.`
        : "Propose une recette : elle sera relue, adaptée à l'app et, si elle est validée, elle apparaîtra pour tout le monde. Tu peux n'écrire que l'essentiel."
    }</p>
        ${field("title", "Nom de la recette *", `maxlength="${SUGGEST_LIMITS.title}" autocomplete="off"`)}
        <div class="field-row">${numField("servings", "Personnes", f.servings)}${numField("time", "Durée", f.time)}</div>
        <label class="field"><span>Type de plat</span><select data-field="category">${courses
          .map(([k, l]) => `<option value="${esc(k)}" ${f.category === k ? "selected" : ""}>${esc(l)}</option>`)
          .join("")}</select></label>
        ${rowsHtml("ingredients", "Ingrédients *", "Ex. : 200 g de spaghetti", "Ajouter un ingrédient")}
        ${rowsHtml("steps", "Étapes *", "Ex. : Cuire les pâtes 10 minutes.", "Ajouter une étape")}
        ${field("source", "Lien d'origine (facultatif)", 'type="url" inputmode="url" maxlength="300" autocomplete="off"')}
        ${area("message", edit ? "Pourquoi cette modification ? (facultatif)" : "Un mot, une astuce ? (facultatif)", "", SUGGEST_LIMITS.text, 3)}`;
  return `<button class="backlink" data-action="suggest-cancel">‹ Annuler</button>
    <h1>${sg.mode === "edit" ? "Suggérer une modification" : "Proposer une recette"}</h1>
    ${body}
    ${photoHtml(sg)}
    ${field("from", "Ton prénom (facultatif)", `maxlength="${SUGGEST_LIMITS.short}" autocomplete="off"`)}
    <input class="hp" data-field="website" tabindex="-1" autocomplete="off" aria-hidden="true" value="${val("website")}">
    <p class="muted small">Ta proposition sera lue par le créateur de l'app et peut être consultée publiquement : n'y mets pas d'information personnelle.</p>
    <button class="btn" data-action="suggest-send" ${sg.sending ? "disabled" : ""}>${sg.sending ? "Envoi…" : "Envoyer"}</button>`;
}

function tabbar() {
  const planCount = Object.keys(state.plan).filter(byId).length;
  const tabs = [
    ["recipes", "🍽️", "Recettes", 0],
    ["plan", "📅", "Semaine", planCount],
    ["shop", "🛒", "Courses", 0],
  ];
  return `<nav class="tabbar"><div class="tabbar-inner">${tabs
    .map(
      ([v, ico, label, badge]) => `<button class="tab ${state.view === v ? "on" : ""}" data-action="tab" data-view="${v}">
        <span class="ico">${ico}</span>${label}${badge ? `<span class="badge">${badge}</span>` : ""}</button>`
    )
    .join("")}</div></nav>`;
}

/* ---------- Rendu ---------- */

function render({ top = false } = {}) {
  const y = window.scrollY;
  const cookRecipe = state.cook && byId(state.cook.id);
  if (cookRecipe) {
    $app.innerHTML = cookView(cookRecipe);
    return;
  }
  const r = state.openId && byId(state.openId);
  let body;
  if (state.loading) body = `<p class="empty">Chargement…</p>`;
  else if (state.error) body = `<p class="empty">${esc(state.error)}</p>`;
  else if (r) body = detailView(r);
  else if (state.view === "plan") body = planView();
  else if (state.view === "shop") body = shopView();
  else if (state.view === "suggest") body = suggestView();
  else if (state.view === "about") body = aboutView();
  else body = recipesView();

  $app.innerHTML = `<main class="page ${r ? "flush" : ""}">${body}</main>${r ? ctaBar(r) : tabbar()}${timerPill()}`;
  window.scrollTo(0, top ? 0 : y);
}

/* ---------- Partage d'une recette : lien qui rouvre l'app sur cette recette ---------- */

// /r/<id>/ est une petite page générée (tools/build_share_pages.py) : aperçu photo + titre dans les
// messageries, puis redirection vers l'app (#/r/<id>).
function recipeUrl(id) {
  try {
    return new URL(`r/${encodeURIComponent(id)}/`, location.href.split("#")[0]).href;
  } catch {
    return "";
  }
}

function setHash(id) {
  try {
    history.replaceState(null, "", id ? `#/r/${encodeURIComponent(id)}` : location.pathname + location.search);
  } catch {
    /* pas d'historique : sans conséquence */
  }
}

function applyHash() {
  if (typeof location === "undefined") return;
  const m = /^#\/r\/(.+)$/.exec(location.hash || "");
  const id = m && decodeURIComponent(m[1]);
  if (!id || !byId(id)) return;
  state.view = "recipes";
  state.openId = id;
  state.detailServings = null;
  state.cook = null;
  render({ top: true });
}

/* ---------- Actions ---------- */

const focusLater = (id) => {
  const el = document.getElementById(id);
  if (el && el.focus) el.focus();
};

const actions = {
  tab(el) {
    state.menuOpen = false;
    state.view = el.dataset.view;
    state.openId = null;
    setHash(null);
    render({ top: true });
  },
  menu() {
    state.menuOpen = !state.menuOpen;
    render();
  },
  open(el) {
    state.openId = el.dataset.id;
    state.detailServings = null;
    setHash(state.openId);
    render({ top: true });
  },
  close() {
    state.openId = null;
    setHash(null);
    render();
  },
  async "share-recipe"(el) {
    const r = byId(el.dataset.id);
    const url = recipeUrl(r.id);
    const text = `${r.title} (${fmtMinutes(r.time)}). Regarde la recette dans Eat-it :`;
    try {
      if (navigator.share) {
        await navigator.share({ title: r.title, text, url });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(`${r.title}\n${url}`);
      toast("Lien copié");
    } catch {
      window.prompt("Copie le lien :", url);
    }
  },
  "shop-mode"(el) {
    state.shopMode = el.dataset.mode === "recipe" ? "recipe" : "aisle";
    saveState();
    render();
  },
  add(el) {
    const r = byId(el.dataset.id);
    const servings = isFixed(r) ? r.servings : Number(el.dataset.servings) || DEFAULT_SERVINGS;
    state.plan[r.id] = servings;
    saveState();
    render();
  },
  remove(el) {
    delete state.plan[el.dataset.id];
    delete state.planDay[el.dataset.id];
    saveState();
    render();
  },
  day(el) {
    const id = el.dataset.id;
    const d = Number(el.dataset.day);
    if (state.planDay[id] === d) delete state.planDay[id];
    else state.planDay[id] = d;
    saveState();
    render();
  },
  step(el) {
    const r = byId(el.dataset.id);
    const next = clamp(currentServings(r) + Number(el.dataset.delta), 1, MAX_SERVINGS);
    if (r.id in state.plan) {
      state.plan[r.id] = next;
      saveState();
    } else {
      state.detailServings = next;
    }
    render();
  },
  course(el) {
    state.course = el.dataset.course || null;
    // Les filtres dépendent de la catégorie : on repart de zéro pour éviter une sélection vide.
    state.filters = {};
    state.quick = false;
    state.favsOnly = false;
    state.openCat = null;
    render();
  },
  cat(el) {
    state.openCat = state.openCat === el.dataset.cat ? null : el.dataset.cat;
    render();
  },
  tag(el) {
    const chosen = (state.filters[el.dataset.cat] ||= []);
    const i = chosen.indexOf(el.dataset.tag);
    if (i < 0) chosen.push(el.dataset.tag);
    else chosen.splice(i, 1);
    render();
  },
  quick() {
    state.quick = !state.quick;
    render();
  },
  favs() {
    state.favsOnly = !state.favsOnly;
    render();
  },
  reset() {
    state.filters = {};
    state.quick = false;
    state.favsOnly = false;
    state.openCat = null;
    state.fridge = [];
    state.fridgeOpen = false;
    saveState();
    render();
  },
  shuffle() {
    shuffleOrder();
    render();
  },
  random() {
    const pool = state.recipes.filter(recipeMatches);
    if (!pool.length) return;
    state.openId = pool[Math.floor(Math.random() * pool.length)].id;
    state.detailServings = null;
    setHash(state.openId);
    render({ top: true });
  },
  /* favoris */
  fav(el) {
    const id = el.dataset.id;
    if (state.favs[id]) delete state.favs[id];
    else state.favs[id] = true;
    saveState();
    render();
  },
  /* frigo */
  fridge() {
    state.fridgeOpen = !state.fridgeOpen;
    render();
    if (state.fridgeOpen) focusLater("fridge-in");
  },
  "fridge-add"() {
    const input = document.getElementById("fridge-in");
    const terms = (input ? input.value : "").split(/[,;]/).map((t) => t.trim()).filter(Boolean);
    for (const t of terms) if (!state.fridge.some((x) => norm(x) === norm(t))) state.fridge.push(t);
    saveState();
    render();
    focusLater("fridge-in");
  },
  "fridge-del"(el) {
    state.fridge = state.fridge.filter((t) => t !== el.dataset.term);
    saveState();
    render();
  },
  /* avis et notes */
  rate(el) {
    const j = ensureJournal(el.dataset.id);
    const n = Number(el.dataset.n);
    j.rating = j.rating === n ? 0 : n;
    saveState();
    render();
  },
  cooked(el) {
    ensureJournal(el.dataset.id).cooked.push(new Date().toISOString());
    saveState();
    render();
    toast("Noté !");
  },
  /* mode cuisine */
  cook(el) {
    state.cook = { id: el.dataset.id, step: 0, ing: false };
    state.lastCook = state.cook;
    ensureAudio();
    requestWake();
    render({ top: true });
  },
  "cook-next"() {
    state.cook.step += 1;
    state.cook.ing = false;
    render();
  },
  "cook-prev"() {
    state.cook.step = Math.max(0, state.cook.step - 1);
    state.cook.ing = false;
    render();
  },
  "cook-ing"() {
    state.cook.ing = !state.cook.ing;
    render();
  },
  "cook-exit"() {
    state.lastCook = state.timers.length ? state.cook : null;
    state.cook = null;
    releaseWake();
    render({ top: true });
  },
  "cook-resume"() {
    if (!state.lastCook) return;
    state.cook = state.lastCook;
    requestWake();
    render({ top: true });
  },
  "timer-start"(el) {
    ensureAudio();
    state.timers.push({ id: Date.now() + Math.floor(Math.random() * 1000), label: el.dataset.label, end: Date.now() + Number(el.dataset.sec) * 1000, done: false });
    if (!tickHandle) tickHandle = setInterval(tick, 1000);
    render();
  },
  "timer-del"(el) {
    state.timers = state.timers.filter((t) => String(t.id) !== el.dataset.tid);
    if (!state.timers.length) state.lastCook = state.cook;
    render();
  },
  /* courses */
  check(el) {
    const key = el.dataset.key;
    if (state.checked[key]) delete state.checked[key];
    else state.checked[key] = true;
    saveState();
    render();
  },
  "uncheck-all"() {
    state.checked = {};
    state.extras.forEach((e) => (e.done = false));
    saveState();
    render();
  },
  "extra-add"() {
    const input = document.getElementById("extra-in");
    const text = (input ? input.value : "").trim();
    if (!text) return;
    state.extras.push({ id: Date.now() + Math.floor(Math.random() * 1000), text, done: false });
    saveState();
    render();
    focusLater("extra-in");
  },
  "extra-check"(el) {
    const e = state.extras.find((x) => String(x.id) === el.dataset.id);
    if (e) e.done = !e.done;
    saveState();
    render();
  },
  "extra-del"(el) {
    state.extras = state.extras.filter((x) => String(x.id) !== el.dataset.id);
    saveState();
    render();
  },
  "extras-clean"() {
    state.extras = state.extras.filter((e) => !e.done);
    saveState();
    render();
  },
  pantry() {
    state.pantryOpen = !state.pantryOpen;
    render();
  },
  "pantry-toggle"(el) {
    const n = el.dataset.name;
    state.hidden = state.hidden.includes(n) ? state.hidden.filter((x) => x !== n) : [...state.hidden, n];
    saveState();
    render();
  },
  async share() {
    const text = shopText();
    try {
      if (navigator.share) {
        await navigator.share({ title: "Liste de courses", text });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Liste copiée");
    } catch {
      window.prompt("Copie la liste :", text);
    }
  },
  "clear-plan"() {
    if (!confirm("Vider la semaine ?")) return;
    state.plan = {};
    state.planDay = {};
    state.checked = {};
    saveState();
    render();
  },
  /* propositions */
  about() {
    state.menuOpen = false;
    state.view = "about";
    state.openId = null;
    setHash(null);
    render({ top: true });
  },
  "suggest-new"() {
    state.menuOpen = false;
    const d = loadDraft();
    const list = (v, min) => {
      const a = Array.isArray(v) ? v : String(v || "").split("\n");
      const out = a.map(String);
      while (out.length < min) out.push("");
      return out;
    };
    state.suggest = { mode: "new", id: null, sending: false, sent: false, f: { ...d, ingredients: list(d.ingredients, 3), steps: list(d.steps, 2), website: "" } };
    state.view = "suggest";
    state.openId = null;
    setHash(null);
    render({ top: true });
  },
  "num-step"(el) {
    const key = el.dataset.field;
    const c = NUM_FIELDS[key];
    const dir = Number(el.dataset.dir);
    const cur = parseInt(state.suggest.f[key], 10);
    let n;
    if (!cur) n = dir > 0 ? c.start : c.min;
    else if (c.step === 1) n = cur + dir;
    else n = dir > 0 ? (Math.floor(cur / c.step) + 1) * c.step : (Math.ceil(cur / c.step) - 1) * c.step; // cale sur les multiples de 5
    state.suggest.f[key] = String(Math.min(c.max, Math.max(c.min, n)));
    saveDraft();
    render();
  },
  "list-add"(el) {
    const rows = state.suggest.f[el.dataset.list];
    rows.push("");
    saveDraft();
    render();
    const box = document.querySelectorAll(`[data-list="${el.dataset.list}"][data-i]`);
    const last = box[box.length - 1];
    if (last && last.focus) last.focus();
  },
  "list-del"(el) {
    const rows = state.suggest.f[el.dataset.list];
    rows.splice(Number(el.dataset.i), 1);
    if (!rows.length) rows.push("");
    saveDraft();
    render();
  },
  "photo-del"() {
    if (state.suggest) state.suggest.photo = null;
    render();
  },
  "suggest-edit"(el) {
    // Formulaire prérempli avec la recette ; `before` garde l'original pour n'envoyer que les différences.
    const r = byId(el.dataset.id);
    const before = {
      title: r.title,
      servings: String(r.servings),
      time: String(r.time),
      category: courseOf(r)[0] || "",
      ingredients: r.ingredients.map((i) => ingText(i.name, i.qty, i.unit, i.plural)),
      steps: [...r.steps],
      source: r.source || "",
    };
    state.suggest = {
      mode: "edit",
      id: r.id,
      sending: false,
      sent: false,
      before,
      f: { ...before, ingredients: [...before.ingredients], steps: [...before.steps], message: "", from: "", website: "" },
    };
    state.view = "suggest";
    state.openId = null;
    setHash(null);
    render({ top: true });
  },
  "suggest-cancel"() {
    state.suggest = null;
    state.view = "recipes";
    render({ top: true });
  },
  "suggest-done"() {
    state.suggest = null;
    state.view = "recipes";
    render({ top: true });
  },
  async "suggest-send"() {
    const sg = state.suggest;
    if (!sg || sg.sending) return;
    const f = sg.f;
    const clean = (v, n) => String(v || "").trim().slice(0, n);
    const lines = (a) => (Array.isArray(a) ? a : []).map((x) => String(x).replace(/\s*\n\s*/g, " ").trim()).filter(Boolean).join("\n");
    f.ingredients = Array.isArray(f.ingredients) ? f.ingredients : [""];
    f.steps = Array.isArray(f.steps) ? f.steps : [""];
    if (!(clean(f.title, 1) && lines(f.ingredients) && lines(f.steps))) {
      toast("Nom, ingrédients et étapes sont nécessaires");
      return;
    }
    const r = sg.mode === "edit" ? byId(sg.id) : null;
    const norm = (x) => ({
      title: clean(x.title, SUGGEST_LIMITS.title),
      servings: String(x.servings || "").replace(/[^0-9]/g, ""),
      time: String(x.time || "").replace(/[^0-9]/g, ""),
      category: clean(x.category, SUGGEST_LIMITS.short),
      ingredients: clean(lines(x.ingredients), SUGGEST_LIMITS.list),
      steps: clean(lines(x.steps), SUGGEST_LIMITS.list),
      source: clean(x.source, 300),
    });
    let editPayload = null;
    if (r) {
      // Modification : on n'envoie que les champs qui ont changé, avec leur ancienne et leur nouvelle valeur.
      const a = norm(sg.before);
      const b = norm(f);
      const changes = {};
      for (const k of Object.keys(a)) if (a[k] !== b[k]) changes[k] = { before: a[k], after: b[k] };
      if (!Object.keys(changes).length && !clean(f.message, 1) && !sg.photo) {
        toast("Aucune modification");
        return;
      }
      editPayload = {
        type: "edit",
        recipeId: r.id,
        recipeTitle: r.title,
        changes,
        message: clean(f.message, SUGGEST_LIMITS.text),
        from: clean(f.from, SUGGEST_LIMITS.short),
        website: clean(f.website, 100),
      };
    }
    const payload = editPayload || {
      type: sg.mode,
      recipeId: "",
      recipeTitle: "",
      title: clean(f.title, SUGGEST_LIMITS.title),
      servings: clean(String(f.servings || "").replace(/[^0-9]/g, ""), 3),
      time: clean(String(f.time || "").replace(/[^0-9]/g, ""), 4),
      category: clean(f.category, SUGGEST_LIMITS.short),
      ingredients: clean(lines(f.ingredients), SUGGEST_LIMITS.list),
      steps: clean(lines(f.steps), SUGGEST_LIMITS.list),
      source: clean(f.source, 300),
      message: clean(f.message, SUGGEST_LIMITS.text),
      from: clean(f.from, SUGGEST_LIMITS.short),
      website: clean(f.website, 100), // champ piège : un humain ne le remplit pas
    };
    const done = (how) => {
      if (sg.mode === "new") clearDraft();
      sg.sent = how;
      sg.sending = false;
      render({ top: true });
    };
    if (SUGGEST_URL) {
      sg.sending = true;
      render();
      try {
        if (sg.photo) payload.image = await blobToDataUrl(sg.photo.blob);
        const res = await fetch(SUGGEST_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(res.status);
        done("relay");
      } catch {
        sg.sending = false;
        render();
        toast("Envoi impossible, réessaie plus tard");
      }
      return;
    }
    // Pas de relais configuré : feuille de partage, sinon presse-papiers.
    const text = suggestText(payload);
    try {
      if (navigator.share) {
        const files = sg.photo ? [new File([sg.photo.blob], "photo.jpg", { type: "image/jpeg" })] : [];
        const withFiles = files.length && navigator.canShare && navigator.canShare({ files });
        await navigator.share(withFiles ? { title: "Proposition Eat-it", text, files } : { title: "Proposition Eat-it", text });
        done("share");
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast("Proposition copiée : envoie-la au créateur");
      done("share");
    } catch {
      window.prompt("Copie cette proposition :", text);
    }
  },
};

// Texte lisible de la proposition, utilisé quand il n'y a pas de relais.
function suggestText(p) {
  const lines = [p.type === "edit" ? `Modification pour « ${p.recipeTitle} » (${p.recipeId})` : `Nouvelle recette : ${p.title}`];
  if (p.type === "edit") {
    for (const [k, c] of Object.entries(p.changes || {})) lines.push("", `${k} :`, `AVANT : ${c.before}`, `APRÈS : ${c.after}`);
  } else {
    lines.push(`Personnes : ${p.servings || "?"} · Durée : ${fmtMinutes(p.time) || "?"} · Type : ${p.category || "?"}`);
    lines.push("", "Ingrédients :", p.ingredients, "", "Étapes :", p.steps);
    if (p.source) lines.push("", `Source : ${p.source}`);
  }
  if (p.message) lines.push("", p.message);
  if (p.from) lines.push("", `— ${p.from}`);
  return lines.join("\n");
}

$app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});

// La recherche ne re-rend que le fil, pour ne pas perdre le focus du champ ; les notes s'enregistrent en tapant.
$app.addEventListener("input", (e) => {
  const t = e.target;
  if (t.id === "q") {
    state.query = t.value;
    document.getElementById("feed").innerHTML = feedHtml();
  } else if (t.dataset && t.dataset.list && state.suggest) {
    state.suggest.f[t.dataset.list][Number(t.dataset.i)] = t.value;
    saveDraft();
  } else if (t.dataset && t.dataset.field && state.suggest) {
    state.suggest.f[t.dataset.field] = t.value;
    saveDraft();
  } else if (t.dataset && t.dataset.note) {
    ensureJournal(t.dataset.note).note = t.value;
    saveSoon();
  }
});

$app.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.photo !== undefined && state.suggest && t.files && t.files[0]) {
    const img = await shrinkImage(t.files[0]);
    if (!img) return toast("Photo non lisible ou trop lourde");
    state.suggest.photo = img;
    render();
    return;
  }
  if (t.tagName === "SELECT" && t.dataset.field && state.suggest) {
    state.suggest.f[t.dataset.field] = t.value;
    saveDraft();
  }
});

$app.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "fridge-in") actions["fridge-add"]();
  else if (e.target.id === "extra-in") actions["extra-add"]();
});

// Glisser à gauche / à droite pour changer d'étape en mode cuisine.
let touchStart = null;
$app.addEventListener(
  "touchstart",
  (e) => {
    touchStart = state.cook && e.target.closest("#cookbody") ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  },
  { passive: true }
);
$app.addEventListener(
  "touchend",
  (e) => {
    if (!touchStart || !state.cook) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 70 || Math.abs(dx) < 2 * Math.abs(dy)) return;
    const r = byId(state.cook.id);
    if (dx < 0 && state.cook.step < r.steps.length - 1) actions["cook-next"]();
    else if (dx > 0 && state.cook.step > 0) actions["cook-prev"]();
  },
  { passive: true }
);

/* ---------- Démarrage ---------- */

async function init() {
  loadState();
  render();
  try {
    const res = await fetch("data/recipes.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    state.recipes = await res.json();
    // Oublie les recettes supprimées des données.
    for (const id of Object.keys(state.plan)) if (!byId(id)) delete state.plan[id];
    for (const id of Object.keys(state.planDay)) if (!(id in state.plan)) delete state.planDay[id];
    saveState();
    shuffleOrder();
  } catch {
    state.error = "Impossible de charger les recettes.";
  }
  state.loading = false;
  render();
  applyHash();
}

// Une PWA reste longtemps en mémoire : si on revient sur l'accueil après une pause, on remélange.
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    return;
  }
  if (state.cook) requestWake(); // le verrou d'écran est perdu quand l'app passe en arrière-plan
  if (state.timers.length) tick();
  const away = hiddenAt && Date.now() - hiddenAt > RESHUFFLE_AFTER_MS;
  if (away && !state.loading && !state.openId && !state.cook && state.view === "recipes") {
    shuffleOrder();
    render({ top: true });
  }
});

if (typeof window.addEventListener === "function") window.addEventListener("hashchange", applyHash);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
