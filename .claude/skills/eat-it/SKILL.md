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
- **Tout en français dans l'app** (demande explicite de l'utilisateur) : quand une source est en anglais, tout est traduit : titre, noms d'ingrédients, unités, étapes, notes, tags. Termes usuels : `light soy sauce` → sauce soja légère, `dark soy sauce` → sauce soja foncée, `oyster sauce` → sauce d'huître, `corn flour/starch` → fécule de maïs, `bean sprouts` → germes de soja, `spring onions` → oignons verts, `peppers` → poivrons, `chilli oil` → huile pimentée, `meal prep` → préparer ses repas à l'avance. Les emprunts entrés dans l'usage (banana bread, sushi bowl, airfryer, teriyaki) et les noms propres restent tels quels.
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
  "servings": 4,                // portion d'origine pour laquelle les quantités sont écrites (sert au calcul)
  "time": 25,                   // minutes, total
  "image": "images/carbonara.jpg",
  "imageFocus": "50% 70%",      // optionnel : cadrage de la photo dans les cartes 16/10 (object-position)
  "categories": ["repas"],      // catégorie(s) de plat : repas, entrée, apéro, dessert, encas, boisson, cocktail
  "tags": { "protein": ["porc"], "vegetable": ["carotte"], "season": ["toute l'année"], "dish": ["pâtes"], "cuisine": ["italienne"] },
  "source": "https://...",      // optionnel : lien d'origine
  "ingredients": [
    { "name": "spaghetti", "qty": 400, "unit": "g", "aisle": "pantry" },
    { "name": "sel", "qty": null, "unit": "", "aisle": "pantry" }
  ],
  "steps": ["...", "..."],
  "notes": "optionnel"
}
```

- **Gâteaux, cakes et autres recettes non proportionnelles** : ajouter `"scalable": false` et `"yieldLabel": "parts"` (ou `"moelleux"`…). L'app n'affiche alors pas de sélecteur de personnes mais « Donne 8 parts », et les quantités restent celles de la source. Sans `scalable: false`, `yieldLabel` n'est utilisé que pour l'affichage. Petites préparations individuelles (ex. 4 moelleux) : les laisser proportionnelles.
- **Nombre de personnes : l'app affiche 2 par défaut pour toute recette** (`DEFAULT_SERVINGS` dans `app.js`, demandé par l'utilisateur), quelle que soit la valeur de `servings`. Donc `servings` = la portion telle que la source l'écrit, sans rééchelonner à la main. Si la source ne donne pas le nombre de personnes, l'estimer d'après les quantités (ex. 700 g de gnocchis ≈ 4) et le signaler dans `notes`.
- **Ne jamais inventer en silence** : quantité, temps ou nombre de personnes absents de la source = estimés, et dit clairement (dans `notes` de façon courte, et à l'utilisateur dans le compte rendu). Ingrédient cité dans les étapes mais absent de la liste : l'ajouter avec `qty: null` et le signaler.
- **`categories` = catégorie(s) de plat, obligatoire pour toute nouvelle recette** : `repas` (plat principal, accompagnement compris), `entrée`, `apéro`, `dessert`, `encas`, `boisson`, `cocktail`. Plusieurs valeurs possibles (ex. `["apéro", "encas"]`, `["dessert", "encas"]`). C'est la navigation principale de l'accueil (rangée « Tout · Repas · Apéro… »). Seules les catégories qui contiennent au moins une recette apparaissent : ajouter la première recette d'une catégorie suffit à faire apparaître son onglet, sans toucher au code. Une recette sans `categories` compte comme `repas`. Ne pas confondre avec `tags.dish` (type de plat : pâtes, gratin…).
- **`tags` = objet par catégorie de filtre** (chaque catégorie est un tableau, omise si vide). Ce sont les filtres de l'accueil : OU à l'intérieur d'une catégorie, ET entre catégories. Toujours remplir tous les champs pertinents pour une nouvelle recette, en réutilisant les valeurs existantes :
  - `protein` (protéine principale) : `viande hachée`, `porc`, `poulet`, `poisson & fruits de mer`, `tofu`, `fromage`, `œufs`, `légumineuses`, `végétarien` (à ajouter dès qu'il n'y a ni viande ni poisson, en plus de la protéine réelle). Ajouter `bœuf`… si une recette l'exige.
  - `vegetable` (légumes mis en avant, en forme générique : `chou`, `courgette`, `champignon`, `patate douce`, `pomme de terre`, `brocoli`, `carotte`, `avocat`, `poivron`, `tomate`…). Peut être vide.
  - `method` (cuisson) : `airfryer`, `four`. Catégorie « 🔥 Cuisson » de l'accueil.
  - `season` : `printemps`, `été`, `automne`, `hiver`, ou `["toute l'année"]` (qui correspond à n'importe quelle saison choisie). Saison = celle où les légumes principaux sont de saison / où le plat a du sens (plat réconfortant = automne/hiver, salade fraîche = printemps/été).
  - `dish` (type de plat) : `pâtes`, `nouilles`, `gnocchis`, `riz`, `bowl`, `salade`, `mijoté`, `sauté`, `poêlée`, `gratin`, `grillade`, `poisson`, `légumes rôtis`, `accompagnement`, `dessert`, `gâteau`…
  - `cuisine` : `italienne`, `asiatique`, `japonaise`, `tex-mex`, `indienne`, `orientale`, `française`… (optionnel).
  - Le filtre « ⚡ Rapide » n'est pas un tag : il est calculé (`time` ≤ 25 min, `QUICK_MAX_MIN` dans `app.js`). Ajouter une nouvelle catégorie = l'ajouter à `FILTERS` dans `app.js` ; les nouvelles valeurs, elles, apparaissent toutes seules.
  - Les étiquettes affichées sur les cartes viennent de `dish`, `cuisine` puis `protein` (2 max sur la carte).
- `aisle` : `produce`, `meat`, `dairy`, `pantry`, `bakery`, `frozen`, `drinks` (alcools, sodas, bières… « Boissons & alcools »), `other` (rayons de la liste de courses).
- **Boissons et cocktails** : `categories: ["cocktail"]` (+ `"apéro"`) ou `["boisson"]`. Cocktails écrits **pour 1 verre** (`servings: 1`, l'app affiche 2 par défaut), quantités en `cl`, tag `dish: ["cocktail"]`, mention « À consommer avec modération » dans `notes`. Les `cl`, `ml` et `l` se regroupent dans la liste de courses. L'ingrédient **`eau`** n'apparaît jamais dans la liste de courses (`ALWAYS_HIDDEN`) mais s'écrit normalement dans la recette (« 1000 ml d'eau ») ; `eau gazeuse` reste, lui, dans la liste. Les glaçons se notent `qty: null` (rayon `frozen`).
- `qty: null` = « au goût », non additionné dans la liste de courses.
- `unit` : `g`, `ml`, `c. à soupe`, `c. à café`, ou `""` pour des pièces. Unités-mots au singulier (`boîte`, `gousse`, `pincée`) : l'app met le pluriel toute seule et ajoute « de/d’ » (« 2 boîtes de pois chiches »). Le nom de l'ingrédient s'écrit donc sans unité entre parenthèses.
- Pièces sans unité (`unit: ""`) : le nom s'écrit au singulier (« oignon », « œuf »), l'app ajoute le « s » si qté > 1. Pour un nom composé ou irrégulier, ajouter `"plural": "pommes de terre"` à l'ingrédient.
- Pour que la liste de courses additionne bien, un même ingrédient doit toujours s'écrire pareil (minuscules, pluriel cohérent : « oignon », « œuf »…) et avec la même unité d'une recette à l'autre. Pas de conversion d'unités pour l'instant.

## Ajouter une recette depuis un lien

1. Télécharger la page avec `curl -sL -A "Mozilla/5.0"` (dans le dossier temporaire, pas dans le projet).
2. Chercher d'abord le JSON-LD (`<script type="application/ld+json">`, objet `@type: Recipe`, souvent dans un `@graph`) : ingrédients, étapes, durées, nombre de personnes, images. Les sites WordPress avec WP Recipe Maker (ex. freethepickle.fr) le fournissent. Sinon, lire le HTML.
3. Les groupes d'ingrédients (« Pour la marinade »…) ne sont pas dans le JSON-LD : les retrouver dans le HTML (`wprm-recipe-group-name`) pour ne pas mal interpréter les étapes.
4. **Réécrire** la recette avec nos mots (infinitif, phrases courtes), au lieu de copier le texte. Toujours renseigner `source` avec l'URL d'origine et citer le site dans `notes`.
5. Normaliser : `càs` → `c. à soupe`, `càc` → `c. à café`, fractions en décimaux (`½` → `0.5`), noms d'ingrédients au singulier sauf « choux de Bruxelles »-style avec unité de poids, un `aisle` par ingrédient, `time` = préparation + cuisson. Réutiliser exactement les noms déjà présents dans `data/recipes.json` (ex. `huile d'olive`) pour que la liste de courses additionne.
6. Image : télécharger la version ~768–960 px (les sites WordPress proposent des variantes `-768x960.jpg`), la regarder avant de l'intégrer, la nommer `images/<id>.jpg`. Les photos en portrait sont recadrées au centre dans les cartes 16/10 : vérifier que le plat reste visible.
7. Valider le JSON (ids uniques, champs obligatoires, fichier image existant), tester la liste de courses, puis commit + push.

