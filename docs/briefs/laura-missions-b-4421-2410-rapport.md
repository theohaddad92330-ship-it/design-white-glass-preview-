# Rapport — lot LAURA-MISSIONS-B (#4421 points 10 et 13, 24/10)

Branche `claude/laura-missions-b-2410`, base `origin/claude/laura-missions-2410` (lot A, 23b1f6681f). Sans PR.

## Conception (point 10)

Les comptes ne sont connus qu'à la fin de la collecte d'offres. La recherche de personnes ne peut donc pas tourner
en parallèle des offres. Elle tourne **en parallèle de la lecture des contacts connus**, dans le budget de cette
lecture : `_talent_account_contacts` travaille en deux temps.

1. On situe chaque compte dans l'espace.
2. En même temps, on lit les contacts des comptes de l'espace et on cherche les personnes des **3 premiers comptes
   absents** (15 s par recherche, sous le budget contacts de 25 s).

Le pire cas du tour ne bouge pas : 45 s d'offres + 25 s de contacts = 70 s ≤ 90 − 20.

La recherche réutilise la primitive existante (`search_people_with_status`, niveau de recherche gratuit, cache commun
30 j), avec des fonctions cherchées « recrutement + décideurs techniques ». Elle passe par les mêmes contrôles que la
collecte fraîche de Découvrir :

- l'espace **actif**, dont l'appartenance est re-prouvée ;
- un compteur espace × jour de Paris (`fresh_jobs.take_space_day`, clé `people_fresh`).

## Points

| #   | État | Ce qui a été fait                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Test                                                                                                                                                        |
| --- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | fait | Pour un compte hors espace, les personnes trouvées arrivent dans le même tour (`contacts_state: found_outside`, `to_verify`, sans `contact_id`). Un homonyme d'une autre entreprise est écarté. Si la recherche est lente (coupée au budget), en erreur ou si la source est muette, la ligne d'avant reste (« Pas encore dans ton espace… lancer l'analyse ») : rien n'est inventé et le tour n'échoue jamais. Les comptes de l'espace ne sont jamais cherchés. Branchement prouvé : l'outil passe l'espace et le profil retenu. | `test_4421_10_contacts_meme_tour.py` (16, rouge → vert)                                                                                                     |
| 2   | fait | `prepared_message` est préparé pour la première personne (`status: prepared`, `sends_email: False`). Il ne cite que des faits lus : l'offre datée, les compétences, la disponibilité et la zone retenues. Il ne nomme jamais le consultant. Aucun message existant n'est lu. La carte affiche « Mail préparé pour X — à relire, c'est toi qui l'envoies ».                                                                                                                                                                       | idem (`…10a…`, `…10b_la_consigne…`)                                                                                                                         |
| 3   | fait | Plafond de 30 recherches par espace et par jour. Aucun crédit affiché, aucun fournisseur nommé (journaux compris). Le rang ne lit que la fonction : ni photo ni ville ne voyagent. Droits : sans espace actif, rien ne part et le refus est **nommé**. Le plafond atteint est nommé de la même façon (FR + EN sur la carte).                                                                                                                                                                                                     | `…10c_sans_espace_actif…`, `…10c_plafond…`, `…10c_la_carte_nomme_le_refus`                                                                                  |
| 4   | fait | Démo Camille Roussel : SII et Alten montrent chacun 2 personnes **simulées** aux noms complets (un décideur inclus) et un mail préparé. Les suites « Voir les contacts » et « Préparer le message » sont alignées. Aucun compte semé (en production, ces personnes ne deviennent pas des contacts). La raison de `DEMO_MISSIONS_FOR_PROFILE_COVERAGE` est complétée ; aucune clé neuve.                                                                                                                                          | `demo-missions-follow-ups.test.ts` (15, rouge → vert), parité + 7 specs démo, 5 specs chat, `demo-missions-c4-coverage.spec.ts`, `tsc --noEmit -p apps/web` |
| 5   | fait | Scénario c77 « mission-a-lille-cv-compte-hors-espace-contacts-meme-tour » ajouté (261 + 21). La règle est portée par la description de l'outil. Changelog FR + EN : item4 de `2026-10-24-laura-missions-cv-joint`.                                                                                                                                                                                                                                                                                                               | `test_copilote_scope_eval.py` (rouge → vert), `test_prompt_golden`, `test_prompt_fingerprint`, vitest `changelog`                                           |

## Tests lancés (ciblés)

- **pytest (Python 3.12, uv venv)** : tous les `test_4421_*`, `test_chat_find_accounts_for_talent`, `test_fresh_jobs_4430`,
  `test_known_shape_gate_account_ranking*`, `test_copilote_scope_eval*`, `test_prompt_golden`, `test_prompt_fingerprint`,
  `test_rights_matrix`, `test_laura_acts` et 6 fichiers voisins. Tous verts.
- **Tests existants adaptés (2)** : `test_chat_find_accounts_for_talent::…espace_neuf…` et
  `test_4421_laura_ne_s_arrete_jamais::…java_vue…`. On y pose un espace résolu et une source de personnes non branchée.
  Leur assertion d'origine est gardée telle quelle.
- **Rouge non causé par ce lot** : `test_discover_fresh_jobs_4430.py`, 2 tests. Ils sont rouges aussi sans ce lot
  (vérifié en mettant le code de côté).

## À trancher par Louis

1. **Plafond de 30 recherches de personnes par espace et par jour.** C'est un réglage neuf
   (`_TALENT_PEOPLE_MAX_PER_SPACE_DAY`), sur le même compteur que les offres fraîches (qui sont à 60). Aucun plafond
   de personnes n'existait côté IA ; le chiffre est à confirmer.
2. **Noms masqués en production.** Le niveau de recherche gratuit masque le nom de famille (« Inès D. ») et ne donne
   pas d'adresse. Le mail est donc préparé sans destinataire e-mail. Révéler l'adresse passerait par l'enrichissement
   payant : ce n'est pas fait ici.
3. **Droits.** L'IA n'a pas de miroir des permissions de rôle. La porte est l'espace actif re-prouvé, comme pour la
   collecte fraîche. `records:write` reste sur le geste qui crée les contacts (l'analyse, `analysis:run`).
4. **Mail par gabarit.** Le mail est bâti par un gabarit déterministe (aucun appel au modèle, aucune latence en plus),
   pas par la rédaction de `prepare_message_for_contact`, qui exige un contact de l'espace.
