# Rapport — 6 pytest rouges de la vague O (PR #4752), 28/10

Branche integration-vague-o-2810. Périmètre : 3 fichiers de tests, aucun code de production (prose_card_consistency.py intact).
Cause : #4631.1 remplace la prose « N comptes » par la phrase de la garde quand aucune carte n'est rendue ; les montages ne rendaient rien.
Le test tranche ce que le montage prouve ; la garde a raison.

1. test_laura_agit_plan::test_a_search_runs_up_to_eight_tool_rounds — LIVRAISON : le test compte 5 rounds puis « Voici 10 comptes. » → carte account_ranking de 10 éléments ajoutée.
2. boucle::test_zero_in_the_workspace…\_accounts_are_delivered — LIVRAISON (c'est son nom) : carte de 10, assertion = prose + 10 éléments rendus.
3. boucle::test_a_failed_tool_does_not_end_the_turn — LIVRAISON : la recherche externe réussit après l'échec d'un outil → carte de 10.
4. boucle::test_a_tool_whose_output_breaks_the_card_builder… — PANNE SANS RENDU : le constructeur de cartes casse, rien n'est rendu → l'assertion attend la phrase de la garde (texte exact) ; appels d'outils et tour non interrompu inchangés.
5. phrase::test_a_java_account_search_reply_never_gets_the_sentence — LIVRAISON : le test prouve l'absence de la phrase-gabarit, pas une panne → carte de 10, startswith conservé.
6. phrase::test_the_sentence_written_by_the_model_is_removed — LIVRAISON : même raison ; gabarit retiré, pas de triple saut de ligne, carte conservée.

Vérifié depuis apps/ia : les 3 fichiers → 49 passed ; -k "prose_card or 4631" → 18 passed.
Aucun défaut de production relevé. Helper \_ranking_card dupliqué dans les 3 fichiers (périmètre imposé).
