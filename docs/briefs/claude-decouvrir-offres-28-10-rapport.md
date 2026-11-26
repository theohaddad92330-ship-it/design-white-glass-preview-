# Rapport lot N1 — Découvrir : preuve d'offre, palier, zone (28/10/2026)

Branche `claude/decouvrir-offres-28-10` · SHA poussé : voir `git log` de la branche (dernier commit = ce rapport). Registre : `.claude/notes/registre-2026-10-28-n1.md`.

**Constat d'antériorité.** #4646 (cœur), #4663, #4664 et #4657 étaient DÉJÀ livrés par la vague L (#4666, 28/10 08:34) ; les constats de recette datent d'avant. Relus à l'appelant, pas recodés ; ce lot comble ce qui restait.

- **#4646.2** lien de l'annonce recopié → `discover_carried_offers.py:69` ← `discover-filters.ts:1428` (+ contrat `discover-origin.ts`) → `test_offres_decouvrir_dossier_4646.py`, `discover-origin.test.ts`, `discover-filters.test.ts`.
- **#4646.5** la ville cherchée suit le compte même siège ailleurs (Lille ≠ Compiègne) → `discover-filters.ts:1391` ← `AnalyzeSelectionDialog.tsx:121` → `discover-filters.test.ts` (2 cas, dont le NON).
- **#4646.7** `found: 0` ne se contredit plus → `phase1_research.py:1515` ← `OffersCascadeNotice.tsx` (TabSignal.tsx:98) → `test_offres_decouvrir_dossier_4646.py`, `offers-cascade.test.ts`, `OffersCascadeNotice.test.tsx`.
- **#4646.9** un dossier Découvrir d'avant la reprise le dit → `DiscoverOriginLine.tsx:78` ← `AccountVerdictSummary.tsx:244` → `AccountVerdictSummary.test.tsx` (cas positif + 3 NON).
- **#4706.2** la base de la zone sur la carte → `CandidateRow.tsx:336` → `CandidateRow.skillEvidence.test.tsx`.
- **#4706.1** `à trancher` : sur les mêmes lignes « siège » ne fait que retirer (`test_4706_siege_inclus_dans_implante.py`). L'écart 24/17 vient très probablement de la liste coupée à `limit` après tri — hypothèse NON mesurée (pas de prod d'ici).
- **Jumeaux** : la ligne de base de zone n'était que dans le tiroir, comme la preuve d'offre (#4663) — même défaut, même correctif (ajout carte, tiroir gardé).

**Portes** (cibles) : vitest 4 specs web CandidateRow + discover-geography 83 ✓, discover-filters 181 ✓, AccountVerdictSummary 34 ✓, OffersCascadeNotice 6 ✓, contracts discover-origin 15 ✓ + offers-cascade 10 ✓, jest seller-hypotheses 8 ✓, pytest 4646 (9) + 4706 (2) ✓. tsc web : 0 erreur `error TS` (exit 0). Non lancés (VM) : check-types racine, build prod, suite complète, `check-types:tests` API.

**Mesure « cartes avec preuve avant/après »** : non faisable d'ici (aucun accès à la prod ni aux fournisseurs). Avant : la ligne n'existait que dans le tiroir ; après : sur chaque carte portant `skillEvidence`.

**Questions.** (1) #4706.1 : accepter que « siège » rende des lignes que « implanté » a coupées (liste plafonnée) et afficher plutôt un total, ou couper « siège » dans la même fenêtre que « implanté » (moins de résultats, mais moins utile) ? (2) #4646.10 rattrapage : je n'ai posé que l'écran qui DIT la collecte antérieure ; le rejeu ciblé du segment offres des comptes `origin = 'discover'` est un geste d'admin à décider (jamais au déploiement). (3) #4646.6 : les offres écartées (âge/métier/zone) ne sont nommées qu'en recherche, pas au dossier. (4) `profile=none` d'`offer_pertinence.py` reste à mesurer avant tout filtre.
