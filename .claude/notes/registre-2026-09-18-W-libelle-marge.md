# Registre des points — LOT W : « marge brute » désigne la marge COMMERCIALE (#2575)

Base : `73b6ecdc4` (`origin/main`, 18/09/2026). Branche : `fix/libelle-marge-commerciale-18-09`.
Source : Louis, 18/09/2026 — le chiffre servi par `GET delivery/finance/margin`
(`aggregateMargin`) est un niveau COMMERCIAL, mais deux écrans l'affichaient sous
« Marge brute »/« Gross margin ». Décision : on renomme le libellé, on ne touche
ni au calcul ni au seuil d'alerte.

## Points traités

| Point | Demande | État | Preuve | Fichiers clés |
| --- | --- | --- | --- | --- |
| #2575.1 | Renommer la tuile MissionTracking grossMargin→commercialMargin | déjà là | `ccd464f5c` — clé ET valeur renommées FR/EN (« Marge commerciale »/« Commercial margin »), usage `MissionTrackingTiles.tsx:168` mis à jour ‖ trace `#2575.1` en code de production sur origin/main — balayage du 18/09/2026 | `apps/web/src/i18n/locales/{fr,en}/missionTracking.json`, `apps/web/src/features/mission-tracking/view/MissionTrackingTiles.tsx` |
| #2575.2 | Vérifier les libellés `finance.margin.*` du pilotage (title/aggregate/tooltips) | déjà là | Aucun ne dit « brute »/« gross » en FR ni EN (`title`: « Marge », `aggregate`: « Marge de l'espace », tooltips neutres) — confirmé un par un, non modifié, garde `commercial-margin-is-not-called-gross.test.ts` (2 tests sur 5) le vérifie désormais en continu | `apps/web/src/i18n/locales/{fr,en}/pilotage.json` |
| #2575.3 | Renommer `grossMarginExplanation`→`commercialMarginExplanation` | déjà là | `ccd464f5c` — fonction + JSDoc, appelant `FinancePanel.tsx:10,179`, test `explanations.test.ts` (describe + 3 usages) ‖ trace `#2575.3` en code de production sur origin/main — balayage du 18/09/2026 | `apps/web/src/components/explain/explanations.ts`, `apps/web/src/features/pilotage/view/FinancePanel.tsx`, `apps/web/src/components/explain/explanations.test.ts` |
| #2575.4 | Garde qui rougit si un libellé d'`aggregateMargin` redit « brute »/« gross » | recetté | `ccd464f5c` — 5 tests (it.each FR/EN sur la tuile, it.each FR/EN sur `finance.margin`, 1 témoin légitime). Prouvé rouge en réintroduisant « Marge brute » dans `missionTracking.json` (`expected 'Marge brute' not to match /\b(brute\|gross)\b/i`), puis restauré et revérifié vert | `apps/web/src/architecture/commercial-margin-is-not-called-gross.test.ts` | ‖ Recette prod 18/09 (7e769e0ca) : « brute » et « gross » cherchés sur 7902 caractères de /pilotage/finance : 0 occurrence (tuiles « Marge totale (vente directe) », « marge nette (via apporteur) », « Marge des lignes contractualisées »). ⚠️ FRANÇAIS SEULEMENT — la bascule anglaise n'a pas été testée (changer la langue persiste une préférence, hors lecture seule).
| #2575.5 | Vérifier si `billing.json:233` (« Gross margin ») porte `aggregateMargin` | déjà là | NON — champ SAISI par l'utilisateur dans le simulateur ROI (`ProfitabilityCalculator.tsx`, `useState<RawInputs>().marginPercent`), jamais alimenté par `aggregateMargin` ni par le moteur de marge. Hors périmètre du défaut #2575, non touché | `apps/web/src/features/billing/view/ProfitabilityCalculator.tsx`, `apps/web/src/i18n/locales/{fr,en}/billing.json` |

## Ce qui n'a pas été touché, et pourquoi

- `apps/web/src/i18n/locales/{fr,en}/missions.json` (`engine.levels.gross`, `engine.deductions`) —
  désigne bien la vraie marge brute du moteur. Le témoin de la garde (#2575.4) le
  vérifie explicitement.
- `mission-margin-engine.ts` et tout son calcul — aucune ligne touchée (consigne explicite).
- `metric: 'gross_margin'` dans `explanations.ts`, `kpiTarget('gross_margin')`,
  `EXPLAINABLE_NUMBERS` (`packages/contracts`), `explain.json` (namespace `gross_margin`),
  `demo-coverage.ts` (`DEMO_KPI_TARGET_TILES.gross_margin`) — identifiants internes
  partagés (contrat inter-packages, seuils de cible), jamais rendus à l'écran comme
  texte « brute »/« gross » (vérifié : les valeurs traduites sont neutres — « moyenne
  pondérée sur N mission », etc.). Hors périmètre exact du brief (rename du libellé,
  pas du calcul ni des seuils) ; les toucher aurait débordé sur `packages/contracts`
  et ses consommateurs.
- `demo-coverage.ts` / `demo-dataset.ts` — aucune table ni clé `raw_analysis` nouvelle,
  vérifié par grep, pas seulement supposé.

## Portes passées

`pnpm --filter @bellum/web lint` (0 erreur, warnings pré-existants), `tsc --noEmit`
(apps/web), `pnpm lint:exports:types` (knip), `prettier --write` sur les fichiers
touchés (aucun diff de fond, un seul rewrap de ligne), tests ciblés (310 passés :
garde, `explanations.test.ts`, `FinancePanel.test.tsx`, `MissionTrackingPage.test.tsx`,
`i18n/parity.test.ts`).
