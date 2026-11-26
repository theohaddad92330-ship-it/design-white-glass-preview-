# Rapport SELECTION-IA — #4409 / #4408 (25/10/2026)

Branche `claude/selection-ia-4409-4408-2510`, base `origin/main` (84e77fd4). **Aucun changement de code** : le brief décrit un état antérieur, les deux points sont déjà livrés sur main.

**#4409 (mauvaise entité « OGF »)**

- Appelant manquant (cause) : `companies.py` ne triait pas les hits Pappers. Corrigé par b1a94763, fc49787b, f76e5c46 : `_order_hits` (`companies.py:453`) appelé sur le chemin Pappers (`:618-619`), + rappel par sigle (`_recall_hits_by_sigle :493`).
- Preuve : `tests/test_4409_homonym_operational_head.py` (jeu à trois homonymes, holding 0 / établissement 3-5 / groupe ~1000 — Pappers ET registre, rien filtré) + `test_selector_homonym_recall.py` : 18 verts.

**#4408 (« sans gros process achat »)**

- Appelant manquant : la contrainte n'avait aucune porte dans la recherche de Laura. Livré : `purchasing_process="light"` → `split_heavy_purchasing` (`purchasing_process_filter.py`, appelé `chat_tools.py:~14127`) ; GE / ≥ 5 000 salariés / barrière calculée C-D sortent, rendus à part avec leur raison, hors du compte des « 10 » ; rattachés à un groupe mis à part (`group_attached`) ; sans donnée de taille = gardé et dit « non vérifié ».
- Élargissement : paliers `widened` + `widening_note` / `widening_proposal` (`chat_tools.py:14265`, `:14580-14603`) — « N comptes ; élargi à <palier> », jamais de demande de permission.
- Preuve : `test_4408_light_purchasing_process.py`, `test_4408_volume_sans_gros_process_achat.py`, `test_4438_4408_filtre_metier_recrutement.py` : 16 verts.

**Non fait / à vérifier en prod (non vérifiable sans réseau ni clés)** : que Malakoff Humanis / Harmonie Mutuelle portent bien une tranche ≥ 5 000 ou « GE » au registre — sans donnée de taille ils RESTENT (décision « absence ≠ preuve »). Si la recette les revoit, c'est une donnée registre manquante, pas un appelant. Démo : rien de nouveau seedé, aucun écran ajouté. Rattrapage des comptes analysés : sans objet (aucun changement de collecte).
Arbitrage pris : ne rien recoder plutôt que dupliquer un livré. Environnement : `apps/ia/.venv` créé en Python 3.12 (non commité).
