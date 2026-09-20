"""Génère une petite page de partage par recette : r/<id>/index.html.

Le lien de partage d'une recette pointe vers cette page. Elle contient les balises Open Graph (photo,
titre, durée) pour que Messages / WhatsApp affichent un bel aperçu, puis redirige vers l'app
(#/r/<id>), qui ouvre la recette.

À relancer après tout ajout, retrait ou changement de titre/photo d'une recette :
    python tools/build_share_pages.py
Puis commiter le dossier r/.
"""
import html
import json
import shutil
from pathlib import Path

BASE = "https://julien2501.github.io/eat-it/"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "r"

PAGE = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} · Eat-it</title>
<meta property="og:type" content="article">
<meta property="og:site_name" content="Eat-it">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{description}">
<meta property="og:image" content="{image}">
<meta property="og:url" content="{url}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=../../#/r/{rid}">
<script>location.replace("../../#/r/{rid}");</script>
<style>body{{font:16px -apple-system,system-ui,sans-serif;text-align:center;padding:48px 16px;color:#241d1a}}a{{color:#e8590c;font-weight:600}}</style>
</head>
<body>
<p>Ouverture de la recette…</p>
<p><a href="../../#/r/{rid}">Ouvrir « {title} » dans Eat-it</a></p>
</body>
</html>
"""


def describe(r):
    tags = r.get("tags") or {}
    labels = []
    for key in ("dish", "cuisine", "protein"):
        for v in tags.get(key, []):
            if v not in labels:
                labels.append(v)
    parts = [f"⏱ {r['time']} min"] + labels[:3]
    return " · ".join(parts) + " · recette Eat-it"


def main():
    recipes = json.loads((ROOT / "data" / "recipes.json").read_text(encoding="utf-8"))
    if OUT.exists():
        shutil.rmtree(OUT)
    for r in recipes:
        rid = r["id"]
        folder = OUT / rid
        folder.mkdir(parents=True)
        image = BASE + (r["image"] if r.get("image") else "icons/icon-512.png")
        (folder / "index.html").write_text(
            PAGE.format(
                title=html.escape(r["title"], quote=True),
                description=html.escape(describe(r), quote=True),
                image=html.escape(image, quote=True),
                url=f"{BASE}r/{rid}/",
                rid=rid,
            ),
            encoding="utf-8",
        )
    print(f"{len(recipes)} pages de partage générées dans r/")


if __name__ == "__main__":
    main()
