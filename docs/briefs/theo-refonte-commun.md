# Refonte visuelle Théo — cadre commun à tous les lots écrans (23/10/2026)

Écrivain cloud, dépôt Bellum-AI/belllum-monorepo. Constat du 23/10 : sur 6 écrans comparés en prod, aucun n'est conforme aux maquettes. PR8 n'avait appliqué que des écarts. Ta mission : refaire chaque écran de ton lot EXACTEMENT comme sa maquette (structure, visuel, parcours), au pixel, avec les données RÉELLES de l'espace.

## Base

`git fetch origin && git checkout -b claude/theo-refonte-<lot> origin/main && (git merge --no-edit origin/claude/r23-integ-pr11-theo || true)`.
PR11 réunit les 14 lots d'écarts oubliés par PR8 et son intégration est en cours. Si sa branche n'existe pas encore, refais `git fetch origin && git merge --no-edit origin/claude/r23-integ-pr11-theo` à mi-parcours, puis en fin de lot. Pars de ce qu'elle apporte à ton écran (`git log origin/main..origin/claude/r22-ecran-<k>`) et ne le refais pas. Tu es le seul à pousser cette branche. Pas de PR.

## Spec, par ordre de priorité

1. **La maquette appliquée.** Trouve sa branche : `for b in $(git branch -r | grep 'theo-.*appliquees'); do git ls-tree -r --name-only $b | grep -q '/<page>.html' && echo $b; done`. Puis lis-la : `git show <b>:docs/maquettes/theo-v22/_appliquees/<a|b|c|d|o>/<page>.html`. C'est un HTML autonome : lis son DOM ET son CSS, chaque état cliquable, chaque modale et panneau, jusqu'en bas de la page.
2. **Les écarts** : `git ls-tree -r --name-only origin/claude/theo-v22-ecarts-<a|b|c|d> | grep _ecarts`, puis `git show` du fichier.
3. **L'inventaire des fonctions existantes** (`docs/maquettes/_inventaire/`, `_controle*.md`, sur main ou sur les branches theo-\*) : c'est ta liste de contrôle.

## Ce que tu ne touches pas

