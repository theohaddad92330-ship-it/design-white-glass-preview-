# Brief — vieilles issues, vague 6 — écrans (#4595.3 #4691.3)

Contrat VALIDÉ par Louis le 31/10/2026.

## Ce que je fais

1. #4595.3 — Back-office (apps/dashboard-manager) : AUCUNE tuile/indicateur d'une mesure arrêtée, non branchée ou sans donnée n'affiche « 0 » ; elle dit « non mesuré » (avec la raison si elle est connue). Le Cockpit est déjà juste (0 tuile sur 7, mesuré en prod le 28/10) — balayer TOUS les autres écrans du back-office. Une vraie mesure à zéro reste « 0 » : distinguer null/undefined/absent de 0 à la SOURCE. Ajouter une garde (test) qui échoue si une tuile rend « 0 » pour une valeur absente, sur le modèle des gardes GA-18/GA-19 d'apps/web.
2. #4691.3 — /integrations (apps/web) : une capacité qu'un connecteur n'a PAS le droit d'exécuter (scope OAuth non accordé, ex. `actions:write` absent ; scopes lus en colonne, cf. apps/api/src/modules/ats/ats-credentials.service.ts:57) n'apparaît PAS comme option/action. Si l'écran a besoin des scopes accordés, les exposer par l'API existante du connecteur (champ additif, jamais le jeton). Test : sans `actions:write` l'option est absente ; avec, elle est là.

## Je ne fais PAS

Aucun nouveau scope OAuth ; aucun calcul de mesure changé ; aucune donnée collectée ; aucune page retirée.

## Démo (craft rule n°9)

/integrations en démo : l'état « capacité absente faute de droit » ne casse pas la démo ; nouvel affichage classé dans demo-coverage.ts. Le back-office n'a pas de démo.

Périmètre : apps/dashboard-manager/** · apps/web/src/** · locales FR+EN · apps/api/src/modules/{ats,zero-layer,integrations,demo}/** · packages/contracts/src/** · CHANGELOG* · changes/** · docs/briefs/**
