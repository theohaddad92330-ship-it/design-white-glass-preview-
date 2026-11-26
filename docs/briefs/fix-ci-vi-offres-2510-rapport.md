# Rapport FIX-CI-VI-OFFRES (25/10) — les 7 rouges de la PR #4565

Cause commune : CASCADE-PLANCHER-5 (088dc5cf) remplace « 10 offres RENDUES » par « 5 offres DU MÉTIER » et ajoute les paliers termes/fenêtre/groupe ; PERTINENCE-PARTOUT (b45ee342) applique le verdict de Découvrir à l'analyse. Les 7 tests décrivaient l'AVANT. Les 7 sont **(A) test périmé réécrit** ; aucun code touché (les deux règles non négociables vérifiées : la veille n'achète jamais, aucun achat n'est doublé).

1. `test_offres_15_10_fiche.py` order_nine → **(A)** réécrit `four_fantastic` (4 < 5 ⇒ Mantiks, pas TheirStack) + nouveau `nine_fantastic_offers_buy_nothing_more`. Fixture : `THEIRSTACK_API_KEY` posée (sans clé une source n'est jamais appelée) et `_theirstack_search` stubbé (pas de réseau).
2. order_theirstack_only_when_both… → **(A)** 2+2 = 4 offres du métier < 5 ⇒ TheirStack une fois (Mantiks aussi, une fois).
3. order_is_sequential → **(A)** l'ordre se lit sur la 1re venue ; le palier « fenêtre » relit Fantastic en 365 j (autre question, autre clé) ; Mantiks/TheirStack exactement 1×.
4. fewer_than_ten_rendered → **(A)** `nothing_of_the_trade_still_reaches_theirstack`. Corollaire : `ninety_rendered_none_kept` (2 du métier ⇒ TheirStack part) réécrit, + `many_rendered_but_floor_reached_never_calls_theirstack` (le revers, sait dire NON).
5. `test_discover_fresh_jobs_4430.py::stale_card` → **(A)** Fantastic 2× = palier 0 (90 j) puis fenêtre (365 j) : élargissement, pas doublon. Le test le prouve (fenêtres `[90, 365]`, Mantiks/TheirStack 1×). Fixture : `_ats_for_card` et `_theirstack_search` stubbés.
6. `beyond_ten_stale_cards` → **(A)** le plafond de 10 CARTES tient (10 noms distincts, ≤ 2 appels Fantastic chacun, jamais la 11e) ; le compteur d'appels n'était pas le plafond.
7. `test_3901…::placement_en_cdi_garde_tout` → **(A)** `Caissier` est « non placé » (aucune ESN ne le place) : l'analyse applique désormais le verdict de Découvrir (25/10). Garde : bureau d'études, développeur, SOC restent.

Autre rouge vu ici, hors des 7 : `test_a_card_read_from_a_recent_cache…` échoue dans cette VM sans réseau (BODACC `_capital_rows` coupe le budget de la carte) ; vert une fois la source stubbée, non modifié. À recouper avec la CI.
Pytest ciblé : 38 passed, 1 failed (le test réseau ci-dessus). Les 3 fichiers de test sont les seuls touchés.
