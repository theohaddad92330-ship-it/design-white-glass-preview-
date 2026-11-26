# Rapport — vieilles L5-bis : aperçu d'une recherche enregistrée (#2157.57) + besoin à qualifier (#2152.13)

Branche `claude/vieilles-l5b-apercu-recherche` (merge `--no-ff` de L5 en premier commit).

- 2157.57 recherche enregistrée → livré. `CreateTargetListFromSavedSearchDialog.tsx` (target-lists/view) : chercher à l'ouverture
  → aperçu (retenus, écartés remettables, entreprises sans secteur NOMMÉES, retrait par ligne) → « Créer la cible ».
  Rien n'est écrit avant ce clic. Appelant : `Discover.tsx` (vue Historique, `onCreateTarget` → ouvre l'aperçu).
  Versement inchangé : `useCreateTargetListFromSavedSearch` accepte `candidates` retenus (pas de recherche rejouée).
  Aucun enrichissement payant, aucun coût affiché.
- 2152.13 besoin à la confirmation → livré. `pipeline-detections.controller.ts` : confirmer une piste « intérêt »
  crée, après l'affaire, un besoin du compte (statut par défaut `to_qualify`, provenance `pipeline`, rattaché à l'affaire) via
  `ProjectPipelineService.addNeedForAccount`. Idempotent (besoin même titre+provenance déjà sur l'affaire = pas de doublon ;
  2e confirmation = 404 déjà tranchée). Jamais à la détection/au balayage/à l'écart. Shortlist et entretien : inchangés.
  Droit : `records:write` (test de métadonnée). Gardes `chaine-commerciale-interne…` et `mission-creation…` vertes.
- Pas de migration (`to_qualify` existe déjà). Pas de changement de contrat.
- Compagnons : FR+EN `targets.json` (`createFromSavedSearch`), fragment `changes/vieilles-l5b-apercu-recherche.yml`
  (changelog FR/EN + classification démo : seedé — recherches enregistrées et piste « intérêt » déjà semées).

Tests : vitest `CreateTargetListFromSavedSearchDialog.test.tsx` (5, rouges→verts), `useCreateTargetListFromSavedSearch.test.tsx` (6) ;
jest `pipeline-detections.controller.spec.ts` (13, 1 rouge→vert), 2 gardes d'architecture (verts).

Questions :

1. Reprise après échec partiel : si l'affaire est créée mais l'écriture du besoin échoue, la ligne reste « détecté » et une
   nouvelle confirmation rend 409 (affaire déjà existante). Je n'ai pas étendu la reprise (hors lot) ; à trancher.
2. « Écartés » = retirés par l'utilisateur dans l'aperçu ; je n'écarte pas d'office les ESN concurrentes (changerait le
   versement existant, #3075). À confirmer si tu veux les écarter par défaut.
   SHA de tête : voir `git log`.
