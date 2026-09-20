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

## Conventions de code

_À définir avec la stack._

## Pièges et leçons

_À compléter._
