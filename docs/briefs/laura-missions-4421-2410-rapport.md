# Rapport — lot LAURA-MISSIONS (#4421, 24/10)

Branche `claude/laura-missions-2410`, base `origin/main` (af76f469ce). Sans PR. Une grande partie de #4421
était déjà sur main (lots du 21-23/10 : c124, ligne d'annonce, volume par paliers, contacts, « Préparer le
mail »). Ce lot traite ce que la mesure prod du 24/10 a montré (« mission à Lille » + CV → aucun compte).

Causes trouvées dans le code :

- la consigne #AM.58 du CV joint ne parlait que d'importer le CV au vivier, d'où « pas encore importé,
  aucune mission ne peut être qualifiée » ;
- le moteur de Découvrir écartait les offres hors des métiers de l'ESN (`outsideTrade`) : une offre de
  formateur IA sortait avant même d'être comparée aux compétences du consultant ;
- Laura n'avait que les sources gratuites, jamais la collecte fraîche (`spaceKey`).

## Points

| #   | État     | Ce qui a été fait / raison                                                                                                                                                                                                                                                                                              | Test                                                                |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | conforme | Déjà sur main (dad943b549, ligne d'annonce posée par le code). Rien à changer.                                                                                                                                                                                                                                          | `test_4421_annonce_une_ligne.py`                                    |
| 2   | conforme | Consigne « CV JOINT ET MISSIONS » : le CV part vers `find_accounts_for_talent` (compétences en termes d'offre), la zone dite dans le message prime, l'import n'est jamais un préalable.                                                                                                                                 | `test_4421_2410_cv_joint.py` (rouge → vert)                         |
| 3   | conforme | Déjà sur main (7057ccfc47, a0675d706a : volume demandé, besoins et contacts jusqu'à 10).                                                                                                                                                                                                                                | `test_4421_volume_missions.py`                                      |
| 4   | conforme | Pour placer un consultant, le tri métier de l'ESN est levé (`recruitsForClients`), son pack d'offres reste : toute offre qui cite sa compétence compte (freelance, CDI, recrutement). La consigne de l'outil interdit « aucune mission freelance ».                                                                     | `test_4421_2410_missions_fraiches.py::…cdi_et_recrutement…`         |
| 5   | conforme | Déjà sur main (25f15e0010, un bouton par contact qui ouvre `prepare_message_for_contact`). Aucun envoi.                                                                                                                                                                                                                 | `test_4421_3_comptes_qui_recrutent.py`                              |
| 6   | conforme | `find_accounts_for_talent` lit en parallèle le matching inverse et rend `workspace_needs` (recommandés puis limites, 10 au plus). S'il n'y a rien, si le pont est muet ou s'il y a un délai, aucune ligne n'apparaît et le marché est rendu.                                                                            | `test_4421_6_besoins_ouverts_en_plus.py` (rouge → vert)             |
| 7   | conforme | c124 était déjà dans le registre et dans `doctrine.md`. Précisé au 24/10 (CV joint, besoins en plus).                                                                                                                                                                                                                   | `doctrine-registry.test.ts` (35 verts)                              |
| 8   | conforme | Quand les paliers gratuits ne tiennent pas le volume, Laura lance seule la même collecte que Découvrir (`discover_registry` + `spaceKey`, plafonds de `fresh_jobs`), sans afficher de crédits. La collecte est bornée au reste d'un budget d'offres de 45 s (entre 8 et 20 s), pour tenir le tour de 90 s. c125 étendu. | `test_4421_2410_missions_fraiches.py` (5 tests)                     |
| 9   | conforme | Déjà sur main (dad943b549).                                                                                                                                                                                                                                                                                             | `test_4421_annonce_une_ligne.py`                                    |
| 10  | partiel  | Compte et offre datée : oui (points 2, 4 et 8). Le contact et le message prêt n'existent que si le compte est déjà dans l'espace. Sinon, Laura lance l'analyse et les contacts arrivent avec elle, quelques minutes plus tard, pas dans la même réponse.                                                                | `test_4421_2410_cv_joint.py`, `test_4421_2410_missions_fraiches.py` |
| 11  | conforme | Éval de périmètre (porte c77) : 2 scénarios ajoutés, le cas du CV du 24/10 et son cas limite « fiche sans compétence ». Plus un cas promptfoo (compétences du CV + Lille, sans question).                                                                                                                               | `test_copilote_scope_eval.py` (260 + 21 scénarios)                  |
| 12  | conforme | `skills_missing` donne UNE question (les compétences ou le CV), au lieu d'une simple consigne. Introuvable et homonymes : inchangés.                                                                                                                                                                                    | `test_4421_12_fiche_sans_competence.py` (rouge → vert)              |
| 13  | bloqué   | La démo « missions pour ce profil » (Camille Roussel) affiche bien les comptes et l'annonce, mais « Aucun contact connu ». Pour y mettre des contacts et un message préparé, il faut modifier `apps/web/src/features/demo/demo-chat-script.ts`, qui est HORS du périmètre du brief.                                     | —                                                                   |

Droits : aucun droit nouveau. Une analyse lancée seule par Laura passe par la porte `analysis:run` du pont ; un refus
est nommé et rien n'est annoncé comme « lancé » (`test_4421_2410_missions_fraiches.py::…droits…`). La collecte
fraîche suit les plafonds par espace et par jour, comme Découvrir.

Changelog FR + EN : `2026-10-24-laura-missions-cv-joint`.

## Tests lancés (ciblés)

- pytest : les nouveaux fichiers ci-dessus, plus `test_chat_find_accounts_for_talent`, `test_4421_*`,
  `test_am57_*`, `test_copilote_scope_eval`, `test_prompt_golden`, `test_prompt_fingerprint`, `test_laura_acts`.
  Tous verts.
- Un passage plus large (168 fichiers liés) : 4177 verts, 1 rouge, `test_discover_dataforge_candidates::…unconfigured_bridge…`.
  Ce test est rouge aussi sur `origin/main` sans ce lot (budget de temps de discover-signals), donc il n'est pas
  causé par ce lot.
- vitest contracts : `doctrine-registry.test.ts`, `changelog`. Tous verts.
- Les golden de prompts n'ont pas changé : le prompt système est intact, seules des descriptions d'outil ont bougé.

## Hors périmètre touché, à signaler

- `apps/ia/app/services/compilers/talent_accounts.py` : seule la phrase `skills_missing` a changé (point 12).
  Ce fichier est le compilateur de l'outil du lot, mais il ne figure pas littéralement dans la liste du périmètre.

## À trancher par Louis

1. **Point 13** : autoriser l'édition de `apps/web/src/features/demo/demo-chat-script.ts`, pour que la démo montre
   des contacts et un mail préparé (il faudrait des comptes de démo semés avec leurs contacts).
2. **Point 10** : pour un compte absent de l'espace, le « message prêt » arrive avec l'analyse, quelques minutes plus
   tard. Faut-il une recherche de personnes externe (`propose_people_search`) dans le même tour, au prix d'un temps de
   réponse plus long ?
3. Le moteur de Découvrir n'a pas été modifié : la recherche par compétence n'interroge toujours que les 2
   premières compétences (`SKILL_MAX_TERMS`). Aucune signature n'a manqué.
