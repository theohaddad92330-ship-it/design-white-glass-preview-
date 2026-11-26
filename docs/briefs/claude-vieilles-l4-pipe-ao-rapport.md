# Rapport — claude/vieilles-l4-pipe-ao (L4 Pipe, signaux, AO) — 31/10/2026 · base origin/main 611fa351

## Par point

- **2170.43** livré `ee1ee6c4`. Réglage par étape DÉJÀ persisté (`deal_stage_sla`, migration 1791560000001,
  Règles → Pipe) mais non lu par l'alerte (7/14/30 figés). Pas de 2e table (GA-26) ⇒ pas de migration :
  attention = durée réglée, orange ×2, alerte ×4, étape non réglée 7/14/30 ; filtre, tableau, fiche branchés.
  Owner/admin seuls (PUT `/pipeline/stage-sla` + `update_setting` Laura), refus testé member/sales/sales_ops/viewer.
- **2170.53** livré `ee1ee6c4` : la question Laura nomme le compte et l'immobilité au-delà du seuil.
- **2170.5** serveur déjà là (`projects.service.ts:246`, `project.ts:433`), carte retirée par #4343
  (`PipelineBoard.test.tsx:287`) ; livré `ee1ee6c4` : « N profils sont en entretien » (pluriel) pour Laura.
- **2152.27** livré `7c966eea` : « Rédiger » ouvre la validation des sources ; `draft` ne reçoit que les cochées.
- **2152.25** livré `7c966eea` : `RfpProfilesCard` = positionnement `shortlisted` sur le besoin de l'AO.
- **2152.13** déjà là : file « détecté, à revoir » `pipeline-detection.ts:6`, confirmation humaine seule
  `pipeline-detections.controller.ts:55`. Non fait : « besoin `detected` à la confirmation » contredit #2323.1
  (`project-pipeline.service.ts:810` : `detected` = aucun humain n'a confirmé). Q3.
- **2152.26** non fait : rien n'existe et le contrat ne dit pas ce qu'est le « modèle utilisateur ». Q4.

## Compagnons

FR+EN partout · CHANGELOG : fragment `changes/vieilles-l4-pipe-ao.yml` (validé par `fusion_fragments.py`, non
appliqué) · démo : `deal_stage_sla` déjà « vide à dessein » ; l'AO semé sans besoin montre la carte profils après
« Transformer en besoin » ; aucune table neuve, rien à classer dans `demo-coverage.ts`.

## Tests (rouge → vert)

web : stale-threshold-per-stage, PipelineSlaView, pipe-card-laura-context, ProjectsPage.quickFilters (+6 specs
ProjectsPage : simulacre du nouveau hook), RfpWorkspace, RfpProfilesCard · api : deal-stage-sla.controller.rbac,
action-router.service · `tsc` web vert ; api : seules erreurs `@bellum/email` non construit (environnement).

## Questions

1. Débordement : `deal-stage-sla.controller.ts`, `action-router.service.ts`, `ProjectsTable.tsx`,
   `ProjectPropertiesContent.tsx`, `features/settings/*` (l'écran qui porte les seuils). OK ?
2. `sales_ops` perd le réglage des durées cibles (avant `team:manage`) : conforme à l'arbitrage ?
3. 2152.13 : à la confirmation d'une piste, créer aussi un besoin `to_qualify` (#2323.1) ou `detected` ?
4. 2152.26 : le « modèle utilisateur » d'un AO = gabarit .docx, bibliothèque de réponses, ou plan de sections ?

SHA de tête : le commit de ce rapport. Branche poussée, aucune PR.
