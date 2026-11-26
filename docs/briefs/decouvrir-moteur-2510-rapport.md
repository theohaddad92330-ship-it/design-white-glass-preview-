# DECOUVRIR-MOTEUR (25/10) — rapport

Branche `claude/decouvrir-moteur-2510` (base `origin/claude/integ-2510-vi`), poussée, pas de PR.

- **#4519** (ia) — MESURÉ : VI traduisait déjà l'expertise en métiers pour la moisson. Restait le libellé littéral dans l'élargissement (domaine « web », ou OU « Data » / « Intelligence ») et le remplissage `_fill_skill_search` : c'est l'entrée d'A3S. Corrigé, test rouge → vert (`test_decouvrir_expertise_4519_moteur.py`).
- **#4469** — DÉJÀ LIVRÉ dans VI (`offer_trade_text`, `_COMPOUND_PLACE`, clé `k5`, `test_competence_lieu_4469*.py`) : 50 tests verts, mesurés, aucun code ajouté. Garde « vue » = `_names_common_word_skill` (autre famille, mot courant).
- **#4517** (web) — le premier lot n'est plus affiché : tenu en réserve (`discover-held-lot.ts`) et rendu seulement par « Arrêter », nommé partiel. Le second passage est fait DANS le même chargement (`useDiscoverSearch`). `DiscoverLoading` = une ligne + Arrêter + squelettes muets. Supprimés : `useSecondPass`, `SecondPassNotice`, `PartialLotNotice`, `discover-loading-steps`, clés i18n.
- **#4490** — client DÉJÀ livré dans VI (rien ne part au lancement, `stopDiscoverSearch`, `run_or_cancel` côté IA). Manquait le maillon API : le proxy Nest ne relayait pas la coupure → `client-abort.ts` + signal vers l'IA.
- **#4420** (ia, contracts) — `coverage_matrix.py` : compteur par cause et par source (sans clé, quota, 4xx, 5xx, réseau, délai, cache, plafond), offres filtrées par motif, `silentFilters` (≥ 20 offres reçues, 0 rejet) ; dans `query.skillSearch.coverage` et au journal (WARNING si filtre muet).
  Tests : pytest (4 fichiers IA, 64 verts), vitest web 88 fichiers / 1309 verts, jest API 55 verts, contracts 7 verts, `tsc` web propre.
  Arbitrages (le plus simple) : 20 offres = seuil du filtre muet ; matrice en donnée + journal, pas d'écran ; budget #4517 = deux passages séquentiels (≤ 2 × 32 s côté serveur, chacun < 45 s du proxy), NON mesuré en prod ; matrice « rejouable en prod » (critère de #4420) non faite.
  Échelle d'élargissement de zone (#4429) : non touchée (`_widen_skill_by_zone` laissé tel quel).
