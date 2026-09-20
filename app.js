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
  tag: null,
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

function recipeMatches(r) {
  if (state.tag && !(r.tags || []).includes(state.tag)) return false;
  const q = norm(state.query);
  if (!q) return true;
  const hay = norm([r.title, ...(r.tags || []), ...r.ingredients.map((i) => i.name)].join(" "));
  return hay.includes(q);
}

function feedHtml() {
  const items = state.recipes.filter(recipeMatches);
  if (!items.length) return `<p class="empty"><span class="big">🔍</span>Aucune recette ne correspond.</p>`;
  return `<ul class="feed">${items
    .map((r) => {
      const inPlan = r.id in state.plan;
      const tags = (r.tags || []).map((t) => `<span class="pill plain">${esc(t)}</span>`).join("");
      return `<li class="rcard">
        <button class="fab ${inPlan ? "on" : ""}" data-action="${inPlan ? "remove" : "add"}" data-id="${esc(r.id)}"
          aria-label="${inPlan ? "Retirer de la semaine" : "Ajouter à la semaine"}">${inPlan ? "✓" : "+"}</button>
        <button class="open" data-action="open" data-id="${esc(r.id)}">
          ${imgHtml(r)}
          <div class="body">
            <div class="title">${esc(r.title)}</div>
            <div class="pills"><span class="pill">⏱ ${r.time} min</span>${tags}</div>
          </div>
        </button>
      </li>`;
    })
    .join("")}</ul>`;
}

function recipesView() {
  const tags = [...new Set(state.recipes.flatMap((r) => r.tags || []))].sort((a, b) => a.localeCompare(b, "fr"));
  return `<div class="brand"><div class="logo">🍽️</div><div class="name">Eat-it</div>
      <div class="count">${plural(state.recipes.length, "recette", "recettes")}</div></div>
    <input id="q" class="search" type="search" placeholder="Rechercher une recette, un ingrédient…" value="${esc(state.query)}">
    <div class="chips">${tags
      .map((t) => `<button class="chip ${state.tag === t ? "on" : ""}" data-action="tag" data-tag="${esc(t)}">${esc(t)}</button>`)
      .join("")}</div>
    <button class="surprise" data-action="random"><span class="dice">🎲</span><div><b>Pas d’idée ?</b><span>Tire une recette au hasard</span></div></button>
    <div id="feed">${feedHtml()}</div>`;
}

function stepperHtml(id, servings) {
  return `<div class="stepper">
    <button data-action="step" data-id="${esc(id)}" data-delta="-1" aria-label="Moins de personnes">−</button>
    <span>${plural(servings, "personne", "personnes")}</span>
    <button data-action="step" data-id="${esc(id)}" data-delta="1" aria-label="Plus de personnes">+</button>
  </div>`;
}

function currentServings(r) {
  return state.plan[r.id] ?? state.detailServings ?? DEFAULT_SERVINGS;
}

function detailView(r) {
  const servings = currentServings(r);
  const factor = servings / r.servings;
  const tags = (r.tags || []).map((t) => `<span class="pill plain">${esc(t)}</span>`).join("");
  return `<div class="hero">${imgHtml(r)}<button class="back" data-action="close" aria-label="Retour">‹</button></div>
    <div class="sheet">
      <h1>${esc(r.title)}</h1>
      <div class="pills"><span class="pill">⏱ ${r.time} min</span>${tags}</div>
      <div class="servings-card"><b>Pour</b>${stepperHtml(r.id, servings)}</div>
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
      ${inPlan ? "✓ Dans la semaine · retirer" : `Ajouter à la semaine · ${plural(servings, "personne", "personnes")}`}
    </button></div></div>`;
}

function planView() {
  const ids = Object.keys(state.plan).filter(byId);
  if (!ids.length) {
    return `<h1>Ma semaine</h1><p class="empty"><span class="big">📅</span>Aucune recette choisie.<br>Ajoute-en depuis l’onglet Recettes avec le bouton +.</p>`;
  }
  const total = ids.reduce((n, id) => n + state.plan[id], 0);
  return `<h1>Ma semaine</h1>
    <p class="muted">${plural(ids.length, "recette", "recettes")} · ${plural(total, "repas", "repas")} au total</p>
    <ul class="plan">${ids
      .map((id) => {
        const r = byId(id);
        return `<li class="prow">
          ${imgHtml(r)}
          <div class="info">
            <button class="title" data-action="open" data-id="${esc(id)}">${esc(r.title)}</button>
            ${stepperHtml(id, state.plan[id])}
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
    const servings = Number(el.dataset.servings) || DEFAULT_SERVINGS;
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
  tag(el) {
    state.tag = state.tag === el.dataset.tag ? null : el.dataset.tag;
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
  } catch {
    state.error = "Impossible de charger les recettes.";
  }
  state.loading = false;
  render();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
