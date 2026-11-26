# CI-API-SHARDS — rapport (25/10/2026)

- Jobs du run : `Test (API)` passe de 3 à 6 slots, soit **+3 jobs par run** (le parc de 10 runners n'est pas modifié).
- Durée attendue par shard : ~2 564 / 6 ≈ 427 specs, soit 42-47 min × 3/6 ≈ **21-24 min** (base : 42-47 min mesurées par shard à ~855 specs, découpage `--shard` à nombre de fichiers égal). Non mesurée après changement. `timeout-minutes` du step (45) laissé tel quel.
- `redis-server` : **présence dans l'image du runner non vérifiable depuis ce poste** (absent en local). Le job Démo l'installe par apt, ce qui laisse penser qu'il n'y est pas. Le step « Redis (socket seul) » n'installe donc que s'il manque (`command -v`), puis démarre `redis-server --port 6379 --daemonize yes || true`. Coût apt si absent : non mesuré, à lire au premier run.
- `REDIS_URL: redis://localhost:6379` au niveau du job. Aucune donnée, aucun worker, aucun test modifié (commentaire dans `ci.yml`).
- Garde `apps/web/src/test/ci-api-redis.test.ts` : refuse (1) un job `Test (API)` sans `REDIS_URL` au niveau job (vérifié rouge en retirant la ligne), (2) l'absence de `redis-server --port 6379 --daemonize yes` ou un `services:`, (3) une matrice dont le nombre de shards diffère des `/N` des 3 usages.
- `ci-tests-concernes.test.ts` mis à jour vers `/6`. Aucune autre garde ne fige `/3` (grep sur `tools/ci`, `apps/api/src/architecture`).
- Vérifs : vitest 2 fichiers, 19 tests verts ; YAML valide ; tsc `apps/web` : 0 erreur.
- Non corrigé, à nommer : specs lentes `src/modules/analysis/org-enrichment-targeting.spec.ts` (54 s) et `src/modules/demo/demo-supervised-forfait-coverage.spec.ts` (23,8 s) ; je ne les ai pas touchées. `--shard` coupe par nombre de fichiers, pas par durée : un shard pourra rester plus lent (le Web utilise `shard-by-duration.mjs`).
- Hors périmètre : le commentaire du 16/10 cite encore `--shard=i/3` (historique, laissé).
