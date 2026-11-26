# Rattrapage outillage 01/11 — #4869 #4873 #4895 #4714 #4875 #4616

Périmètre : .github/workflows/ci.yml, .github/dependabot.yml, tools/ci, apps/web/src/test, packages/figma-sync, packages/contracts/src/schemas, apps/api/src/modules/crm-sync, apps/api/src/modules/database, docs/briefs/rattrapage-outillage-01-11.md, docs/briefs/rattrapage-outillage-01-11-rapport.md, changes/rattrapage-outillage-01-11.yml

## Droits

Écrire dans le périmètre ci-dessus ; pousser SEULEMENT `claude/rattrapage-outillage-01-11` ; aucune PR (le fil l'ouvre).

## Ce qu'on fait

Dix points de la réconciliation du registre du 01/11, chacun avec sa décision déjà écrite (Louis 30-31/10) : voir le rapport pour le détail par point.

## Je ne fais pas

- Laura V8 (#5032-#5048), #4962-#5029, #4945, ManagerDashboardPage.
- Aucune décision neuve : un point sans décision écrite est « non fait » au rapport.
- Aucune suite complète, aucun `check-types` racine.

## Je défais

- Rien. `test-ia` quitte la liste « sauté hors pull_request » de `ci-tests-concernes.test.ts` parce que Louis (31/10) l'a décidé de nuit : le test dit toujours NON pour les autres jobs.
