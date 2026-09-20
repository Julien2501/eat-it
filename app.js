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

const STORE_KEY = "eatit.v1";
const MAX_SERVINGS = 50;
// Nombre de personnes affiché par défaut, quelle que soit la portion d'origine de la recette.
const DEFAULT_SERVINGS = 2;
const $app = document.getElementById("app");

const state = {
  recipes: [],
  loading: true,
  error: null,
  view: "recipes", // recipes | plan | shop
  query: "",
  course: null, // catégorie de plat choisie (null = tout)
  filtersOpen: false,
  filters: {}, // { catégorie: [valeurs choisies] } : OU dans une catégorie, ET entre catégories
  quick: false,
  openCat: null, // catégorie dont les choix sont dépliés
  rank: {}, // { recipeId: position } : ordre d'affichage aléatoire de la session
  openId: null,
  detailServings: null,
  plan: {}, // { recipeId: nombre de personnes }
  checked: {}, // { clé d'ingrédient: true }
};

/* ---------- Persistance (état de l'utilisateur, jamais les recettes) ---------- */

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
    state.plan = s.plan || {};
    state.checked = s.checked || {};
  } catch {
    /* localStorage indisponible : l'app marche sans mémoire */
  }
}

function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ plan: state.plan, checked: state.checked }));
  } catch {
    /* idem */
  }
}

/* ---------- Utilitaires ---------- */

const byId = (id) => state.recipes.find((r) => r.id === id);
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const norm = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

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

/* ---------- Vues ---------- */