## Ajouter une recette depuis TikTok

L'utilisateur a TikTok sur son téléphone : il envoie le lien (Partager > Copier le lien, transmis au PC par message). Sans rien installer :

1. Résoudre le lien court : `curl -sL -o /dev/null -w "%{url_effective}" "https://vm.tiktok.com/XXXX/"` donne l'URL complète `https://www.tiktok.com/@auteur/video/ID`.
2. Légende et vignette via l'API oEmbed, sans authentification : `curl -s -A "Mozilla/5.0" "https://www.tiktok.com/oembed?url=<URL complète>"`. Le champ `title` contient la légende (la recette y est souvent en entier), `thumbnail_url` la couverture de la vidéo (portrait, ~1048×1518), `author_name` le créateur.
3. Télécharger la vignette tout de suite : son URL est signée et expire.
4. Ensuite, même normalisation que pour un lien de site (étapes 4 à 7 ci-dessus). `source` = URL complète sans les paramètres de suivi (`?_r=…`).
5. Si la légende renvoie vers un site (« recette sur mon site, lien en bio ») : le profil `https://www.tiktok.com/@auteur` contient `"bioLink":{"link":"…"}` (souvent un Linktree, dont les URL sont dans le HTML). Suivre jusqu'au site, chercher la page dans `sitemap.xml` (sitemaps de blog) puis lire l'article. Exemple : swissfitcook.com (Shopify, `/blogs/recettes/<slug>`), pas de JSON-LD Recipe, le texte de l'article suffit ; sa photo est dans `og:image` (Shopify accepte `&width=960`).
6. Si la légende ne contient pas la recette (texte seulement à l'écran ou à l'oral) et qu'aucun site n'existe : demander à l'utilisateur des captures d'écran de la vidéo et les lire (les images sont lisibles). N'installer `yt-dlp`/`ffmpeg`/Whisper que si l'utilisateur le décide.
7. Les légendes peuvent être en anglais (ex. Marion Grasby) : traduire, convertir les unités impériales en métrique si besoin (`tbsp` → `c. à soupe`, `tsp` → `c. à café`).

