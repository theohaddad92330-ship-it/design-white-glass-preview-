# Brief — `claude/ci-tests-concernes` : sur une PR, seulement les tests concernés ; suite complète après fusion

Décision de Louis le 14/10/2026 : **PRIORITÉ ABSOLUE, devant tout le reste.** La CI perd plusieurs heures par jour.
D'après la mesure du 05/10, un run vert prend 110 min, dont 384 min de jobs en file d'attente pour 157 min d'exécution.
Aujourd'hui, une PR qui touche le web lance les 2 457 fichiers de tests web (4 shards de 18 à 35 min).

Plafond : **300 tours**. Écrivain seul : **AUCUN sous-agent**. Tests CIBLÉS seulement : au plus 5 specs, plus `tsc -p` du paquet. Les suites complètes, c'est la CI.
Interdits : ne touche ni à `.claude/`, ni aux runners, ni aux variables `CI_RUNS_ON*`. Ne change aucun **nom de job** (`Test (Web)`, `Test (API)` et `CI Status` sont des checks obligatoires). Jamais de push sur main. Jamais de `--no-verify` sur un commit.

## Décisions tranchées (ne les remets pas en question, ne remonte aucune question)

1. **Réutilise `tools/ci/test-changed.mjs` (`planChangedRuns`)** : il existe déjà, et la CI ne l'appelle jamais. Étends-le et exporte ce que la CI utilise. Ne crée pas un deuxième sélecteur.
2. **Sur `pull_request`**, les jobs `Test (Web)` et `Test (API)` ne lancent que les tests liés au diff, calculé contre `merge-base HEAD origin/${base_ref}`, comme le fait déjà le job `changes`.
   - **Web** : `vitest related <fichiers sources modifiés> --run --passWithNoTests`, avec le sharding `--shard=i/4` ou un découpage équivalent. Un shard sans fichier sort en vert en quelques secondes.
   - **API** : jest `--changedSince=<merge-base>` (ou `--findRelatedTests`), avec `--shard=i/2` et `--passWithNoTests`. L'étape `Vitest (apps/mcp)` reste telle quelle.
   - **Toujours lancés, quel que soit le diff** : toutes les specs de `apps/web/src/architecture/` et de `apps/api/src/architecture/`, `demo-coverage.spec.ts`, et toute spec web ou API qui LIT des fichiers du dépôt. On les détecte de façon déterministe, avec un grep sur `readFileSync|readdirSync|globSync|fs/promises|node:fs`. Ces gardes lisent le code sans l'importer, donc le graphe d'imports ne les voit pas.
3. **Repli sur la suite COMPLÈTE** (le chemin actuel, `shard-by-duration.mjs`, à l'identique) dans les cas suivants :
   - une fondation est touchée : la regex actuelle du job `changes`, plus `(vite|vitest|jest)*.config.*`, `apps/web/src/test/**`, `apps/api/test/**`, `tools/ci/**`, `tsconfig*.json` et `.github/**` ;
   - le calcul du plan échoue, ou le diff est illisible ;
   - la PR porte le label `ci:suite-complete` ;
   - plus de 50 % des fichiers de tests sont sélectionnés.
     Dans chaque cas, la raison s'écrit dans le journal du job.
4. **Suite complète après fusion** : ajoute à `ci.yml` les déclencheurs `push: branches: [main]`, `schedule` (cron `30 1 * * *`) et `workflow_dispatch`. Hors `pull_request` :
   - **seuls** `changes`, `Test (Web)` et `Test (API)` tournent, en mode COMPLET. Tous les autres jobs sont déjà complets sur la PR et ne doivent pas reprendre de runners ;
   - la condition `github.event.pull_request.draft == false` devient `github.event_name != 'pull_request' || github.event.pull_request.draft == false` ;
   - le job `changes` met tout à `true` ;
   - `concurrency` reste en `cancel-in-progress: true` : plusieurs fusions rapprochées se regroupent alors sur la dernière, et c'est voulu ;
   - **si la suite est rouge sur main**, un job final (`if: failure()`, `permissions: issues: write`) ouvre l'issue `Suite complète rouge sur main`, ou la commente si elle est déjà ouverte (label `ci-main-rouge`). Il y met le SHA, le lien du run et la plage de commits depuis le dernier run vert du même workflow ;
   - vérifie que `CI Status` reste juste sur une PR, et qu'il ne bloque rien sur un `push`.
5. **Mesure dans le journal** : chaque shard écrit une ligne `tests concernés : N fichiers sur M (mode : concernés | complet — raison)`.

## Tests (TDD, d'abord)

- Étends `apps/web/src/test/test-changed.test.ts` pour couvrir la sélection, les gardes toujours lancées, chaque cas de repli sur la suite complète, le seuil de 50 % et le label. La garde doit savoir dire NON : un diff qui ne touche qu'un composant ne donne PAS le mode complet.
- Ajoute une garde qui lit `ci.yml` et prouve trois choses :
  - `Test (Web)` et `Test (API)` appellent le sélecteur sur `pull_request` ;
  - le mode complet existe hors PR ;
  - les jobs autres que les tests sont sautés sur `push` et `schedule`.
- Ne lance que ces specs : `pnpm --filter @bellum/web exec vitest run src/test/test-changed.test.ts <garde>`, plus un `--dry-run` du script sur 2 ou 3 diffs réels de l'historique.
- Mets à jour `docs/tests-rapides.md` avec un paragraphe « en CI ».

## Livraison

Branche `claude/ci-tests-concernes`. Elle contient déjà ce brief : pars de son dernier commit. Commits `ci: …`, puis push.
Rapport final de 15 lignes au plus : SHA, fichiers touchés, résultat des tests ciblés, et sortie du `--dry-run` sur les diffs réels (N sur M). Puis STOP. Le fil principal ouvre la PR.
