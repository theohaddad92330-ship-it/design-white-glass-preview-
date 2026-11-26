# Tests rapides — en local et en CI

## En local : `pnpm test:changed`

`pnpm test:changed` (racine) ne lance que les tests des fichiers modifiés depuis `origin/main` (commits de la branche,
modifications en cours, fichiers neufs) : `vitest related` pour `apps/web` et `packages/contracts`, jest
`--changedSince` pour `apps/api`, pytest sur les tests des modules IA touchés — toute la suite IA si un prompt, un golden
ou la config de test change. Un `package.json` ou une config vite/vitest modifiés sont nommés mais pas passés à vitest
(qui relancerait toute la suite) : les suites complètes appartiennent à la CI. Options : `--base <ref>`, `--dry-run`.

## En CI : les tests concernés sur une PR, la suite complète après fusion

Sur une `pull_request`, `Test (Web)` et `Test (API)` appellent `node tools/ci/test-changed.mjs ci --suite web|api` : le
diff est calculé contre `merge-base HEAD origin/<base>` (comme le job `changes`), vitest (`list --changed`) ou jest
(`--listTests --changedSince`) donnent les tests liés, et s'y ajoutent **toujours** les specs de `src/architecture/`, les
`demo-coverage.spec.ts` et toute spec qui lit des fichiers du dépôt (`readFileSync|readdirSync|globSync|fs/promises|node:fs`).
Les shards se partagent cette liste (un shard sans fichier sort vert). Chaque shard écrit dans le journal
`tests concernés : N fichiers sur M (mode : concernés | complet — raison)`.

Repli sur la suite **complète** (le chemin `shard-by-duration.mjs`, inchangé) : une fondation touchée (`packages/shared`,
lockfile, `package.json` racine, `turbo.json`, configs vite/vitest/jest, `apps/web/src/test/**` hors fichiers de test et
hors `tests-node.generated.ts`, `apps/api/test/**` hors specs, `tsconfig*.json`), un calcul du plan en échec, le label
`ci:suite-complete` sur la PR, ou plus de 50 % des tests sélectionnés. La raison est dans le journal.

**Lot A (31/10/2026).** `packages/contracts/src/**`, `.github/**` et `tools/ci/**` ne sont plus des fondations : web et API
lisent `@bellum/*` depuis `src/` (alias `vitest.config.ts` / `moduleNameMapper` jest), le graphe d'imports suit donc les
contrats sans `build`. Les gardes de CI (`ci-*.test.ts`, `jobs-sans-succes`, `test-changed`) sont sélectionnées quand
`.github/` ou `tools/ci/` bougent. Une spec qui lit le dépôt ne tourne plus toujours : `tools/ci/read-footprint.mjs` extrait
les chemins qu'elle lit (`join`/`resolve`/`readFileSync`/glob…) et elle ne tourne que si le diff les touche ; un chemin non
calculable, un helper qui lit lui-même le disque ou une racine dynamique = elle tourne toujours.
**Interrupteur** : variable de dépôt `CI_SELECTOR_LEGACY=true` → ancien comportement (fondations larges, gardes de lecture
toujours lancées). **Limite connue** : un diff de schéma `packages/contracts` reste en suite web complète (le barrel
`@bellum/contracts` est importé par ~80 % des specs, > 50 %) ; piste : sélection par symbole exporté.

La suite complète tourne **après fusion** : `push` sur `main`, chaque nuit à 01 h 30 UTC, et `workflow_dispatch`. Hors PR,
seuls `changes`, `Test (Web)` et `Test (API)` tournent, tous en mode complet ; `CI Status` ne tourne pas. Si la suite est
rouge sur `main`, le job `Suite complète rouge sur main` ouvre l'issue du même nom (label `ci-main-rouge`) ou la commente :
SHA, lien du run, commits depuis le dernier run vert. Garde : `apps/web/src/test/ci-tests-concernes.test.ts`. (Branche `claude/ci-tests-concernes` : le workflow et sa garde sont dans `docs/briefs/ci-tests-concernes-workflow.patch`, à appliquer par `git apply` — le jeton du poste n'a pas la portée `workflow`.)
Reproduire en local le plan d'une PR : `node tools/ci/test-changed.mjs ci --suite web --base origin/main`.

## Les shards web sont répartis par DURÉE

`Test (Web)` découpe la suite web (vitest, ~2 000 fichiers) en six paquets de durée égale : chaque job demande sa liste à
`tools/ci/shard-by-duration.mjs --shard <i>/6`, qui lit `apps/web/test-durations.json`. La liste des fichiers vient du
disque, jamais du fichier de durées : un fichier neuf est réparti par nombre, un fichier supprimé est ignoré. Le test
`apps/web/src/test/ci-shards.test.ts` vérifie que l'union des paquets est exactement la suite.

Remesurer les durées (quand un shard redevient nettement plus long que les autres) — suite complète, machine libre :

```bash
cd apps/web
npx vitest run --root . --reporter=json --outputFile=/tmp/vitest-durees.json
node ../../tools/ci/shard-by-duration.mjs --update /tmp/vitest-durees.json
```
