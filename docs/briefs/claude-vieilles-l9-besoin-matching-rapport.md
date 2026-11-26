# Rapport — lot L9 « Besoin non pourvu : gestes de matching, comparaison, feedback »

Branche `claude/vieilles-l9-besoin-matching` (depuis origin/main 96088514). Aucune PR (le fil l'ouvre).

## Par point

- **#2176.13** axe « Expérience comparable », poids 0 → **livré** `a02ef2e2`. `comparable_experience` en fin de `MATCH_AXES`,
  `MATCH_DISPLAY_ONLY_AXES` : poids forcé à 0 (`normaliseMatchWeights`, schéma `max(0)`, pondération journalisée sans la clé relue à 0),
  exclu de `matchScoreIsMeasured`. `axisComparableExperience` (axes.ts) ; non évaluable nommé (besoin sans obligatoire / profil sans mission).
  Preuve rang/score inchangés : `comparable-experience-axis.spec.ts` + golden `consultant-matching.golden.spec.ts` vert.
- **#2176.55** coût/marge selon droits → **livré** `91a12778`. `identitiesFor(…, { canReadFinance })` : colonnes coût lues seulement sous
  `finance:read`, `finance: { costCents, marginCents }` (salarié : coût chargé, sinon TJM d'achat ; marge null si un des deux manque).
  Refus prouvé API (`compare-cost-margin.spec.ts` : clé absente + SQL sans colonne) et écran (`CompareTable.test.tsx`).
- **#2176.62** CV original depuis la carte → **livré** `5caf8c06` (`OriginalCvButton`). Refus API **déjà là** :
  `apps/api/src/modules/consultants/talent-document-file.spec.ts:104` ; refus écran prouvé (`OriginalCvButton.test.tsx`).
- **#2178.11 / .12 / .13 / .14 / .15 / .16 / .17** → **livrés** `9be8ecd4` : `NextBestMoveGestureDialog` générique (pas sept),
  branché dans `MatchDrawer` (les liens vers une page remplacés). PATCH existant au seul clic ; .16 brouillon à copier, rien envoyé ;
  .17 réutilise `NeedExternalSourcing` (ne part que sur « Lancer »).
- **#2178.33** feedback propose une mise à jour → **livré** `9be8ecd4` (bouton par axe dans le bandeau des refus, origine nommée,
  validation requise, aucun poids sur le classement).
- **#2178.34** / **#2178.36** → **non faits** (arbitrage Louis 31/10 : écartés / écran déterministe sans prompt).
- Démo + changelog → `558d3948` : fragment `changes/vieilles-l9-besoin-matching.yml` (changelog FR/EN + `DEMO_MATCHING_UNFILLED_NEED_COVERAGE`,
  validé par `fusion_fragments.py` sur copie), `demo-matching-gestures-coverage.spec.ts`. Original du CV vide à dessein (raison #4034).

## Tests lancés (ciblés)

contracts `match.test.ts` (rouge 5 → vert 27) ; api : comparable-experience-axis (rouge → vert), compare-cost-margin (rouge → vert),
golden, engine, explanation, calibration, blocking-axes, shortlist, matching-draft-need, protected-criteria, no-double-effect, demo spec ;
web : CompareTable, OriginalCvButton, NextBestMoveGestureDialog, MatchDrawer, MatchCard, MatchExplainSheet, no-match-causes, MatchRadar,
radarGeometry (fixture 14 → 15 axes), gardes i18n/44px/thème/#2178. `tsc --noEmit` contracts, api (seul `@bellum/email` non construit,
préexistant), web : propres. `pnpm ci:local` non lancé (contrat touché ⇒ mode complet, réservé à la CI).

## Débordements / questions

- Le Périmètre nomme `apps/api/src/modules/matching/**` : le code vit dans `apps/api/src/modules/consultants/matching/**` (travaillé là).
- Hors périmètre, minimal : `NeedMatchTab.tsx` (appelant, passe `finance`), `radarGeometry.test.ts` (indice du 15e axe).
- Question : « réactiver » lit `archived_at` OU `availability = 'indisponible'` ; faut-il aussi `en_mission` ?

SHA de tête : voir `git log -1` de la branche (commit de ce rapport, parent `558d3948`).
