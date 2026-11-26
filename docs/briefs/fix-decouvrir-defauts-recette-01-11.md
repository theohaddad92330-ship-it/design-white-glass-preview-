# Découvrir — cinq défauts de la recette prod du 01/11 (#4732.1 #4814.1 #4677.4 #4433.3 #4793.1)

<!-- prettier-ignore -->
Périmètre : apps/api/src/modules/demo/demo-discover-common-base.ts, apps/api/src/modules/demo/demo-discover-takeover-coverage.spec.ts, apps/api/src/modules/demo/demo-scripts.ts, apps/ia/app/knowledge/__init__.py, apps/ia/app/knowledge/esn_reference_names.json, apps/ia/app/routers/discover.py, apps/ia/app/routers/discover_signals.py, apps/ia/app/services/company_archetype.py, apps/ia/app/services/data_sources/bodacc_takeover.py, apps/ia/app/services/discover_skill_offers.py, apps/ia/tests/test_4433_3_elargir_monte_un_palier.py, apps/ia/tests/test_bodacc_takeover_4732.py, apps/ia/tests/test_clients_finaux_cabinets_4814.py, apps/ia/tests/test_discover_signals_router.py, apps/ia/tests/test_lot_ab_base_commune_3110.py, apps/web/src/features/discover/lib/*.ts, apps/web/src/features/discover/view/CandidateProvenance*.tsx, apps/web/src/features/discover/view/Discover.tsx, apps/web/src/features/discover/view/SearchEffortNotice*.tsx, apps/web/src/i18n/locales/*/discover.json, apps/web/src/i18n/locales/*/discoverSkill.json, packages/contracts/src/schemas/discover.ts, changes/fix-decouvrir-defauts-recette-01-11.yml, docs/briefs/fix-decouvrir-defauts-recette-01-11.md

## Diagnostic (verdicts de recette prod du 01/11, journaux r45 / r47)

- **#4732.1 (FAIL)** — « Cadrer la recherche › Signaux » n'offrait que quatre types ; aucun rachat/fusion. Le fait fort de carte existait (#4854) mais aucun critère ne le demandait.
- **#4814.1 (PARTIAL)** — KLANIK (NAF 71.12B, ingénierie) restait client final : l'IA ne lisait que les 15 fiches concurrents, pas les 477 ESN connues du produit ; la recherche par compétence ne rangeait pas intérim / VMS / MSP / apporteurs.
- **#4677.4 (PARTIAL)** — le budget de temps des signaux n'était nommé que dans le code (`_signals_deadline`).
- **#4433.3 (BLOCKED)** — « Élargir la zone » vidait la ville (URL `?freetext` seul) au lieu de monter un palier.
- **#4793.1 (PARTIAL)** — aucun marqueur « base commune » sur les cartes.

## Ce qu'on fait

- #4732.1 : source `deal` (BODACC vente + modification nommant fusion/absorption/scission/rachat, prédicat unique `names_merger`), opt-in comme le capital ; signal « Rachat ou fusion » daté et lié ; contrat, rail FR+EN, filtre écran, démo seedée (Cévennes).
- #4814.1 : référentiel nominatif entier côté IA (`esn_reference_names.json`, copie du squelette API + Klanik) ; la recherche par compétence range aussi intérim, VMS, MSP, apporteurs (mêmes prédicats que le mode Signaux).
- #4677.4 : la ligne d'effort dit « Les signaux de N entreprises ont été coupés par le temps imparti… » quand l'entrée `discover-signals` / `time_budget` porte son compte ; aucun chiffre de coût.
- #4433.3 : filtre `zoneRaise` (département, puis région, jamais la France — c144) ; le serveur tente les paliers jusque-là, un par geste ; l'écran monte d'un palier, la ville reste.
- #4793.1 : `fromCommonBase` (booléen) sur le candidat entré par la base commune ; la ligne de provenance dit « Repéré dans la base commune » ; démo seedée.

## Ce qu'on ne fait pas

- Aucune source ni fournisseur nommé à l'écran (#4791.4) ; aucun chiffre de coût (crédits implicites).
- Pas de France en automatique (c144) ; le retrait explicite de la ville reste le geste d'après la région.
- Pas de ligne `demo-coverage.ts` : aucune table ni clé `raw_analysis` neuve (signaux = champ de réponse Découvrir déjà classé). La coupe du temps imparti n'a pas d'équivalent en démo (aucun budget ne tourne en salle).
- #4945, Laura V8 (#5032-#5048), #4962-#5029 : non touchés.
- Lignes modifiées portant un `#NNN` : garde #4429.5, #4640, c144, #4746, #4814, #4677.1, #4305.2, #4791.4, #4793.1, #3941.5.

## Droits

Aucun changement : aucune route, aucune garde, aucune permission ajoutée ; les mêmes filtres de Découvrir passent par les mêmes routes (`/ia/discover/registry`, `/ia/discover/signals`).
