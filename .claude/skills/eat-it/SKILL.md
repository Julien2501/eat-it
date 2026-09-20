---
name: eat-it
description: Conventions, décisions d'architecture et bonnes pratiques du projet Eat-it (app mobile de recettes + liste de courses). À consulter avant tout travail sur le projet, et à mettre à jour dès qu'une décision ou une façon de faire est validée.
---

# Eat-it — façons de faire

Ce skill est la mémoire de travail du projet. Il est alimenté au fil de l'eau : toute décision, convention ou piège rencontré y est consigné.

## Le projet en bref

App utilisable sur téléphone qui recense des recettes de cuisine, pour les moments où on ne sait pas quoi cuisiner.

Trois façons d'ajouter une recette :
1. Saisie manuelle (ingrédients + étapes).
2. Lien internet : scraping puis réécriture de la recette.
3. Vidéo (TikTok ou autre) : compréhension de la vidéo pour en tirer la recette.

Objectif final : sélectionner des recettes et un nombre de personnes, puis produire une liste de courses (ex. pour la semaine).

## Règles de fonctionnement

- Langue : échanges et README en français. Code et identifiants en anglais.
- Le README est une première version de l'utilisateur ; il sera entièrement réécrit au fil du projet, proprement.
- Chaque décision validée (stack, structure, conventions) est ajoutée ci-dessous, avec son pourquoi.

## Décisions d'architecture

- **App 100 % locale sur le téléphone (iPhone).** L'utilisateur ne veut ni serveur ou commande à lancer depuis le PC à chaque usage, ni lourdeur de déploiement. L'app s'installe une fois et fonctionne seule, hors ligne.
- **L'app est en lecture seule.** Aucun ajout de recette depuis le téléphone, donc : pas de backend, pas de clé d'API, pas de scraping dans l'app. Les recettes sont ajoutées via Claude dans VS Code (l'utilisateur donne texte, lien ou vidéo ; Claude scrape/analyse et écrit les données).
- **Stack : PWA statique en vanilla HTML/CSS/JS, sans étape de build.** Pourquoi : iPhone, donc pas d'APK ; une app native hors App Store expire au bout de 7 jours sans compte payant ; une PWA s'installe via Safari > « Sur l'écran d'accueil ».
- **Données** : toutes les recettes dans `data/recipes.json` (un seul fichier, tableau de recettes). Ajouter une recette = éditer ce fichier. Le schéma est décrit plus bas.
- L'état de l'utilisateur (recettes choisies pour la semaine, cases cochées de la liste de courses) vit dans `localStorage` sur le téléphone, jamais dans les données.
- Le service worker est en « réseau d'abord, cache en secours » : les nouvelles recettes arrivent dès que le téléphone a du réseau, et l'app marche hors ligne (magasin).
- **Hébergement de la PWA : à trancher.** iOS exige du HTTPS pour installer une PWA correctement, donc il faut servir les fichiers statiques quelque part (piste : GitHub Pages, un push met les recettes à jour).

## Schéma d'une recette (`data/recipes.json`)

```json
{
  "id": "carbonara",            // slug unique, minuscules, sans accents
  "title": "Pâtes carbonara",
  "servings": 4,                // nombre de personnes pour lequel les quantités sont écrites
  "time": 25,                   // minutes, total
  "tags": ["pâtes", "rapide"],
  "source": "https://...",      // optionnel : lien d'origine
  "ingredients": [
    { "name": "spaghetti", "qty": 400, "unit": "g", "aisle": "pantry" },
    { "name": "sel", "qty": null, "unit": "", "aisle": "pantry" }
  ],
  "steps": ["...", "..."],
  "notes": "optionnel"
}
```

- `aisle` : `produce`, `meat`, `dairy`, `pantry`, `bakery`, `frozen`, `other` (rayons de la liste de courses).
- `qty: null` = « au goût », non additionné dans la liste de courses.
- `unit` : `g`, `ml`, `c. à soupe`, `c. à café`, ou `""` pour des pièces. Unités-mots au singulier (`boîte`, `gousse`, `pincée`) : l'app met le pluriel toute seule et ajoute « de/d’ » (« 2 boîtes de pois chiches »). Le nom de l'ingrédient s'écrit donc sans unité entre parenthèses.
- Pièces sans unité (`unit: ""`) : le nom s'écrit au singulier (« oignon », « œuf »), l'app ajoute le « s » si qté > 1. Pour un nom composé ou irrégulier, ajouter `"plural": "pommes de terre"` à l'ingrédient.
- Pour que la liste de courses additionne bien, un même ingrédient doit toujours s'écrire pareil (minuscules, pluriel cohérent : « oignon », « œuf »…) et avec la même unité d'une recette à l'autre. Pas de conversion d'unités pour l'instant.

