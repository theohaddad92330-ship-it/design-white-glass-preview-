# Registre — lot COMPTE-SAVOIR (vague L, 27/10/2026)

| Point | État | Preuve en recette (geste à l'écran en production) |
|---|---|---|
| #4323.4 — « 17 ESN » vs « 10 profils ex-ESN » sans lien écrit | livré | Arkéa › Ce que je sais : sous « ESN présentes sur le compte », la ligne « Cette liste compte des sociétés. Les « profils ex-ESN »… comptent des personnes » apparaît quand une rubrique cite des ex-ESN (`present-esn-unit-note`) ; absente sinon. |
| #4323.3 — compte SANS brief : deux cartes ESN | livré (reco tranchée : une seule liste, toujours) | THALES DMS (sans brief) : « ESN présentes sur le compte » rendu sous la grille ; « ESN déjà en place » n'est plus rendue ; « Positionnement » reste (notre angle, pas la présence). Appelant : `AccountKnowledgeScreen.tsx` (bloc `knowledge-present-esn-nobrief`). |
| #4323.1/.2 — une seule ligne, preuve distinguée | déjà là | `AccountKnowledgeScreen.tsx` › `PresentEsnList` (Déclaré / Observé / Déduit). |
| #4324 — intitulés DSI/RSSI | reformulé, livré | Intitulés pluriel/sigle (« Directeur des Services Numériques », « DOSI », « Directeur des Technologies ») reconnus côté IA (`decision_role.py`) et contrats (`isTechnicalDeciderTitle`) ; le « dit pourquoi » existait déjà (`coverage.service.ts`, `TabCoverage.tsx`). Preuve : les 6 comptes de Julien Seigneur, siège technique rempli ou raison écrite. |
| #4327 — filiale absente (Fortuneo) | déjà là | Collecte + fusion web : `routers/phase1_research.py:550`, `services/entities.py:581` ; rattrapage ciblé par segment : `POST …/signals/subsidiaries` (`admin-segment-catchup.controller.ts`). À rejouer sur Arkéa par le back-office (jamais au déploiement). |
| #4409.1 — tête de groupe en tête | déjà là | `routers/companies.py` › `_order_hits` (chemin Pappers), tests `test_4409_homonym_operational_head.py`. Recette 27/10 PASS. |
| #4409.2 — tri aussi quand Pappers répond | déjà là, non prouvable à l'écran | Couvert par test (`test_pappers_ordering_…`). |

Démo (règle n°9) : aucune table ni clé `raw_analysis` neuve → `demo-coverage.ts` inchangé ; la note et la liste lisent des données déjà semées.
