"use strict";

const AISLES = [
  ["produce", "Fruits & légumes", "🥬"],
  ["meat", "Viandes & poissons", "🥩"],
  ["dairy", "Crèmerie & œufs", "🧀"],
  ["pantry", "Épicerie", "🥫"],
  ["bakery", "Boulangerie", "🥖"],
  ["frozen", "Surgelés", "🧊"],
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
const MAX_SERVINGS = 50;
// Nombre de personnes affiché par défaut, quelle que soit la portion d'origine de la recette.
const DEFAULT_SERVINGS = 2;
const $app = document.getElementById("app");

const state = {
  recipes: [],
  loading: true,
  error: null,
  view: "recipes", // recipes | plan | shop | settings
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

function shoppingList() {
  const map = new Map();
  for (const [id, servings] of Object.entries(state.plan)) {
    const r = byId(id);
    if (!r) continue;
    const factor = servings / r.servings;
    for (const ing of r.ingredients) {
      const unit = ing.unit || "";
      const key = `${norm(ing.name)}|${unit}`;
      let e = map.get(key);
      if (!e) {
        e = { key, name: ing.name, plural: ing.plural, unit, aisle: ing.aisle || "other", qty: 0, hasQty: false, from: new Set() };
        map.set(key, e);
      }
      if (ing.qty != null) {
        e.qty += ing.qty * factor;
        e.hasQty = true;
      }
      e.from.add(r.title);
    }
  }
  return [...map.values()];
}

const isHidden = (i) => state.hidden.includes(norm(i.name));
const rowsFor = (items, key) =>
  items.filter((i) => i.aisle === key || (!AISLES.some(([k]) => k === i.aisle) && key === "other"));
const itemText = (i) => ingText(i.name, i.hasQty ? i.qty : null, i.unit, i.plural);

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
  return `<span class="pill">⏱ ${r.time} min</span>${labels.map((l) => `<span class="pill plain">${esc(l)}</span>`).join("")}`;
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
  const footer = `<button class="linkbtn" data-action="settings">💾 Sauvegarde et réglages</button>`;
  if (!items.length) return `${bar}<p class="empty"><span class="big">🔍</span>Aucune recette ne correspond.</p>${footer}`;
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
    .join("")}</ul>${footer}`;
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
  return `<div class="brand"><div class="logo">🍽️</div><div class="name">Eat-it</div></div>
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
  return `<div class="hero">${imgHtml(r)}<button class="back" data-action="close" aria-label="Retour">‹</button>${heartBtn(r, "hero-heart")}</div>
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

  const extrasHtml = extras.length
    ? `<div class="aisle"><span>✍️</span>Mes ajouts</div><ul class="shop">${extras
        .map(
          (e) => `<li class="withx"><button class="row ${e.done ? "done" : ""}" data-action="extra-check" data-id="${e.id}">
            <span class="box">✓</span><span class="label">${esc(e.text)}</span></button>
            <button class="x" data-action="extra-del" data-id="${e.id}" aria-label="Supprimer">×</button></li>`
        )
        .join("")}</ul>`
    : "";

  const groups = AISLES.map(([key, label, ico]) => {
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

  const empty = !totalN
    ? `<p class="empty"><span class="big">🛒</span>La liste est vide.<br>Choisis des recettes pour la semaine, ou ajoute un article ci-dessus.</p>`
    : "";
  const progress = totalN
    ? `<p class="muted">${doneN} sur ${totalN} dans le panier</p><div class="progress"><i style="width:${(doneN / totalN) * 100}%"></i></div>`
    : "";
  const cleanup =
    (doneN ? `<div style="height:20px"></div><button class="btn soft" data-action="uncheck-all">Tout décocher</button>` : "") +
    (extras.some((e) => e.done) ? `<button class="btn soft" data-action="extras-clean">Retirer mes ajouts cochés</button>` : "");
  return `<h1>Courses</h1>${addRow}${bar}${progress}${extrasHtml}${groups}${empty}${cleanup}`;
}

/* ---------- Vues : réglages et sauvegarde ---------- */

function settingsView() {
  const hiddenChips = state.hidden.length
    ? state.hidden.map((n) => `<button class="chip on" data-action="pantry-toggle" data-name="${esc(n)}">${esc(n)} ✕</button>`).join("")
    : "<span class='muted'>Aucun.</span>";
  const favN = Object.keys(state.favs).filter(byId).length;
  const notesN = Object.values(state.journal).filter((j) => j.note || j.rating || j.cooked.length).length;
  return `<button class="backlink" data-action="tab" data-view="recipes">‹ Retour</button>
    <h1>Réglages</h1>
    <p class="muted">${plural(favN, "favori", "favoris")} · ${plural(notesN, "recette avec avis ou notes", "recettes avec avis ou notes")} · ${plural(Object.keys(state.plan).length, "recette", "recettes")} dans la semaine</p>
    <h2>Sauvegarde</h2>
    <p class="muted">Tes favoris, ta semaine, tes notes et ta liste de courses sont enregistrés sur ce téléphone. Exporte-les pour les garder en sécurité ou les retrouver sur un autre appareil.</p>
    <button class="btn" data-action="export">📤 Exporter mes données</button>
    <textarea id="import-in" class="note" placeholder="Pour restaurer : colle ici les données exportées, puis touche « Restaurer »."></textarea>
    <button class="btn soft" data-action="import">📥 Restaurer</button>
    <h2>Articles masqués de la liste de courses</h2>
    <div class="panel"><div class="fridge-chips">${hiddenChips}</div></div>
    <h2>Zone sensible</h2>
    <button class="btn soft" data-action="wipe">Effacer toutes mes données</button>`;
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
  else if (state.view === "settings") body = settingsView();
  else body = recipesView();

  $app.innerHTML = `<main class="page ${r ? "flush" : ""}">${body}</main>${r ? ctaBar(r) : tabbar()}${timerPill()}`;
  window.scrollTo(0, top ? 0 : y);
}

/* ---------- Actions ---------- */

const focusLater = (id) => {
  const el = document.getElementById(id);
  if (el && el.focus) el.focus();
};

const actions = {
  tab(el) {
    state.view = el.dataset.view;
    state.openId = null;
    render({ top: true });
  },
  settings() {
    state.view = "settings";
    state.openId = null;
    render({ top: true });
  },
  open(el) {
    state.openId = el.dataset.id;
    state.detailServings = null;
    render({ top: true });
  },
  close() {
    state.openId = null;
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
  /* sauvegarde */
  async export() {
    const data = JSON.stringify({ app: "eat-it", version: 1, saved: new Date().toISOString(), ...persistable() });
    try {
      if (navigator.share) {
        await navigator.share({ title: "Sauvegarde Eat-it", text: data });
        return;
      }
    } catch (e) {
      if (e && e.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(data);
      toast("Sauvegarde copiée");
    } catch {
      window.prompt("Copie cette sauvegarde :", data);
    }
  },
  import() {
    const input = document.getElementById("import-in");
    let obj;
    try {
      obj = JSON.parse((input ? input.value : "").trim());
      if (!obj || obj.app !== "eat-it") throw new Error("format");
    } catch {
      toast("Données non reconnues");
      return;
    }
    if (!confirm("Remplacer tes données actuelles par cette sauvegarde ?")) return;
    applySaved(obj);
    for (const id of Object.keys(state.plan)) if (!byId(id)) delete state.plan[id];
    saveState();
    render({ top: true });
    toast("Sauvegarde restaurée");
  },
  wipe() {
    if (!confirm("Effacer tous tes favoris, notes, semaine et listes ? Cette action est définitive.")) return;
    applySaved({});
    saveState();
    render({ top: true });
    toast("Données effacées");
  },
};

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
  } else if (t.dataset && t.dataset.note) {
    ensureJournal(t.dataset.note).note = t.value;
    saveSoon();
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

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