## Ajouter une recette depuis Instagram

**Pas possible sans l'utilisateur.** Les pages `instagram.com/reel/...` (y compris `/embed/captioned/`) renvoient un mur de connexion de ~627 Ko identique pour tous les reels, sans légende ni image. Ne pas passer par des proxys tiers.

Ce qui marche : l'utilisateur ouvre le reel dans son navigateur sur le PC (légende copiable sur la version web, pas dans l'appli mobile), **colle la légende dans le chat** et joint **une capture d'écran du plat** (les images collées arrivent dans le dossier `images/` de la session, chemin donné dans le message ; les lire avec l'outil de lecture d'images). Il numérote les recettes dans l'ordre des liens : associer chaque légende au reel du même rang et le dire dans le compte rendu.

Photos : les captures de reels contiennent souvent une bannière de texte (« HIGH PROTEIN… ») ou des mains. Recadrer avec Pillow pour garder le plat (ex. `crop((0, 195, w, h))`), sinon régler `imageFocus`. Attention aux chemins Windows en Python : utiliser des `/` (un `\1.png` est lu comme le caractère `\x01`). Pour les légendes, ne pas inventer ce qui manque (nombre de parts, temps) : l'indiquer dans `notes`.

Conversions faites à la main quand la légende donne des poids pour des ingrédients déjà présents ailleurs en cuillères : convertir vers l'unité déjà utilisée (ex. sirop d'érable 5-10 g ≈ ½ c. à soupe) et garder la valeur d'origine dans l'étape, pour que la liste de courses additionne.