function shuffleOrder() {
  const ids = state.recipes.map((r) => r.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  state.rank = Object.fromEntries(ids.map((id, i) => [id, i]));
}

const tagValues = (r, key) => (r.tags && r.tags[key]) || [];
const activeCount = () => Object.values(state.filters).reduce((n, v) => n + v.length, 0) + (state.quick ? 1 : 0);

function recipeMatches(r) {
  if (state.course && !courseOf(r).includes(state.course)) return false;
  for (const { key } of FILTERS) {
    const chosen = state.filters[key];
    if (!chosen || !chosen.length) continue;
    const have = tagValues(r, key);
    const ok = chosen.some((v) => have.includes(v) || (key === "season" && have.includes(ALL_YEAR)));
    if (!ok) return false;
  }
  if (state.quick && r.time > QUICK_MAX_MIN) return false;
  const q = norm(state.query);
  if (!q) return true;
  const hay = norm([r.title, ...Object.values(r.tags || {}).flat(), ...r.ingredients.map((i) => i.name)].join(" "));
  return hay.includes(q);
}

// Étiquettes affichées sur une recette : plat, cuisine puis protéine.
function pillsHtml(r, max) {
  const labels = [...new Set([...tagValues(r, "dish"), ...tagValues(r, "cuisine"), ...tagValues(r, "protein")])].slice(0, max);
  return `<span class="pill">⏱ ${r.time} min</span>${labels.map((l) => `<span class="pill plain">${esc(l)}</span>`).join("")}`;
}

function feedHtml() {
  const items = state.recipes.filter(recipeMatches).sort((a, b) => state.rank[a.id] - state.rank[b.id]);
  const n = activeCount();
  const bar = `<div class="listbar"><span>${plural(items.length, "recette", "recettes")}</span>
    <button class="ftoggle ${state.filtersOpen ? "open" : ""}" data-action="filters">⚙️ Filtres${n ? `<b>${n}</b>` : ""}</button>
    <button class="shuffle" data-action="shuffle">🔀 Mélanger</button></div>${state.filtersOpen ? filtersHtml() : ""}`;
  if (!items.length) return `${bar}<p class="empty"><span class="big">🔍</span>Aucune recette ne correspond.</p>`;
  return `${bar}<ul class="feed">${items
    .map((r) => {
      const inPlan = r.id in state.plan;
      return `<li class="rcard">
        <button class="fab ${inPlan ? "on" : ""}" data-action="${inPlan ? "remove" : "add"}" data-id="${esc(r.id)}"
          aria-label="${inPlan ? "Retirer de la semaine" : "Ajouter à la semaine"}">${inPlan ? "✓" : "+"}</button>
        <button class="open" data-action="open" data-id="${esc(r.id)}">
          ${imgHtml(r)}
          <div class="body">
            <div class="title">${esc(r.title)}</div>
            <div class="pills">${pillsHtml(r, 2)}</div>
          </div>
        </button>
      </li>`;
    })
    .join("")}</ul>`;
}

// Valeurs proposées pour une catégorie, d'après les recettes ; les saisons ont un ordre fixe.
function filterChoices(key) {
  if (key === "season") return SEASONS.map(([name, emoji]) => ({ value: name, label: `${emoji} ${name}` }));
  const values = new Set(state.recipes.flatMap((r) => tagValues(r, key)));
  return [...values].sort((a, b) => a.localeCompare(b, "fr")).map((v) => ({ value: v, label: v }));
}

function filtersHtml() {
  const cats = FILTERS.filter(({ key }) => filterChoices(key).length);
  const pills = cats
    .map(({ key, label, emoji }) => {
      const n = (state.filters[key] || []).length;
      return `<button class="cat ${n ? "on" : ""} ${state.openCat === key ? "open" : ""}" data-action="cat" data-cat="${key}">${emoji} ${label}${n ? `<b>${n}</b>` : ""}</button>`;
    })
    .join("");
  const quick = `<button class="cat ${state.quick ? "on" : ""}" data-action="quick">⚡ Rapide</button>`;
  const reset = activeCount() ? `<button class="cat reset" data-action="reset">✕ Réinitialiser</button>` : "";
  const open = cats.find((c) => c.key === state.openCat);
  const panel = open
    ? `<div class="panel">${filterChoices(open.key)
        .map(({ value, label }) => {
          const on = (state.filters[open.key] || []).includes(value);
          return `<button class="chip ${on ? "on" : ""}" data-action="tag" data-cat="${open.key}" data-tag="${esc(value)}">${esc(label)}</button>`;
        })
        .join("")}</div>`
    : "";
  return `<div class="cats">${pills}${quick}${reset}</div>${panel}`;
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
    <button class="surprise" data-action="random"><span class="dice">🎲</span><div><b>Pas d’idée ?</b><span>Une recette au hasard${narrowed ? " parmi la sélection" : ""}</span></div></button>
    <div id="feed">${feedHtml()}</div>`;
}

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

function detailView(r) {
  const servings = currentServings(r);
  const factor = servings / r.servings;
  const seasons = tagValues(r, "season").filter((s) => s !== ALL_YEAR);
  const seasonPill = seasons.length
    ? `<span class="pill plain">${seasons.map((s) => (SEASONS.find(([n]) => n === s) || [, ""])[1] + " " + s).join(" · ")}</span>`
    : "";
  return `<div class="hero">${imgHtml(r)}<button class="back" data-action="close" aria-label="Retour">‹</button></div>
    <div class="sheet">
      <h1>${esc(r.title)}</h1>
      <div class="pills">${pillsHtml(r, 6)}${seasonPill}</div>
      <div class="servings-card"><b>${isFixed(r) ? "Donne" : "Pour"}</b>${servingsControl(r, servings)}</div>
      <h2>Ingrédients</h2>
      <ul class="ingredients">${r.ingredients
        .map((i) => `<li>${esc(ingText(i.name, i.qty == null ? null : i.qty * factor, i.unit, i.plural))}</li>`)
        .join("")}</ul>
      <h2>Préparation</h2>
      <ol class="steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
      ${r.notes ? `<p class="notes">${esc(r.notes)}</p>` : ""}
      ${r.source ? `<a class="source" href="${esc(r.source)}" target="_blank" rel="noopener">Voir la source ↗</a>` : ""}
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

function planView() {
  const ids = Object.keys(state.plan).filter(byId);
  if (!ids.length) {
    return `<h1>Ma semaine</h1><p class="empty"><span class="big">📅</span>Aucune recette choisie.<br>Ajoute-en depuis l’onglet Recettes avec le bouton +.</p>`;
  }
  const total = ids.reduce((n, id) => n + (isFixed(byId(id)) ? 0 : state.plan[id]), 0);
  return `<h1>Ma semaine</h1>
    <p class="muted">${plural(ids.length, "recette", "recettes")} · ${plural(total, "repas", "repas")} au total</p>
    <ul class="plan">${ids
      .map((id) => {
        const r = byId(id);
        return `<li class="prow">
          ${imgHtml(r)}
          <div class="info">
            <button class="title" data-action="open" data-id="${esc(id)}">${esc(r.title)}</button>
            ${servingsControl(r, state.plan[id])}
          </div>
          <button class="x" data-action="remove" data-id="${esc(id)}" aria-label="Retirer">×</button>
        </li>`;
      })
      .join("")}</ul>
    <button class="btn" data-action="tab" data-view="shop">🛒 Voir la liste de courses</button>
    <button class="btn soft" data-action="clear-plan">Vider la semaine</button>`;
}

function shopView() {
  const items = shoppingList();
  if (!items.length) {
    return `<h1>Courses</h1><p class="empty"><span class="big">🛒</span>La liste est vide.<br>Choisis des recettes pour la semaine d’abord.</p>`;
  }
  const done = items.filter((i) => state.checked[i.key]).length;
  const groups = AISLES.map(([key, label, ico]) => {
    const rows = items
      .filter((i) => i.aisle === key || (!AISLES.some(([k]) => k === i.aisle) && key === "other"))
      .sort((a, b) => !!state.checked[a.key] - !!state.checked[b.key] || a.name.localeCompare(b.name, "fr"));
    if (!rows.length) return "";
    return `<div class="aisle"><span>${ico}</span>${label}</div><ul class="shop">${rows
      .map((i) => {
        const text = ingText(i.name, i.hasQty ? i.qty : null, i.unit, i.plural);
        const isDone = !!state.checked[i.key];
        const from = i.from.size > 1 ? `<span class="from">${esc([...i.from].join(", "))}</span>` : "";
        return `<li><button class="row ${isDone ? "done" : ""}" data-action="check" data-key="${esc(i.key)}">
          <span class="box">✓</span><span class="label">${esc(text)}${from}</span></button></li>`;
      })
      .join("")}</ul>`;
  }).join("");
  return `<h1>Courses</h1>
    <p class="muted">${done} sur ${items.length} dans le panier</p>
    <div class="progress"><i style="width:${(done / items.length) * 100}%"></i></div>
    ${groups}
    ${done ? `<div style="height:20px"></div><button class="btn soft" data-action="uncheck-all">Tout décocher</button>` : ""}`;
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
  const r = state.openId && byId(state.openId);
  let body;
  if (state.loading) body = `<p class="empty">Chargement…</p>`;
  else if (state.error) body = `<p class="empty">${esc(state.error)}</p>`;
  else if (r) body = detailView(r);
  else if (state.view === "plan") body = planView();
  else if (state.view === "shop") body = shopView();
  else body = recipesView();

  $app.innerHTML = `<main class="page ${r ? "flush" : ""}">${body}</main>${r ? ctaBar(r) : tabbar()}`;
  window.scrollTo(0, top ? 0 : y);
}

/* ---------- Actions ---------- */

const actions = {
  tab(el) {
    state.view = el.dataset.view;
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
    render();
  },
  filters() {
    state.filtersOpen = !state.filtersOpen;
    if (!state.filtersOpen) state.openCat = null;
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
  reset() {
    state.filters = {};
    state.quick = false;
    state.openCat = null;
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
  check(el) {
    const key = el.dataset.key;
    if (state.checked[key]) delete state.checked[key];
    else state.checked[key] = true;
    saveState();
    render();
  },
  "uncheck-all"() {
    state.checked = {};
    saveState();
    render();
  },
  "clear-plan"() {
    if (!confirm("Vider la semaine ?")) return;
    state.plan = {};
    state.checked = {};
    saveState();
    render();
  },
};

$app.addEventListener("click", (e) => {
  const el = e.target.closest("[data-action]");
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});

// La recherche ne re-rend que le fil, pour ne pas perdre le focus du champ.
$app.addEventListener("input", (e) => {
  if (e.target.id !== "q") return;
  state.query = e.target.value;
  document.getElementById("feed").innerHTML = feedHtml();
});

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
  const away = hiddenAt && Date.now() - hiddenAt > RESHUFFLE_AFTER_MS;
  if (away && !state.loading && !state.openId && state.view === "recipes") {
    shuffleOrder();
    render({ top: true });
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
