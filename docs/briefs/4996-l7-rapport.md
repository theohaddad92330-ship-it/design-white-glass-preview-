# Rapport — claude/4996-l7 (#4996 L7 : démo, Refs #4731)

**Fait (5/5)** : (1) entités SG : déjà semées par `seedAccount` (dérivées des contacts), rien d'ajouté ; (2) zones de l'équipe démo : `seedTeamGuardrails` pose au collègue fictif 2 zones d'entité SG (`account_team_scopes`, libellé recopié du nom, idempotent, borné espace + compte) ; (3) contacts par entité : déjà rattachés, la zone est dérivée de leurs libellés (`DEMO_SG_ZONE_ENTITY_LABELS`, `demo-dataset.ts`, aucune lecture brute de `contacts` — GA-405) ; (4) purge au reset : `account_team_scopes` dans `DEMO_PURGE_TABLES` ; (5) fragment `changes/4996-l7.yml` (table classée seedée + `DEMO_TEAM_SCOPES_COVERAGE`).
**Doctrine** : sans collègue = aucune zone ; le visiteur n'en reçoit jamais ; texte libre non semé (vide à dessein, dit dans le fragment).
**Fichiers** : `demo/demo-dataset.ts`, `demo-team-guardrails-seed(.spec).ts`, `demo-reset.service.ts`, `changes/4996-l7.yml`.
**Tests** : rouges pour la bonne raison (2 : zones absentes, table non purgée) puis verts ; `demo-team-guardrails-seed.spec`, `contacts-raw-sql-scope-ratchet.spec` verts. `demo-coverage.spec` + `demo-colleague-ids.spec` : 111 verts SUR UNE COPIE avec le fragment appliqué (puis fragments/fichiers chauds restaurés).
**Attention** : tant que l'intégrateur n'a pas appliqué `python3 tools/issues/fusion_fragments.py`, `demo-coverage.spec` est ROUGE (table purgée non classée). Attendu, c'est la règle des fichiers chauds.
**Non lancé** : ci:local, suite complète, build.
