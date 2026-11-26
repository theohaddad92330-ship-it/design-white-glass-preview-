# Lot C1 — Fiche compte : mentions légales du site et annuaire French Tech deviennent des faits (#4743, #4734)

Contrat validé par Louis le 04/11/2026 (QCM).

## Je fais (points)

- **#4743.2** — la page de mentions légales du site du compte est LUE mais presque pas exploitée : seul l'agence est extraite (`collect_legal_notice_partners`, `apps/ia/app/services/provider_footprint_mentions.py` ~l.130 ; lecture `apps/ia/app/services/firecrawl.py` ~l.232). Écrire l'extracteur : raison sociale, immatriculation (SIREN/RCS), groupe, hébergeur, agence, directeur de publication — chacun seulement s'il est écrit sur la page. Brancher l'APPELANT dans l'analyse du compte, stocker comme fait (champ de `raw_analysis` ou table existante — suivre ce que font les autres faits du site), et l'afficher sur la fiche compte (onglet Sites ou bloc légal existant).
- **#4743.5** — rien d'inventé : un champ absent ne fait AUCUNE ligne. Test négatif (page sans hébergeur ⇒ aucune ligne hébergeur).
- **#4743.6** — semé en démo (`demo-dataset.ts`, classé dans `demo-coverage.ts`, clé de `raw_analysis` si c'en est une).
- **#4734.1** — `apps/ia/app/services/data_sources/french_tech.py` (`french_tech_signals` ~l.188) est déclaré au registre (`source_registry.py`) mais n'a AUCUN appelant. Le brancher là où les autres sources de signaux du compte sont appelées.
- **#4734.2** — le fait porté est ce que l'annuaire DIT, daté ; jamais sur le seul nom (le parseur refuse déjà une ligne sans SIREN, `french_tech.py:74` — le garder, le tester bout en bout).
- **#4734.3** — semé en démo (même règle).

## Je ne fais PAS

Aucune source nommée à l'écran (« nos fournisseurs ne se nomment jamais »), aucun rejeu de comptes déjà analysés (Louis 31/10 : l'actualisation est le geste de l'utilisateur), aucune nouvelle clé payante.

## Droits

Inchangés (un fait de compte suit le cloisonnement du compte).

## Je défais

Rien. Garde #4743.1/.3/.4, et la contrainte SQL élargie AVANT le code si un nouveau `kind`/`type` voyage vers la base (GA-11/GA-12).

Périmètre : apps/ia/app/services/, apps/ia/app/routers/, apps/ia/tests/, apps/api/src/modules/accounts/, apps/api/src/modules/demo/, apps/web/src/features/accounts/, apps/web/src/i18n/locales/, apps/web/src/features/changelog/, packages/contracts/src/, supabase/migrations/

## Règles communes (toutes les routines de cette vague, 04/11/2026)

- **Plafond : 300 tours.** À 240 : commit de ce qui est vert, push, rapport, STOP.
- **Base** : ta branche `claude/c1-fiche-sources-0411` est créée depuis `origin/main` (`e29b6a7e0f`) et contient déjà ce brief. Travaille dessus, jamais sur main.
- **Avant la première ligne** : `git grep` sur `origin/main` ET sur les branches `origin/claude/*` récentes pour chaque point. S'il est déjà là, ne recode rien : écris `déjà là — fichier:ligne (appelant fichier:ligne)` dans le rapport. Lis `CLAUDE.md` (Doctrine) et `agent_docs/chantiers-livres.md` pour le sujet touché.
- **TDD** : test qui échoue d'abord, puis le code. Un test qui sait dire NON.
- **Tests CIBLÉS seulement** (≤ 5 fichiers de spec) + `tsc` du paquet touché. Si du TS est touché : UNE fois `pnpm exec turbo run build --filter=<paquet>^...`, puis `pnpm --filter <paquet> run check-types 2>&1 | grep 'error TS'` doit rendre zéro ligne avant chaque push. Pour l'IA : `cd apps/ia && python -m pytest <fichiers> -q`. **Jamais** la suite complète, jamais `check-types` racine, jamais de build complet : c'est le travail de la CI.
- **Compagnons d'un changement visible par l'utilisateur** : FR et EN (parité des clés i18n), entrée de changelog (`apps/web/src/features/changelog/`), semis de démo (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`, craft rule n°9), et l'APPELANT branché (une fonction que personne n'appelle ne compte pas).
- **Trace** : `// #<issue>.<n> — <raison>` à l'endroit du comportement.
- **Commits** : Conventional Commits, scope ∈ web|api|ia|contracts|demo (jamais `ci`), numéros dans le sujet, pied `Doc-inchangée: <fiche> — <raison>` si aucune doc n'est touchée (≤ 100 caractères). Prettier sur les fichiers touchés (`npx -y prettier@$(node -p "require('./package.json').devDependencies.prettier") --write <fichiers>`).
- **Push tôt, push simple** : `git push -u origin HEAD:refs/heads/claude/c1-fiche-sources-0411`, après chaque point vert. Ni `--force`, ni `--no-verify`. Ne jamais piper `git push` vers `tail`/`head` : lis son code de sortie. Si la branche distante a bougé sans toi : STOP et rapport.
- **Interdits** : aucun fichier `.github/workflows/*`, aucune PR (le fil intègre), aucune donnée inventée, aucun fournisseur nommé à l'écran, aucun secret dans un fichier ni dans un journal.
- **Rapport final (≤ 15 lignes)** : branche + SHA poussé (vérifié par `git ls-remote origin claude/c1-fiche-sources-0411`), une ligne par point (`livré` / `déjà là` / `bloqué` + `fichier:ligne` du code ET de son appelant + test), les fichiers hors périmètre que tu as dû toucher, et ce qui reste.
