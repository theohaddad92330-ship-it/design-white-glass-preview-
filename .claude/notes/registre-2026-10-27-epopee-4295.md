# Registre — épopée #4295, vague L (27/10/2026) — câblage prouvé par l'APPELANT

Base `origin/main` 8b6d99fc. Verdicts : câblé (appelant `fichier:ligne`) · orphelin (branché ici) · absent · reformulé.

| Point | Verdict | Appelant / livraison | Geste de recette |
| --- | --- | --- | --- |
| #4295.1 | livré | `ImportWizard.tsx:1804` (import), `import-overview-for-laura.service.ts:45` (Laura) ; `analysisOperationStatus` n'avait AUCUN appelant → `AccountDetailStatusBanners.tsx` (badge Partielle/Interrompue) | Compte en erreur : badge « Interrompue » ; avec phases abouties « Partielle » ; annulation : aucun badge |
| #4295.2 | déjà là | `AccountDetailStatusBanners.tsx:57`, `SearchAnalyzingState.tsx:30` → `AnalysisProgressCard` | attente anormale non reproductible à volonté |
| #4295.3 | déjà là | idem (bandeau) | couper/rétablir le réseau en analyse |
| #4295.4 | déjà là | `UniversalImportDialog.tsx:183`, `UniversalImportLauncher` | /settings/import : « Jusqu'à 1 Go par fichier. » |
| #4295.5 | reformulé | décision Louis 17/10 | — |
| #4295.6 | reformulé | `laura_router.py:12` | — |
| #4295.7 | déjà là | non rejoué — tour « Continue l'étude interrompue. » | geste coûteux de Louis |
| #4295.8 | déjà là | `e2e/tests/web/golden-journey-demo-mode.spec.ts` | CI e2e |
| #4295.9 / .10 | reformulé | `route-migration-2208-conditions.ts:212 / :229` | — |
| #4295.11 | déjà là | `demo-seed.service.ts:3970` → `seedTeamGuardrails` (liste « Ne pas contacter » semée même sans collègue) ; « Privé » vide à dessein (`demo-coverage.ts:1671`) | démo : /contacts « Ne pas contacter » |
| #4295.12 | retenu | rien livré : geste d'appareil | 375 px sur appareil |
| #4295.13 | déjà là | `PipeScreen.tsx:80` → `PipeNeedsTracker` | Pilotage › Pipe |
| #4295.14 | déjà là | `OpenNeedsPage.tsx:361` ← `routes/projects/needs.tsx:5` | /projects/needs : Exporter |
| #4295.15 | déjà là | `routes/privacy/index.tsx` → `PrivacyView` | /privacy |
| #4295.16–.21 | câblé | `EstimatedBadge` : `FocalOrgView.tsx:786,831`, `TabPartners.tsx:713`, `TabAccess.tsx:992`, `CompactContactRow.tsx:369` | badges « estimé » |
| #4295.22 | retenu | rien livré : refusé en cloud V4-L11 | — |
| #4295.23 | livré | `POST /accounts/crm-fusions/:id/undo` n'avait aucun appelant → bouton « Annuler la fusion » dans `AccountCrmSays.tsx` (UndoFusionButton), `id` ajouté au contrat `fusion` | Fiche fusionnée › « Ce que dit ton CRM » › Annuler la fusion |
| #4295.24 / .25 | reformulé | NO-GO ratifié | — |
| #4295.26 | à trancher | rien livré, non spécifié ; part existante `FocalOrgView.tsx:927` | — |
| #4295.27 | déjà là | `ProposalPlanBlock.tsx:72` → `SignatureHandoff.tsx:28` → `useProposalSignatureStatus` | Proposition › statut de signature |
| #4295.28–.31 | gestes de Louis | — | — |

## Droits (#4295.23)
Voit le bouton : `integrations:manage` (propriétaire, administrateurs). REFUSÉ : commercial (`sales`) — test `AccountCrmSays.test.tsx` (« REFUS ») ; la route serveur est déjà gardée (`RequirePermission('integrations:manage')`).
Démo : `account_crm_fusions` reste vide à dessein (`demo-coverage.ts:4917`, aucun CRM branché en salle) → aucun bouton en démo, raison inchangée.

## Arbitrages
- J'ai tranché « Partielle » = analyse arrêtée AVEC phases checkpointées (#2478), « Interrompue » sinon : c'est le seul signal de partialité que l'écran possède.
- Historique /settings/import : garde ses libellés propres (« Interrompu — à reprendre ») plus précis que le badge ; non remplacé.
