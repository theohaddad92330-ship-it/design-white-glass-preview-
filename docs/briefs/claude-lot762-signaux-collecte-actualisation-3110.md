# Lot 762 — SIGNAUX 2/2 : collecte sans borne d'âge et actualisation au même niveau que l'analyse (#4762, ferme #4754)

Branche `claude/lot762-signaux-collecte-actualisation-3110`. Le lot 761 refait l'écran en parallèle : `apps/web` n'est pas touché.

Périmètre : apps/ia/app/services/**, apps/ia/tests/**, apps/api/src/modules/analysis/**, apps/api/src/modules/accounts/**, apps/api/src/modules/crm/**, apps/api/src/modules/demo/demo-dataset.ts, apps/api/src/modules/demo/demo-signals-stale-collection-coverage.spec.ts, apps/api/src/modules/market-memory/**, apps/api/src/migrations/**, apps/api/src/database/entities/crm-deal-fact.entity.ts, packages/contracts/src/schemas/crm-deal-signals.ts, packages/contracts/src/schemas/segment-catchup.ts, packages/contracts/src/schemas/segment-catchup.test.ts, apps/web/src/features/accounts/view/account-detail/components/SegmentStaleCollectionNotice.test.tsx, docs/briefs/claude-lot762-signaux-collecte-actualisation-3110.md

## Diagnostic (audit du 31/10 sur origin/main)

Décision Louis 31/10 : « pas de limite » d'âge sur l'historique. #4754 avait relevé trois sources à 1095 j ; le reste coupait encore au stockage.
L'actualisation (`POST /analysis/:id/refresh`) n'appelait que `ia.research` + `accounts.refreshResearch` : `historical_needs` restait périmé.

## Correctif

- P1/P2 collecte : plus de borne d'âge de STOCKAGE sur les sources gratuites ; l'ancien est stocké estampillé `historical`.
- P3 sources payantes (agrégateurs facturés par offre) : fenêtre de REQUÊTE inchangée (pertinence avant le coût, Louis 25/10).
- P4 un chemin partagé analyse/actualisation (`research-followups.ts`) ; garde-fou homonyme, besoins proposés, besoins historiques.
- P5 CRM : rattachement par nom normalisé UNIVOQUE seulement (CHECK élargi avant, migration horodatée) ; lecture d'historique sans filtre d'expiration.
- P6 DataForge : SIREN manquant résolu (source d'identité existante) et écrit avant la lecture ; plusieurs fiches ⇒ rien rattaché.
- P7 Market Memory : aucune table du corpus ne porte de SIREN — jointure inchangée, dit dans la PR.
- P8 rattrapage : capacité #4762 inscrite au segment `signals` (ciblé, par segment, jamais au déploiement).
- P9 coût inchangé : 1 crédit d'enrichissement, `REFRESH_MIN_INTERVAL_MS` intact.

## Antériorité

- **revient sur #2284** (décision #2284.28 « le nom seul ne résout jamais ») — UNIQUEMENT pour les deals CRM sans id société, SIREN ni domaine : le nom normalisé est retenu s'il est univoque dans l'espace, ambigu ⇒ non rattaché. Décision Louis 31/10, écrite dans le contrat (`crm-deal-signals.ts`) et la migration ; les trois clés l'emportent toujours.
- garde #4760 (besoins historiques) : le corps de `recordHistoricalNeeds` migre dans `research-followups.ts`, appelé par l'analyse ET l'actualisation ; la garde de câblage suit.
- garde #4805, garde #4865 : le spec de la migration #3918.a reste vrai pour sa propre migration (elle n'écrit pas « name ») ; « name » vient de la migration 1796597841263.
- garde #4926 : `historical-needs-wiring-4760.spec.ts` étendu, aucune assertion retirée.
- Chemins réels : `apps/api/src/migrations` (et non `database/migrations`), `modules/crm` (et non `crm*`), le rattrapage de segment vit dans `modules/analysis` + `packages/contracts` (`segment-catchup.ts`).

## Droits

Aucune surface d'accès touchée (ni page, ni route, ni garde, ni rôle).

## Démo (règle 9)

Aucun écran neuf. Le témoin « collecte fraîche » de SNCF est repoussé après la nouvelle capacité `signals` (sinon il retomberait « antérieur »).
