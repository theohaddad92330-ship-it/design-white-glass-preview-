# Lot 21 — Laura · fiabilité et cohérence (#4287, #4288, #4667)

Périmètre : apps/api/src/modules/analysis/analysis.service.ts, apps/api/src/modules/analysis/analysis.service.spec.ts, docs/briefs/\*

## Livré

- #4667 : une analyse lancée depuis Laura n'apparaît pas dans « Mes analyses ». « Mes analyses » (`listHistory`) lit
  `analysis_runs.workspace_id` ; `start()` posait `account.workspace_id ?? null`, donc un compte sans espace (fiche venue
  d'un import, relancée par Laura) donnait un run invisible. Repli sur l'espace actif de l'utilisateur, test d'abord.
  Un seul appelant de `recordStart` : pas de jumeau.

## Hors lot (dit, pas fait)

- Les points « livré » de #4287/#4288 attendent une recette en production (modèle vivant) : rien à coder, aucune
  issue fermée par ce lot. #4287.11/.14 (relance des N derniers contacts, FAIL RA 19/10) et #4288.4 (CRM vide) :
  diagnostic non fait, leur preuve exige le modèle vivant — à rejouer.
- Non vérifié : si le compte SGCIB avait bien un `workspace_id` nul (hypothèse non prouvable sans la base de prod).
  Autre piste restante : périmètre d'unité (`a.business_unit_id`) de l'historique.

## Décisions touchées

- garde #4537 et #4544 (ligne `workspaceId` de `recordStart`, `analysis.service.ts`) : on garde le comportement,
  `account.workspace_id` gagne toujours ; l'espace actif ne sert que de repli quand il est nul.

## Droits

Aucune page, route, garde ni rôle nouveaux. Qui voit : « Mes analyses » reste cloisonné par espace
(`r.workspace_id = $1`) et par unité ; le repli pose le run sur l'espace ACTIF de celui qui lance, jamais un autre.
Qui est refusé : inchangé (`analysis:run`, vérifié avant `start`). Test ajouté :
`analysis.service.spec.ts` « #4667 — un compte sans espace pose le run sur l'espace actif de l'utilisateur ».