## Images des recettes

- Champ `image` de la recette : chemin relatif `images/<id>.jpg`. Sans image (ou si elle ne charge pas), l'app affiche un dégradé coloré avec 🍽️ : une recette sans photo reste présentable.
- **Les images sont stockées dans le dépôt**, jamais en lien externe (hotlinking cassé, pas de hors ligne). Format JPEG, ~960 px de large, idéalement < 250 Ko.
- Ajout via un lien : récupérer l'image principale de la page (balise `og:image`), la télécharger dans `images/`, puis référencer le chemin. Pour un plat sans photo : chercher une image libre (Wikimedia Commons) ; les deux recettes d'exemple utilisent des photos Wikipédia (`curl -A "Eat-it/1.0"` obligatoire, sinon refusé).

## Design de l'app

- Style « blog culinaire » : fil de grandes cartes photo (16/10), fiche recette avec image en en-tête et bouton d'action fixe en bas, vignettes dans la semaine, courses classées par rayon avec barre de progression.
- Couleur d'accent orange `#e8590c`. Thème clair/sombre automatique (`prefers-color-scheme`), tout passe par les variables CSS de `:root` dans `style.css`.
- Mobile d'abord : marges de sécurité iOS via `env(safe-area-inset-*)`, cibles tactiles ≥ 34 px, largeur max 640 px.

## Icône de l'app

- Source : `icons/icon.svg` (bol fumant blanc sur dégradé orange). Les PNG `icon-180/192/512.png` en sont rendus ; iOS utilise `icon-180.png` (apple-touch-icon), il faut un carré plein, sans transparence (iOS arrondit lui-même).
- Pour la changer : éditer le SVG, ou partir d'une image fournie par l'utilisateur, puis régénérer les 3 PNG. Rendu sans dépendance avec Edge headless (`msedge --headless --screenshot=... --window-size=S,S`) sur une page qui affiche le SVG à la taille S.
- Sur iPhone, une nouvelle icône n'apparaît qu'après avoir supprimé l'app de l'écran d'accueil puis l'avoir réinstallée depuis Safari.

## Conventions de code

- Vanilla JS, pas de framework, pas de build ni de dépendance. Le rendu est une fonction `render()` qui reconstruit le HTML depuis `state` ; les clics passent par un seul écouteur délégué sur `data-action` (objet `actions`).
- Tout texte venant des données passe par `esc()` avant d'entrer dans le HTML.
- Code et identifiants en anglais, textes de l'interface en français.
- Quand on change les fichiers du shell (JS/CSS), incrémenter `CACHE` dans `sw.js` (`eatit-vN`).

## Vérifier son travail

- Syntaxe : `node --check app.js`. Données : charger `data/recipes.json` et vérifier `id` uniques et champs obligatoires.
- Rendu : servir le dossier (`python -m http.server`), puis capture avec Edge headless à taille d'iPhone (`--window-size=390,844 --force-device-scale-factor=2 --virtual-time-budget=4000 --screenshot=...`) et regarder l'image. Pour capturer un écran autre que l'accueil, une page temporaire avec une iframe permet d'appeler `actions.*` via `contentWindow.eval` ; la supprimer ensuite. Le chemin de sortie de `--screenshot` doit être un chemin Windows absolu.
- Arrêter le serveur de test ensuite (cibler uniquement `Get-NetTCPConnection -LocalPort 8123 -State Listen`, sinon on tombe sur des connexions fermées appartenant au système, et `Stop-Process` échoue en boucle).

## Publication

- Dépôt : https://github.com/Julien2501/eat-it (public, GitHub Pages depuis `main`, dossier racine). App : https://julien2501.github.io/eat-it/.
- Ajouter une recette ou modifier l'app = commit + `git push` sur `main` ; Pages se met à jour en ~1 min. C'est le seul moyen pour l'utilisateur de voir le résultat sur son téléphone.
- Le git de la machine est connecté à un autre compte GitHub (JulienV2501) que celui du dépôt (Julien2501) : en cas d'erreur 403 au push, les identifiants mémorisés sont les mauvais.

## Pièges et leçons

- Les noms d'ingrédients doivent être écrits pareil d'une recette à l'autre, sinon la liste de courses ne les additionne pas (voir schéma).
- Un lien `<a href>` vers une page externe depuis une PWA iOS s'ouvre dans l'app ; c'est voulu pour `source`, mais ne pas y mettre de navigation interne.
