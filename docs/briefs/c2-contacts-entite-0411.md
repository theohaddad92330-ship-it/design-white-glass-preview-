# Lot C2 — Onglet Contacts du compte : filtrer et écarter une entité (#4928.5)

Contrat validé par Louis le 04/11/2026 (QCM).

## Je fais (point)

- **#4928.5** — sur `/accounts/:id` › onglet Contacts : un FILTRE par entité (filiale / établissement rattaché) et un geste « Écarter les contacts de cette entité ». Écarter = ARCHIVER avec la raison (doctrine « on archive, on ne supprime pas »), ANNULABLE (geste inverse visible), et une correction humaine gagne toujours. Côté API : endpoint existant du module contacts si un archivage par lot existe déjà — sinon un endpoint dédié, filtré par espace ET par droit de modifier le compte. Test API qui prouve le REFUS pour un utilisateur sans droit de modification. Semé en démo (compte groupe à plusieurs entités).
  Contexte : `agent_docs/pipeline.md` ~l.155 décrit le geste ; issue #4928 (Boulanger / Boulangerie Ange).

## Je ne fais PAS

Le rejeu du segment contacts de Boulanger (#4928.4) ; aucune suppression ; aucun envoi.

## Droits

Voit : tout membre qui voit le compte. Écarte / annule : qui peut MODIFIER le compte. REFUSÉ : membre en lecture seule, autre espace (404). Un test prouve chaque refus.

## Je défais

Rien. Garde #4928.1-.3.

Périmètre : apps/web/src/features/accounts/, apps/web/src/features/contacts/, apps/api/src/modules/contacts/, apps/api/src/modules/accounts/, apps/api/src/modules/demo/, packages/contracts/src/, apps/web/src/i18n/locales/, apps/web/src/features/changelog/, supabase/migrations/

## Règles communes (toutes les routines de cette vague, 04/11/2026)

- **Plafond : 300 tours.** À 240 : commit de ce qui est vert, push, rapport, STOP.
- **Base** : ta branche `claude/c2-contacts-entite-0411` est créée depuis `origin/main` (`e29b6a7e0f`) et contient déjà ce brief. Travaille dessus, jamais sur main.
- **Avant la première ligne** : `git grep` sur `origin/main` ET sur les branches `origin/claude/*` récentes pour chaque point. S'il est déjà là, ne recode rien : écris `déjà là — fichier:ligne (appelant fichier:ligne)` dans le rapport. Lis `CLAUDE.md` (Doctrine) et `agent_docs/chantiers-livres.md` pour le sujet touché.
- **TDD** : test qui échoue d'abord, puis le code. Un test qui sait dire NON.
- **Tests CIBLÉS seulement** (≤ 5 fichiers de spec) + `tsc` du paquet touché. Si du TS est touché : UNE fois `pnpm exec turbo run build --filter=<paquet>^...`, puis `pnpm --filter <paquet> run check-types 2>&1 | grep 'error TS'` doit rendre zéro ligne avant chaque push. Pour l'IA : `cd apps/ia && python -m pytest <fichiers> -q`. **Jamais** la suite complète, jamais `check-types` racine, jamais de build complet : c'est le travail de la CI.
- **Compagnons d'un changement visible par l'utilisateur** : FR et EN (parité des clés i18n), entrée de changelog (`apps/web/src/features/changelog/`), semis de démo (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`, craft rule n°9), et l'APPELANT branché (une fonction que personne n'appelle ne compte pas).
- **Trace** : `// #<issue>.<n> — <raison>` à l'endroit du comportement.
- **Commits** : Conventional Commits, scope ∈ web|api|ia|contracts|demo (jamais `ci`), numéros dans le sujet, pied `Doc-inchangée: <fiche> — <raison>` si aucune doc n'est touchée (≤ 100 caractères). Prettier sur les fichiers touchés (`npx -y prettier@$(node -p "require('./package.json').devDependencies.prettier") --write <fichiers>`).
- **Push tôt, push simple** : `git push -u origin HEAD:refs/heads/claude/c2-contacts-entite-0411`, après chaque point vert. Ni `--force`, ni `--no-verify`. Ne jamais piper `git push` vers `tail`/`head` : lis son code de sortie. Si la branche distante a bougé sans toi : STOP et rapport.
- **Interdits** : aucun fichier `.github/workflows/*`, aucune PR (le fil intègre), aucune donnée inventée, aucun fournisseur nommé à l'écran, aucun secret dans un fichier ni dans un journal.
- **Rapport final (≤ 15 lignes)** : branche + SHA poussé (vérifié par `git ls-remote origin claude/c2-contacts-entite-0411`), une ligne par point (`livré` / `déjà là` / `bloqué` + `fichier:ligne` du code ET de son appelant + test), les fichiers hors périmètre que tu as dû toucher, et ce qui reste.