- **La coque.** Le lot COQUE (barre latérale, en-tête global, fil d'Ariane, ⌘K, jetons) tourne en parallèle sur `claude/theo-refonte-coque`. Ne touche ni la barre latérale, ni l'en-tête global, ni `packages/ui/src`. Déclare le titre et le fil d'Ariane de ta page par le mécanisme existant. Si `origin/claude/theo-refonte-coque` existe, lis `docs/maquettes/theo-v22/COQUE.md` sur cette branche et suis son contrat.
- **Les écrans des autres lots.** Ne touche que les fichiers de TES écrans, avec leurs i18n, leurs tests et leur semis démo.

## Décisions de Louis (non négociables)

- La maquette s'applique EXACTEMENT.
- AUCUNE fonction existante n'est supprimée. Une fonction absente de la maquette reste, à l'endroit le plus proche, et tu la listes dans ton rapport : Louis tranche.
- Aucune route neuve.
- Chaque élément cliquable ouvre son état : aucun bouton mort.
- Chaque sous-onglet est un vrai onglet qui n'affiche que son contenu, jamais des blocs empilés.
- Couleur : badges de rôle, pastilles, chips, statuts et initiales sont teintés (jetons doux, contraste AA, deux thèmes). Neutres + un accent ; la couleur dit un état.
- Aucun score en points (« 25/100 ») : on montre des faits. La correspondance consultant ↔ besoin s'écrit en clair (« Correspond : … · Manque : … »).
- Filtres :
  - multi-sélection partout ;
  - tous les filtres présents, les pertinents d'abord, le reste sous « Plus de filtres » ;
  - un critère n'apparaît qu'une fois (Effectif et Taille sont un seul filtre).
- Laura GÉNÈRE : toute fenêtre de préparation (mail, réponse, trame d'appel, relance, pitch) s'ouvre déjà rédigée, éditable, avec « Régénérer ». Jamais un champ vide. Contrôle : `git grep -E 'calculé en salle|à semer'` = 0.
- Toutes les listes utilisent le même composant tableau.
- Une donnée vit à un seul endroit ; ailleurs, au plus un lien.
- État vide : une absence ne fait aucune ligne, jamais « 0 ». Sous un score, les axes non évaluables sont nommés.
- Aucune probabilité de closing ; crédits jamais affichés ; nos fournisseurs jamais nommés ; Bellum et Laura TUTOIENT ; coordonnées pro en clair.
- Fiche compte : « Vue d'ensemble » est fusionnée dans « Ce que je sais ». « Par qui commencer » montre 10 personnes. L'organigramme est un vrai sous-onglet plein écran, en arbre graphique.
- Liste des comptes : la décision de l'équipe (À trancher · Priorisé · Écarté · En observation) et le verdict d'analyse s'écrivent EN MOTS, sans aucun nombre.
- Aujourd'hui : une file unique triée par urgence. Tableau de bord et Cockpit sont fusionnés, avec un sélecteur moi / équipe.
- Mobile (≤ 768 px) et bureau, clair et sombre, à égalité.
- Règles GA du dépôt : plancher 12 px, tailles en rem, aucune couleur hex dans le JSX, cibles ≥ 44 px, icônes nommées, mouvement de `packages/ui/src/motion.ts`.
- Les données des maquettes (Maëlle Lorquin, Société Générale…) sont de la démo. En prod, l'écran montre les vraies données. Sème la démo (`apps/api/src/modules/demo` + `demo-coverage.ts`) pour que l'écran démo ressemble à la maquette.
- Regard de directeur artistique avant chaque commit : hiérarchie, alignements, densité (listes denses, fiches aérées), cohérence entre les écrans.

## Discipline

- Plafond 300 tours. À 80 % : commit de ce qui est vert, push, rapport, STOP.
- AUCUN sous-agent, aucune commande en arrière-plan, `timeout 540` sur chaque commande.
- Rien sous `.claude/`. Jamais main, jamais `--force` ni `--no-verify`. Pas de `.github/workflows`.
- Tests :
  - aligne les tests de l'écran sur le comportement VOULU, jamais en affaiblissant une garde ;
  - un test par état cliquable nouveau ;
  - `cd apps/web && npx tsc --noEmit -p .` doit donner 0 `error TS` ;
  - `npx vitest run src/architecture`, plus les specs de tes écrans (10 au plus).
- Changelog fr/en dans `packages/contracts/src/changelog`.
- Commit et PUSH après CHAQUE écran : `feat(web): refonte Théo — <écran>`.

## Rapport (12 lignes au plus)

- Par écran : fait, ou partiel avec ce qui reste.
- Les fonctions gardées hors maquette (la liste pour Louis).
- Le SHA poussé (`git ls-remote`).
- Puis STOP.

## Écrans SANS maquette propre (groupe PR12)

Louis, 23/10 : « une refonte globale de TOUT, de l'onboarding aux préférences ». Aucun écran ne reste dans l'ancien design.

- Base : la même que plus haut, PUIS `git merge --no-edit origin/claude/theo-refonte-coque || true`, refait à mi-parcours et en fin (la coque pose les jetons et primitives Théo).
- Pour chaque route de ton lot : prends comme référence la maquette la PLUS PROCHE (nommée dans ton lot) et applique-lui sa grammaire : en-tête de page, cartes, tableau commun, onglets, chips teintés, états vides, modales, densité, typographie, espacements, parité clair/sombre et mobile.
- Tu changes la FORME, pas le fond : chaque champ, bouton, réglage et parcours existant reste, au même rôle. Aucune fonction supprimée, aucune route neuve, aucun réglage déplacé d'écran.
- Toutes les décisions de Louis ci-dessus s'appliquent.
- Doute sur une fonction (la garder, la fusionner, la déplacer) : tu la GARDES telle quelle et tu la notes dans le rapport sous « À trancher par Louis ». Tu ne supprimes jamais sur un doute.
