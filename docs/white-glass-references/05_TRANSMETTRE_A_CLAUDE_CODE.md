# Mettre BellumAI à la disposition de Claude Code

Le ZIP White Glass complet pèse environ 158 Mo parce qu'il contient **deux archives historiques du monorepo, une archive de design et une ancienne itération**. Ce n'est pas la forme à importer dans GitHub. Le code applicatif le plus récent fourni est `references/source_uploads/03-belllum-monorepo-main-17-.zip` ; extrait, il contient environ 21 000 fichiers et 238 Mo. Le présent ZIP visuel apporte les 17 captures et les instructions. Vérifie d'abord si le véritable dépôt Git de BellumAI possède des commits plus récents que cet export.

## Chemin le plus court : Claude Code en local

1. Télécharge le ZIP White Glass complet et **ce** ZIP visuel sur ton Mac, puis décompresse les deux. Dans le paquet complet, ouvre `BellumAI_White_Glass/references/source_uploads/` et décompresse `03-belllum-monorepo-main-17-.zip` dans un dossier de travail distinct.
2. Dans le dossier `belllum-monorepo-main`, ajoute le dossier de ce ZIP visuel sous `docs/white-glass-references/`. Ajoute, si utile, le `dist/`, les `docs/` et les `scripts/` de la prévisualisation sous `design/white-glass-preview/`. Ne remplace pas les `apps/` ou les `packages/` du monorepo par ceux d'une maquette.
3. Ouvre Terminal **dans `belllum-monorepo-main`** et lance `claude`. Claude Code lit les fichiers de ce dossier selon le besoin ; il n'est pas nécessaire de joindre 158 Mo à une conversation.
4. Commence par : « Lis `AGENTS.md`, `CLAUDE.md`, `docs/white-glass-references/00_LIRE_EN_PREMIER.md`, le Word illustré, l'atlas, les 19 principes et le prompt complet. Inspecte les 17 images à leur résolution d'origine. Compare au code actuel. Dresse d'abord la carte exigences → composants → données → tests et indique les écarts avant de modifier. White Glass uniquement. »

Si tu as **déjà le dépôt Git BellumAI sur ton Mac**, pars de son état à jour plutôt que de l'export `(17)` ; ajoute seulement `docs/white-glass-references/` et la prévisualisation dans un dossier de référence. Le dossier `dist/` est une démo statique, pas le backend connecté.

Documentation officielle : [Claude Code Quickstart](https://code.claude.com/docs/en/quickstart).

## Si tu veux travailler depuis le navigateur Claude

1. Utilise un **dépôt GitHub privé**. Si BellumAI a déjà un dépôt, crée une branche de travail et ajoute les références à ce dépôt. Sinon, crée un dépôt à partir du **monorepo extrait**, avec GitHub Desktop ou GitHub CLI. Ajoute les documents et images du présent ZIP comme fichiers ordinaires dans `docs/white-glass-references/` ; ajoute la prévisualisation sous `design/white-glass-preview/` si Claude doit l'inspecter.
2. Ne pousse pas le ZIP complet de 158 Mo, ni les archives v13/v17 imbriquées, ni les anciennes versions redondantes dans l'historique Git. GitHub limite l'upload par navigateur à **25 Mio par fichier**, avertit au-delà de 50 Mio et bloque un fichier Git ordinaire de plus de 100 Mio. Les fichiers extraits sont bien plus adaptés à la recherche et aux diffs. Vérifie les fichiers suivis avant publication : `.env`, clés, jetons, données clients sensibles et exports personnels n'ont pas leur place dans le dépôt.
3. Une fois le dépôt/branche poussé, ouvre [claude.ai/code](https://claude.ai/code), connecte GitHub par le flux officiel et autorise l'application Claude GitHub **sur ce dépôt privé**. Sélectionne le dépôt et la branche, puis commence en mode *Plan* avec le message du point 4 ci-dessus. Aucune clé GitHub n'a besoin d'être collée dans un prompt.

Exemple CLI **uniquement pour un nouveau dépôt**, après avoir placé les fichiers extraits dans son dossier et vérifié leur contenu :

```bash
cd "/chemin/vers/belllum-monorepo-main"
git init -b main
git add .
git commit -m "Import BellumAI et références White Glass"
gh repo create bellumai-design --private --source=. --remote=origin --push
```

Si le dépôt existe déjà, **ne réinitialise pas Git** : travaille sur une branche, ajoute le dossier de références, commit puis push. Dans GitHub Desktop, ouvre le dossier local, contrôle la liste des fichiers puis publie en privé. Le nom exact du dépôt et les droits de l'organisation sont à choisir depuis ton compte.

Sources officielles : [ajouter du code local à GitHub](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github), [limites de taille GitHub](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github), [démarrer Claude Code dans le cloud](https://code.claude.com/docs/en/web-quickstart), [accès GitHub de Claude Code](https://code.claude.com/docs/en/claude-code-on-the-web).