## Chercher « les meilleures recettes » sur internet

Quand l'utilisateur demande de trouver les meilleures recettes d'un plat ou d'un thème :

1. Outils : `WebSearch` et `WebFetch` sont différés, les charger avec `ToolSearch` (`select:WebSearch,WebFetch`). Lancer une recherche par plat, en parallèle.
2. **Marmiton et CuisineAZ refusent le robot de l'outil de recherche** (erreur 400 sur `allowed_domains`) : ne pas les utiliser ni contourner le blocage ; passer par `blocked_domains: ["marmiton.org", "cuisineaz.com"]`. Sources qui fonctionnent bien : Jow, 750g, Del's Cooking Twist, Mamie Simone, blogs. Certains sites répondent 403 au téléchargement direct (chefcuisto.com, papillesetpupilles.fr) : passer à un autre candidat.
3. Choisir sur des **critères objectifs** : lire le JSON-LD `Recipe` de chaque candidat (`aggregateRating.ratingValue` et `ratingCount`) avec un script Node (`fetch` + parse des `<script type="application/ld+json">`, `@graph` aplati) et privilégier la meilleure note avec beaucoup d'avis. Une note de 5 sur 2 avis ne vaut pas 4,6 sur 400 : le dire.
4. **Vérifier que la recette correspond vraiment à la demande** : ex. le « hachis parmentier express » de Jow utilise des flocons de purée, pas de vraies pommes de terre → choisir une autre source. Préférer aussi la version complète à la version minimaliste quand la note n'est pas décisive, et l'expliquer à l'utilisateur.
5. Jow donne les quantités **pour 1 portion** (`servings: 1`) : l'app les multiplie pour 2, ne pas les modifier.
6. Noter dans `notes` la source et sa note quand elle existe (« notée 4,6/5 sur 201 avis »), ou « aucune note publiée » sinon.
7. Photo : voir « Images des recettes ». Écarter les photos avec texte incrusté ou trop petites (vignettes `-225x225` : retirer le suffixe pour la taille réelle) et prendre une photo libre de Wikimedia Commons à la place.
8. Réécrire (pas de copie), normaliser, valider, tester la liste de courses, commit + push.

## Recettes classiques (sans source)

