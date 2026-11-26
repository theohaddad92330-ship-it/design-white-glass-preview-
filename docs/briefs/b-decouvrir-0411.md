# Lot B — Découvrir : la coupe se dit, les 503 cessent, Castaing en démo (#4706, #4617, #4819)

Contrat validé par Louis le 04/11/2026 (QCM).

## Je fais (points)

- **#4706.1** — quand une liste Découvrir est coupée à la limite après tri, l'écran DIT « N affichés sur au moins M trouvés » (même règle que #5009.1, décision Louis 03/11 : « sur au moins M » dès qu'une source a un total). Constat d'origine : « Siège dans la zone » rendait 24 comptes contre 17 pour « Implanté dans la zone » alors que siège ⊆ implanté (`apps/ia/tests/test_4706_siege_inclus_dans_implante.py`). Chercher d'abord l'affichage de #5009.1 et le RÉUTILISER pour ce cas (un réglage vit à un seul endroit, GA-26). **On ne relève PAS la limite.**
- **#4617.6** — fin des 503 sur `POST /ia/discover/registry`. La traduction d'erreur est déjà propre (`apps/api/src/modules/ia-proxy/discover-failure.ts`, 422/503 nommés). La CAUSE du délai dépassé (budget `apps/ia/app/routers/discover.py` ~l.213, 32 s) n'est pas prouvée résolue. 1) Trouver dans le code quelle étape du registre dépasse le budget (journal de durées par étape s'il manque, sans donnée personnelle) ; 2) corriger à la racine (parallélisme, coupe à la source, budget par étape qui rend un partiel NOMMÉ plutôt qu'un 503) ; 3) test qui simule l'étape lente et prouve une réponse partielle nommée, jamais 503. Écris dans le rapport ce que tu as mesuré.
- **#4819.4** — Castaing Transports est sur main (`apps/api/src/modules/demo/demo-scripts.ts`) mais ABSENT de la salle de démo servie après 4 recherches. Trouver pourquoi le semis ne l'atteint pas (salle déjà semée ? clé de semis ? filtre de Découvrir qui l'écarte ?) et corriger ; test qui prouve qu'une recherche démo du cas visé le rend.

## Je ne fais PAS

Pas de limite relevée, pas de nouvelle source, pas de fournisseur nommé à l'écran.

## Droits

Sans objet.

## Je défais

Rien. Garde #5009.1, #4706.2, #4617.1-.3.

## Je mesure

Le rapport dit la part de 503 que ton correctif supprime (sur le cas simulé) et l'étape en cause.

Périmètre : apps/ia/app/routers/discover*.py, apps/ia/app/services/, apps/ia/tests/, apps/api/src/modules/ia-proxy/, apps/api/src/modules/demo/, apps/web/src/features/discover/, apps/web/src/i18n/locales/, apps/web/src/features/changelog/

## Règles communes (toutes les routines de cette vague, 04/11/2026)

- **Plafond : 300 tours.** À 240 : commit de ce qui est vert, push, rapport, STOP.
- **Base** : ta branche `claude/b-decouvrir-0411` est créée depuis `origin/main` (`e29b6a7e0f`) et contient déjà ce brief. Travaille dessus, jamais sur main.
- **Avant la première ligne** : `git grep` sur `origin/main` ET sur les branches `origin/claude/*` récentes pour chaque point. S'il est déjà là, ne recode rien : écris `déjà là — fichier:ligne (appelant fichier:ligne)` dans le rapport. Lis `CLAUDE.md` (Doctrine) et `agent_docs/chantiers-livres.md` pour le sujet touché.
- **TDD** : test qui échoue d'abord, puis le code. Un test qui sait dire NON.
- **Tests CIBLÉS seulement** (≤ 5 fichiers de spec) + `tsc` du paquet touché. Si du TS est touché : UNE fois `pnpm exec turbo run build --filter=<paquet>^...`, puis `pnpm --filter <paquet> run check-types 2>&1 | grep 'error TS'` doit rendre zéro ligne avant chaque push. Pour l'IA : `cd apps/ia && python -m pytest <fichiers> -q`. **Jamais** la suite complète, jamais `check-types` racine, jamais de build complet : c'est le travail de la CI.
- **Compagnons d'un changement visible par l'utilisateur** : FR et EN (parité des clés i18n), entrée de changelog (`apps/web/src/features/changelog/`), semis de démo (`apps/api/src/modules/demo/demo-dataset.ts` + `demo-coverage.ts`, craft rule n°9), et l'APPELANT branché (une fonction que personne n'appelle ne compte pas).
- **Trace** : `// #<issue>.<n> — <raison>` à l'endroit du comportement.
- **Commits** : Conventional Commits, scope ∈ web|api|ia|contracts|demo (jamais `ci`), numéros dans le sujet, pied `Doc-inchangée: <fiche> — <raison>` si aucune doc n'est touchée (≤ 100 caractères). Prettier sur les fichiers touchés (`npx -y prettier@$(node -p "require('./package.json').devDependencies.prettier") --write <fichiers>`).
- **Push tôt, push simple** : `git push -u origin HEAD:refs/heads/claude/b-decouvrir-0411`, après chaque point vert. Ni `--force`, ni `--no-verify`. Ne jamais piper `git push` vers `tail`/`head` : lis son code de sortie. Si la branche distante a bougé sans toi : STOP et rapport.
- **Interdits** : aucun fichier `.github/workflows/*`, aucune PR (le fil intègre), aucune donnée inventée, aucun fournisseur nommé à l'écran, aucun secret dans un fichier ni dans un journal.
- **Rapport final (≤ 15 lignes)** : branche + SHA poussé (vérifié par `git ls-remote origin claude/b-decouvrir-0411`), une ligne par point (`livré` / `déjà là` / `bloqué` + `fichier:ligne` du code ET de son appelant + test), les fichiers hors périmètre que tu as dû toucher, et ce qui reste.
