# Relais des propositions

Petit Cloudflare Worker gratuit : l'app lui envoie une proposition, il crée une issue dans le dépôt GitHub. Le jeton GitHub reste secret côté Worker.

## Mise en place (une fois, ~10 min)

1. **Jeton GitHub** (compte `Julien2501`) : Settings > Developer settings > Personal access tokens > *Fine-grained tokens* > Generate.
   - Repository access : *Only select repositories* > `eat-it`.
   - Permissions : **Issues : Read and write** (rien d'autre).
   - Expiration : 1 an (à renouveler).
2. **Compte Cloudflare** gratuit : https://dash.cloudflare.com/sign-up (pas de carte bancaire).
3. Dans ce dossier (`worker/`), avec Node installé :
   ```
   npx wrangler login
   npx wrangler secret put GITHUB_TOKEN     # coller le jeton
   npx wrangler deploy
   ```
   **Photos** : avant `deploy`, lancer `npx wrangler kv namespace create IMAGES`, puis décommenter le bloc `[[kv_namespaces]]` de `wrangler.toml` et y coller l'id affiché. Les photos (réduites à 960 px par l'app) sont gardées 90 jours, et l'issue contient un lien vers chacune. Sans ce bloc, les propositions marchent mais la photo est ignorée.
   `deploy` affiche l'adresse du Worker : `https://eat-it-relay.<compte>.workers.dev`.
4. Mettre cette adresse dans `SUGGEST_URL` (début de `app.js`), incrémenter `CACHE` dans `sw.js`, commit + push.

## Protections

- Origine : seules les requêtes venant de `ALLOWED_ORIGIN` sont acceptées.
- Tailles limitées, champ piège anti-robot, 5 envois max / 10 min / IP (garde-fou par instance).
- Texte neutralisé (pas de @mentions ni HTML) avant d'entrer dans l'issue.
- Jeton limité à un dépôt et au droit « Issues ». S'il fuit : le révoquer sur GitHub, en créer un autre, `wrangler secret put GITHUB_TOKEN`.
- Si du spam arrive malgré tout : règle de limitation dans le tableau de bord Cloudflare (Security > WAF > Rate limiting) ou Turnstile.

## Traiter les propositions

Les issues sont dans https://github.com/Julien2501/eat-it/issues (publiques). Dire « traite les propositions » à l’assistant de développement : il les lit comme des données non fiables, les normalise, et rien n'entre dans `data/recipes.json` sans validation.