Quand l'utilisateur demande un plat classique par son nom (bolognaises, chili…), écrire la recette soi-même, sans champ `source`, avec les mêmes conventions de normalisation. Réutiliser les noms d'ingrédients déjà présents (ex. `viande hachée 5 %`, `tomates concassées` en `boîte`, `ail` en `gousse`). Pour la photo, chercher une image libre sur Wikimedia Commons (`https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=960&format=json&titles=File:...`), regarder le résultat avant de l'utiliser, et **ajouter une ligne dans `images/CREDITS.md`** (auteur + licence, souvent CC BY-SA, l'attribution est obligatoire et le dépôt est public).

Cas non traité : recette collée en texte (même normalisation, sans étape de téléchargement).

## Images des recettes

- Champ `image` de la recette : chemin relatif `images/<id>.jpg`. Sans image (ou si elle ne charge pas), l'app affiche un dégradé coloré avec 🍽️ : une recette sans photo reste présentable.
- **Les images sont stockées dans le dépôt**, jamais en lien externe (hotlinking cassé, pas de hors ligne). Format JPEG, ~960 px de large, idéalement < 250 Ko.
- **Droits** : le dépôt est public. Les photos des sites/vidéos d'origine appartiennent à leurs auteurs (on les garde pour un usage personnel, avec renvoi vers `source`) ; les photos Wikimedia sont sous licence libre et à créditer dans `images/CREDITS.md`. Certaines sources servent du PNG/WebP sous un nom `.jpg` : `tools/resize_image.py` re-encode en vrai JPEG (vérifier avec `file`).
- **Redimensionner avec `python tools/resize_image.py`** (Pillow, installé sur la machine avec `pip install --user pillow`) : sans argument, il réduit toutes les images de `images/` plus larges que 960 px. À lancer après chaque téléchargement (les vignettes TikTok font jusqu'à 2160×3840 et ~1 Mo).
- **Les vignettes TikTok ont souvent un titre incrusté (souvent en anglais)** : comme l'app est tout en français, recadrer avec Pillow pour ne garder que le plat, hors du texte (regarder l'image entière avant, puis un `crop` d'environ 16/10 sur la zone sans texte). Exemples : ramen (`crop((0,0,960,630))`), pois chiches (`crop((0,950,960,1560))`).
- Les vignettes TikTok sont en portrait : la carte en montre le centre 16/10. Vérifier le recadrage (aperçu avec Pillow) et, si un visage ou du texte gêne, régler `imageFocus`.
- Ajout via un lien : récupérer l'image principale de la page (balise `og:image`), la télécharger dans `images/`, puis référencer le chemin. Pour un plat sans photo : chercher une image libre (Wikimedia Commons) ; les recettes classiques utilisent des photos Wikimedia (`-A "Eat-it/1.0 (personal recipe app)"` obligatoire, sinon refusé), créditées dans `images/CREDITS.md`.

## Filtres et ordre d'affichage

- Structure de l'accueil : recherche → **rangée de catégories de plats** (Tout, Repas, Apéro, Desserts…, avec compteur) → **rangée de filtres, toujours visible, en petits boutons et adaptée à la sélection** (voir ci-dessous ; un toucher déplie les choix de la catégorie, avec le nombre de recettes de chacun) → **deux gros boutons côte à côte : « 🎲 Pas d'idée ? » et « 🧊 Mon frigo »** → « N recettes · 🔀 Mélanger » → cartes → lien « 💾 Sauvegarde et réglages ». **L'utilisateur n'aime pas le bouton à roue dentée qui repliait les filtres** (essayé, refusé) : ne pas les recacher derrière un bouton ; réduire plutôt la taille. **Les filtres sont intelligents (`matchesExcept`, `filterChoices`)** : une catégorie de filtre n'apparaît que si elle permet de trier la sélection en cours (catégorie de plat + autres filtres + recherche) ; ses choix ne montrent que les valeurs présentes dans la sélection, avec leur nombre ; une catégorie où toutes les recettes ont la même valeur est masquée (ex. Desserts : pas de Protéine ni de Légume ; « Saison » masqué si toutes les recettes sont « toute l'année »). ⚡ Rapide et ♥ Favoris n'apparaissent que s'ils trient réellement. Changer de catégorie de plat remet les filtres à zéro. **Le mode frigo doit rester bien visible** (il était introuvable quand c'était un petit bouton en bout de rangée qui défile) : ne pas le rétrograder. Catégorie de plat et filtres se cumulent. Le « 🎲 » tire au hasard parmi la sélection courante.

## Fonctions de l'app (toutes côté téléphone, sans serveur)

- **Favoris** ♥ (cartes et fiche) + filtre ♥ Favoris.
- **Mode cuisine** (« 👨‍🍳 Mode cuisine » sur la fiche) : une étape en grand à la fois, glisser ou boutons Précédent/Suivant, liste d'ingrédients à la demande (🧾), écran maintenu allumé (`navigator.wakeLock`, à redemander au retour au premier plan), **minuteurs détectés dans le texte des étapes** (« 5 à 6 minutes » → bouton, durée la plus courte ; regex `detectTimers`) avec alarme sonore/vibration, pastille ⏱ visible ailleurs dans l'app. Donc **écrire les durées en toutes lettres dans les étapes** (« 20 minutes », « 1 heure ») pour que le minuteur marche.
- **Semaine par jour** : chaque recette de la semaine peut être placée sur L M M J V S D (`planDay`) ; groupes par jour + « Pas encore placé », jour du jour entouré.
- **Courses** : ajout d'articles à la main (« Mes ajouts »), **📤 Partager** (feuille de partage iOS, sinon copie dans le presse-papiers), **🏠 J'ai déjà** (masque des ingrédients de la liste ; `sel` et `poivre` masqués par défaut, `DEFAULT_HIDDEN`).
- **🧊 Frigo** : l'utilisateur saisit ce qu'il a, les recettes sont filtrées/triées par part d'ingrédients déjà possédés (pastille « 🧊 4/9 » ; sel, poivre, huile, eau ignorés). Le match est un `includes` sur le nom normalisé : **des noms d'ingrédients simples et génériques aident** (ex. « blanc de poulet », pas « filet de volaille fermier »).
- **Mon avis** (fiche) : étoiles 1-5, notes libres, « ✓ Je l'ai cuisiné » (date, compteur). L'étoile s'affiche sur les cartes.
- **Courses malignes** : **un seul article par produit** même si les recettes le comptent en unités différentes (« 25 g + 6½ c. à soupe de sauce soja ») ; conversions faites seulement quand elles sont sûres et que l'autre unité est déjà présente (`c. à café` → `c. à soupe` ÷3, `cl` → `ml`, `kg` → `g`, jamais g ↔ cuillères, qui dépend de l'aliment). Les produits proches restent distincts (sauce soja / foncée / légère). La clé des cases cochées est le nom normalisé du produit. Bascule **Par rayon / Par recette** (`shopMode`, enregistré) : en mode recette, une case cochée l'est partout.
- **Partage d'une recette** (⤴ sur la fiche) : envoie un lien `…/eat-it/r/<id>/` par la feuille de partage iOS (sinon copie). Cette page est **générée** (`python tools/build_share_pages.py`) : balises Open Graph (photo, titre, durée → bel aperçu dans les messageries) puis redirection vers `#/r/<id>`, que l'app ouvre (`applyHash`, aussi à chaud via `hashchange`). Un lien ouvert sur iPhone s'ouvre dans Safari, pas dans l'app installée (limite d'iOS), et marche aussi pour quelqu'un qui n'a pas l'app. **À relancer après tout ajout, retrait ou changement de titre/photo, puis commiter le dossier `r/`.**
- **Sauvegarde** (« 💾 Sauvegarde et réglages ») : export JSON (partage/presse-papiers), restauration par collage, gestion des articles masqués, effacement total.
- Données enregistrées dans `localStorage` (clé `eatit.v1`) : `plan`, `planDay`, `checked`, `favs`, `journal`, `extras`, `hidden`, `fridge`. **Ne jamais renommer ni retirer ces clés sans migration** : ce serait perdre les favoris et notes de l'utilisateur. Les recettes, elles, ne sont jamais dans `localStorage`.
- **Idées volontairement écartées par l'utilisateur** : macros/calories (les kcal restent seulement dans les `notes` quand la source les donne) et mode hors ligne complet (précache des photos). Ne pas les proposer à nouveau sauf demande.
- **L'ordre des recettes est aléatoire** : mélangé au chargement, sur demande (« 🔀 Mélanger »), et automatiquement quand l'app revient au premier plan après plus de 10 min sur l'accueil (`RESHUFFLE_AFTER_MS`). Il reste stable pendant qu'on consulte l'accueil, pour que la liste ne saute pas.

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
- Scripts Node lancés depuis Bash sous Windows : utiliser `fetch` de Node plutôt que `execSync("curl … -o /dev/null")` (échoue), et des chemins Windows (`C:/other/Eat-it/…`) dans `fs`, pas `/c/other/…`.

## Vérifier son travail

- Syntaxe : `node --check app.js`. Données : charger `data/recipes.json` et vérifier `id` uniques et champs obligatoires.
- Rendu : servir le dossier (`python -m http.server`), puis capture avec Edge headless à taille d'iPhone (`--window-size=390,844 --force-device-scale-factor=2 --virtual-time-budget=4000 --screenshot=...`) et regarder l'image. Pour capturer un écran autre que l'accueil, une page temporaire avec une iframe permet d'appeler `actions.*` via `contentWindow.eval` ; la supprimer ensuite. Le chemin de sortie de `--screenshot` doit être un chemin Windows absolu.
- Arrêter le serveur de test ensuite (cibler uniquement `Get-NetTCPConnection -LocalPort 8123 -State Listen`, sinon on tombe sur des connexions fermées appartenant au système, et `Stop-Process` échoue en boucle).

- Piège de capture : Edge headless impose une largeur de fenêtre minimale, donc `--window-size=390,...` sur la page directe donne un rendu plus large que 390 px, recadré à droite (faux positif). Pour vérifier la mise en page mobile, charger l'app dans une iframe de 390 px de large (page de test temporaire).

## Publication

- Dépôt : https://github.com/Julien2501/eat-it (public, GitHub Pages depuis `main`, dossier racine). App : https://julien2501.github.io/eat-it/.
- **Checklist après un ajout/retrait de recette** : valider `data/recipes.json` (ids uniques, champs obligatoires dont `categories` et `tags`, rayons valides, images existantes, pas d'image orpheline), `python tools/build_share_pages.py`, mettre à jour `images/CREDITS.md` si photo Wikimedia, puis commit (avec `r/`) + push.
- API Wikimedia : au-delà d'une dizaine de requêtes rapprochées elle répond « You are making too many requests » (texte, pas du JSON) : espacer les appels de quelques secondes et réessayer avec une pause de ~40 s.
- Ajouter une recette ou modifier l'app = commit + `git push` sur `main` ; Pages se met à jour en ~1 min. C'est le seul moyen pour l'utilisateur de voir le résultat sur son téléphone.
- Le git de la machine est connecté à un autre compte GitHub (JulienV2501) que celui du dépôt (Julien2501) : en cas d'erreur 403 au push, les identifiants mémorisés sont les mauvais.

## Pièges et leçons

- Les noms d'ingrédients doivent être écrits pareil d'une recette à l'autre, sinon la liste de courses ne les additionne pas (voir schéma).
- Un lien `<a href>` vers une page externe depuis une PWA iOS s'ouvre dans l'app ; c'est voulu pour `source`, mais ne pas y mettre de navigation interne.
