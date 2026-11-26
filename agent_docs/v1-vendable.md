# V1 vendable — rapprocher la sortie du deck Skaizen

Réf. issue GitHub **#275**. Réf. client : deck « Plans de compte ESN » (Skaizen × SalesConnect,
64 pages, 4 comptes : Crédit Agricole, Société Générale, Bpifrance, Arkéa·Fortuneo).

Objectif : la sortie d'analyse BellumAI doit égaler le livrable du deck. Le filtre d'entités
(SCI/holdings/GIE, `apps/ia/app/services/entities.py`, livré #271) est la base propre de la
cartographie ; ce chantier structure le reste.

## Contrainte transverse

Chaque item est un chantier **prompt + schéma**. **Éval golden-set obligatoire** avant merge
(ne pas dégrader la sortie actuelle) — même contrainte que #274. Harness livré :
`apps/ia/evals/` (`python -m evals.run_eval [--judge] [--require entities,zones]`, cf.
`evals/README.md`). Golden SG = référence deck. Chaque item ship avec ses attentes golden.

Fichiers concernés :

- `apps/ia/app/prompts/bellum_facts.py`
- `apps/ia/app/prompts/bellum_strategy.py`
- `apps/ia/app/models/outputs/research.py`

## Chantiers (#275)

### Cartographie

- [x] **Zones de priorité par entité** — matrice **influence × accessibilité** livrée
      (déterministe, `apps/ia/app/services/prioritization.py`). Axe influence = tier P1/P2/P3
      existant ; nouvel axe **accessibilité** (`accessibilityBand` high/medium/low : `itAutonomy`
      autonome→high / centralise→low, entité IT→high, sous-DSI→low). Croisement → **4 zones**
      (`attaque_immediate` / `influence_a_activer` / `quick_win` / `longue_traine`) par entité +
      compteur groupe `entityZones`. Schéma contrat MAJ. Reste : enrichir `itAutonomy` (LLM le
      fournit déjà, fixtures pas encore régénérées) + rendu UI (carte matrice dans le dashboard).
- [x] **What-to-sell par entité** — `whatToSell` (angles ESN) + `stack` (technos par BU) ajoutés
      par entité : prompt `bellum_facts` (scopé aux entités majeures + garde-fou troncature),
      modèle `EntityExhaustive`, schéma contrat, rendu dashboard. Validé par le **harness golden-set**
      (`apps/ia/evals/`, cf. ci-dessous). Reste : run live pour peupler les fixtures + `--judge`
      sémantique (GBIS=quant plausible ?) — la qualité sémantique se valide contre un run réel, pas
      en unit test.

### Contacts

- [x] **Rôles décisionnels** — déterministe `classify_decision_role(title)`
      (`apps/ia/app/services/decision_role.py`) : TECHNICAL (DSI/CTO/RSSI…) · ECONOMIC (CFO/DAF/achats) ·
      USER (métier/commercial/ops) · CHAMPION (CEO/DG/président) ; aucun match → rôle LLM conservé
      (= À VÉRIFIER via bucket `a_verifier`). Appliqué en override dans `classification.py`, migration
      `AddDeckDecisionRoles`, rendu dashboard.
- [x] **Tags de source** par donnée — `contactSourceTag` (API `analysis-telemetry.service.ts`) :
      INTERNE (crm/manual) · PUBLIC (apollo/linkedin/pappers) · HYPOTHÈSE (ia/web inféré) ·
      **RISQUE** (obsolète — Apollo dit l'employeur actuel ≠ compte ET ≠ entité → la personne est
      partie ; conservateur, pas de faux positif sur filiale). Badge rouge dashboard.

### Signaux & plan

- [x] **Signaux publics → hypothèses qualifiées** — `qualifiedHypotheses` (phase 1, prompt
      `bellum_signals`) : `{hypothesis, basedOnSignals, confidence (confirmee/probable/a_verifier),
esnAngle}`. Règle de convergence (1 signal→a_verifier, 3+→confirmee). Modèle + schéma contrat + rendu dashboard. Golden group `hypotheses` (min 3, mention MLOps/data/fraude…).
- [x] **Feuille de route 30j** par zone — `prioritySubAccounts` (phase 4, plan) enrichi :
      `nextAction` (prochaine action 30j), `approachAngle` (top_down / bottom_up / middle_out),
      `deadline`. Prompt `bellum_plan` + modèle `PrioritySubAccount` + rendu dashboard. Phase 4
      (hors golden research phase 1) → validé par unit tests `test_plan_roadmap.py`.

## Notes

- Plusieurs items existent partiellement (`angles`, `pains`, contacts) mais pas structurés comme
  le deck. Chantier = structuration schéma + prompt.
- Ordre suggéré : cartographie (zones + what-to-sell) → contacts (rôles + tags) → signaux/plan.
  Chaque étape ships avec son éval.
