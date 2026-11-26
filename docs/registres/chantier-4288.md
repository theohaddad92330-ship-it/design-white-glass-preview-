# Registre — chantier #4288 (Laura : du besoin à l'analyse, comptes en une phrase, listings, sélection)

Lot du 26/10/2026, base `origin/main` (48861cd00). Constat de code : les six points portent déjà leur code ET leurs tests
sur `main` ; ce lot n'ajoute aucune ligne de code, il les vérifie un à un et pose le registre. « déjà là » = trouvé sur
`main`, tests rejoués ce jour ; rien n'est dit « livré » sans la recette en prod, que cette VM ne peut pas jouer.

| Point   | Demande                                                     | Sujet                                | État    | Preuve                                                                                                                                                                                                                                   |
| ------- | ----------------------------------------------------------- | ------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #4288.1 | Cascade comptes : espace, puis registre, web en dernier     | Laura, comptes en une phrase         | déjà là | `apps/ia/tests/test_3905_accounts_cascade.py` + `test_4288_1_cascade_order_line.py` (rejoués, verts) ; `chat_accounts_cascade.py`, `chat.py:1792`                                                                                        |
| #4288.2 | Jamais de recherche web avant les comptes de l'espace       | Laura, forçage find_accounts         | déjà là | `test_3905_find_accounts_forced.py` + `test_the_web_never_comes_before_the_accounts` (rejoués, verts)                                                                                                                                    |
| #4288.3 | Espace neuf : une phrase jusqu'à l'analyse, de bout en bout | Parcours Découvrir / Laura / analyse | retenu  | Les maillons existent (forçage, cascade, carte, lot) ; aucun test ne les enchaîne et le modèle vivant n'a jamais été recetté. Reste à jouer en prod, espace neuf.                                                                        |
| #4288.4 | Liste CRM des affaires perdues 2026, avec interlocuteur     | /chat, listings                      | déjà là | `test_4288_forced_record_listings.py` (forçage de `list_records` au round 0) ; repli espace Bellum nommé (`record_listing.py:_fetch_bellum_lost_deals`). Le FAIL de la recette du 19/10 est antérieur à ce code : à rejouer en prod.     |
| #4288.5 | Candidats vus en entretien, missions terminées              | /chat, listings ATS                  | déjà là | `test_4065_8_9_crm_ats_past.py` ; ATS non branché dit « pas lu », jamais « zéro » (`record_listing.py:962`). Les candidats restent non mesurables tant qu'aucun ATS n'est branché : conforme à la doctrine, pas un défaut.               |
| #4288.6 | Cocher les entreprises de Laura lance l'analyse             | /chat, carte de classement           | déjà là | `AccountRankingCard.results.test.tsx` : 15/15 verts, dont « cocher 2 comptes → UN lot de 2 » (`POST /analysis-batches`) ; libellé fr/en présent. Droit : `analysis:run`, cloisonné par `workspaceId` (`analysis-batches.controller.ts`). |

## Droits (tranche sans changement d'écran)

Aucun menu, route ni permission touché. Pour mémoire : lancer un lot exige `analysis:run` dans l'espace actif ; sans lui,
refus. Aucun test de refus ajouté (rien n'a changé).
