# Registre — lot LAURA-FIABILITE (vague L, 27/10/2026)

Constat : les quatre points sont DÉJÀ sur `origin/main` (8b6d99fc). Aucun code neuf écrit : réécrire serait doubler.
Appelants relus à la main ; les specs n'ont pas pu être lancées dans cette VM (pas de pytest installé, `@bellum/contracts` non construit pour vitest) — preuve de chaîne = lecture, preuve d'exécution = CI.

| Point | État | Appelant / preuve (code) | Preuve en recette |
| --- | --- | --- | --- |
| #4631.1 nombre annoncé = lignes rendues (même prédicat) | déjà là | commit 2278b1d6 ; `apps/ia/tests/test_4631_annonce_liste.py`, `test_4421_annonce_une_ligne.py` | /chat « trouve-moi des missions » : le nombre dit en prose = nombre de lignes de la carte ; liste vide ⇒ le message le dit |
| #4631.2 bandeau de zone recompté | déjà là | commit 97705d87 (`Discover.listeUnique.test.tsx`) | /discover : bandeau = lignes visibles |
| #4611 état du travail lancé | déjà là | outil `get_work_status` : déclaré `chat_tools.py:10661`, dispatché `:22237` → `bellum_api.work_status`, carte `chat_read_tool_card_coverage.py:280`, droits `rights_matrix.py:293`, démo `demo-work-status-coverage.spec.ts` | /chat « où en sont mes analyses ? » : carte mesurée, un lot en erreur nommé avec sa raison, jamais « 0 » pour non mesuré |
| #4594 puces coupées | déjà là | `useFittedChipCount` `fit-suggestion-chips.ts:30` ← appelé `Chat.tsx:4611` ; test `fit-suggestion-chips.test.tsx` | /chat à 1485 px et 390 px : aucune puce tranchée, « Voir tout » atteignable |
| #4563 offres <compétence> sur <ville> | déjà là (chaîne lue) | `search_job_offers` : liste `chat_tools.py:11127`, dispatch `:23772` → `job_offers_search.execute_search_job_offers`, droits `rights_matrix.py:631`, libellé `chat_step_labels.py:112`, carte `file_export` (`chat_read_tool_card_coverage.py:316`) ; cascade/palier : commit 566600a0 ; `test_laura_offres_4563.py` | /chat sans consultant : « trouve moi des offres vue et java sur lille » ⇒ liste d'offres (intitulé, employeur, date, lieu, lien), palier dit, aucun fournisseur nommé |

Réserve (recommandation, non bloquante) : #4563 rend les offres via une carte `file_export` instruite par le modèle (`_model_reasoning`), pas une carte déterministe. Si la recette dit encore FAIL, le maillon à durcir est ce rendu, pas l'outil.
