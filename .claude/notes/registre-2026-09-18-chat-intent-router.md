base : 6ea2f13b1 — 21/09/2026 (réconcilié depuis 93f7a4044, 18/09/2026) ‖ réconcilié contre 7d11787d9be5e0e7f17102e0ffcd5b39bfb5a379 — 22/09/2026 (R2, +298 commits) : 0 flip. Piste vérifiée et écartée — #2449 « les quatre niveaux d'action du copilote » (`copilot-action-level.ts`, `action-router.service.ts`, branche feat/les-quatre-niveaux-daction-21-09, mergée) répond à un AUTRE axe (jusqu'où le copilote est mandaté à ÉCRIRE), pas à la reconnaissance d'intention Need/Talent/Mission/Submission de ce ticket ; aucun outil de `chat_tools.py`/`action-router`/`action-os` ne crée de Submission ni ne déclenche un Reverse Market complet depuis le chat

# Registre — #2321 LAU-FINAL-062 — intent router opportunity / need / talent / mission

Mesure faite par `git grep` contre `origin/main` (sha ci-dessus). État `écarté` interdit —
tout point qui heurte la doctrine reste `retenu` et part en question (voir rapport de l'agent).
Mesure de référence : `apps/ia/app/services/chat_tools.py` déclare 60 outils. Ceux qui touchent
CE ticket : `find_accounts`/`run_account_search` (intention 1), `search_talents` (intention 4),
`run_matching` (intention 5), `list_accounts_to_act` (intention 10), `get_import_overview`
(intention 9, partiel). Aucun outil ne crée/enrichit un Need depuis un brief (intention 3),
ne propose une shortlist (intention 6), ne met à jour un Submission (intention 7), ni ne
déclenche un Reverse Market (intention 4/NO-GO) — alors que `ReverseMarketService` existe côté
API (`apps/api/src/modules/consultants/matching/reverse-market.service.ts`), juste pas exposé
au chat.

## #2321 — LAU-FINAL-062 — intent router opportunity / need / talent / mission

| numéro | demande en huit mots | sujet | mesure | état | preuve |
|---|---|---|---|---|---|
| 2321.1 | Reconnaître l'intention « je cherche du business » | intention 1 | find_accounts / run_account_search (chat_tools.py) | déjà là | apps/ia/app/services/chat_tools.py:454,551 ‖ 22/09 (lot CHAT-1, b30fcddb6) : le routeur ROUTE désormais l'intention explicitement — apps/ia/app/services/compilers/intent_router.py:198 → find_accounts/run_account_search ; appelant apps/ia/app/routers/chat.py:473 (route_chat_intent au build du contrat #2257) + apps/ia/app/routers/chat.py:641 (bloc de prompt) |
| 2321.2 | Reconnaître l'intention « j'ai une information client » | intention 2 | git grep signal/piste qualifier scope chat_tools.py | recetté | ‖ RECETTÉ par le CODE au sha SERVI 8009cf678 (22/09 soir, vérificateur) : code + appelant (outil /chat enregistré) + test — verdicts-2300 |
| 2321.3 | Reconnaître l'intention « j'ai un besoin » | intention 3 | find_needs (recherche seulement, pas création) | recetté | ‖ RECETTÉ par le CODE au sha SERVI 8009cf678 (22/09 soir, vérificateur) : code + appelant (outil /chat enregistré) + test — verdicts-2300 |
| 2321.4 | Reconnaître l'intention « j'ai un profil » | intention 4 | search_talents ; ReverseMarketService non exposé au chat | recetté | ‖ RECETTÉ par le CODE au sha SERVI 8009cf678 (22/09 soir, vérificateur) : code + appelant (outil /chat enregistré) + test — verdicts-2300 |
| 2321.5 | Reconnaître l'intention « je veux matcher » | intention 5 | run_matching | déjà là | apps/ia/app/services/chat_tools.py:1094 ‖ 22/09 (lot CHAT-1, b30fcddb6) : le routeur ROUTE l'intention — apps/ia/app/services/compilers/intent_router.py:293 → run_matching ; appelant apps/ia/app/routers/chat.py:473 (route_chat_intent au build du contrat #2257) + apps/ia/app/routers/chat.py:641 (bloc de prompt) |
| 2321.6 | Reconnaître l'intention « je veux proposer » (shortlist/push) | intention 6 | run_matching → carte `consultant_shortlist` | déjà là | apps/ia/app/services/chat_tools.py:1195 (`run_matching`) + apps/ia/app/models/reply_blocks.py:47,232 et apps/ia/app/prompts/reply_formats.py:43 (bloc `consultant_shortlist` : items, fit, gaps, availability) — la SHORTLIST se propose déjà en /chat ; nuance : le « push » (soumission au client, Submission) reste absent (cf. 2321.7) ‖ 21/09 : balayage 6ea2f13b1, la recherche du 18/09 portait sur chat_tools.py seul et a manqué reply_blocks.py ‖ 22/09 (lot CHAT-1, b30fcddb6) : le routeur ROUTE l'intention — apps/ia/app/services/compilers/intent_router.py:312 → run_matching (carte consultant_shortlist) ; appelant apps/ia/app/routers/chat.py:473 (route_chat_intent au build du contrat #2257) + apps/ia/app/routers/chat.py:641 (bloc de prompt) |
| 2321.7 | Reconnaître l'intention « j'ai un retour » (submission) | intention 7 | git grep submission update scope chat_tools.py | recetté | ‖ RECETTÉ par le CODE au sha SERVI 8009cf678 (22/09 soir, vérificateur) : code + appelant (outil /chat enregistré) + test — verdicts-2300 |
| 2321.8 | Reconnaître l'intention « c'est signé » (vérif + Mission) | intention 8 | search_missions / propose_mission_proof (scope différent) | recetté | ‖ RECETTÉ par le CODE au sha SERVI 8009cf678 (22/09 soir, vérificateur) : code + appelant (outil /chat enregistré) + test — verdicts-2300 |
| 2321.9 | Reconnaître l'intention « j'importe mon existant » (multi-objets) | intention 9 | get_import_overview (vue seulement) | recetté | ‖ RECETTÉ par le CODE au sha SERVI 8009cf678 (22/09 soir, vérificateur) : code + appelant (outil /chat enregistré) + test — verdicts-2300 |
| 2321.10 | Reconnaître l'intention « je ne sais pas quoi faire » (diagnostic) | intention 10 | list_accounts_to_act | déjà là | apps/ia/app/services/chat_tools.py:1228 — diagnostic/priorisation partiel (scope comptes), pas généralisé à toute la base (CV/besoins) ‖ 22/09 (lot CHAT-1, b30fcddb6) : le routeur ROUTE l'intention — apps/ia/app/services/compilers/intent_router.py:398 → list_accounts_to_act ; appelant apps/ia/app/routers/chat.py:473 (route_chat_intent au build du contrat #2257) + apps/ia/app/routers/chat.py:641 (bloc de prompt) |
| 2321.11 | Identifier le point de départ de la demande | règle de réponse | RequestIntentContract.objet_depart (produit, cf #2300.37) | déjà là | apps/ia/app/models/request_intent_contract.py:110-111 ‖ 22/09 (lot CHAT-1, b30fcddb6) : le point de départ voyage maintenant dans la route (`starting_point`), toujours pris sur le compte ACTIF déjà résolu, jamais extrait du message — apps/ia/app/services/compilers/intent_router.py:569 |
| 2321.12 | Identifier le résultat attendu de la demande | règle de réponse | RequestIntentContract.resultat_attendu (NON PRODUIT) | recetté | ‖ RECETTÉ par le CODE au sha SERVI 8009cf678 (22/09 soir, vérificateur) : code + appelant (outil /chat enregistré) + test — verdicts-2300 |
| 2321.13 | Identifier l'objet canonique concerné (Need/Talent/Mission/Submission) | règle de réponse | ThreadObject.OBJECT_KINDS + cited_objects | déjà là | apps/ia/app/services/chat_thread_state.py:123 (`OBJECT_KINDS = ("account", "contact", "consultant", "need", "mission")`) + lignes 484-503 (`cited_objects` range les sorties d'outil sous le bon kind) ; nuance : « consultant » tient lieu de Talent, aucun kind `submission` n'existe ‖ 21/09 : balayage 6ea2f13b1 ‖ 22/09 (lot CHAT-1, b30fcddb6) : l'objet canonique est porté par la route (`canonical_object`) — apps/ia/app/services/compilers/intent_router.py:78. `submission` AJOUTÉ au vocabulaire (il manquait, cf. mesure du 18/09), en fin de liste (GA-08) ; les cinq autres sont EXACTEMENT OBJECT_KINDS de chat_thread_state.py, pas un second vocabulaire (GA-26) |
| 2321.14 | Identifier les données déjà présentes pour la demande | règle de réponse | recoupe #2301 (prélecture), majoritairement absent | recetté | ‖ RECETTÉ par le CODE au sha SERVI 8009cf678 (22/09 soir, vérificateur) : code + appelant (outil /chat enregistré) + test — verdicts-2300 |
| 2321.15 | Identifier ce qu'elle peut produire immédiatement | règle de réponse | ask_clarification (règle du prompt) | déjà là | apps/ia/app/services/chat_tools.py:1392 (`ASK_CLARIFICATION_TOOL` — « N'utilise cet outil que si tu ne peux RIEN faire d'utile sans la réponse : quand une partie de la demande est claire, traite-la et signale ce qui reste flou. ») ‖ 21/09 : balayage 6ea2f13b1 ‖ 22/09 (lot CHAT-1, b30fcddb6) : `produces_now` sur la route — et une route SANS outil ne prétend rien produire (produces_now=() quand tools=()) ; apps/ia/app/services/compilers/intent_router.py:569 |
| 2321.16 | Identifier ce qui attend une validation | règle de réponse | PendingActions.tsx (mécanisme générique de validation) | déjà là | apps/web/src/features/chat/view/PendingActions.tsx ‖ 22/09 (lot CHAT-1, b30fcddb6) : `awaits_validation` + `awaits_human` sur la route — apps/ia/app/services/compilers/intent_router.py:123. awaits_human est le champ que lit un appelant pour savoir s'il a le droit d'agir seul ; il est VRAI par défaut sur une intention non déclarée (jumeau d'UNDECLARED_INTENT_SITE, action-os.ts:232) |
| 2321.17 | Ne jamais répondre en citant le nom d'une page (« Va dans Vivier ») | règle de réponse : no-go nommage page | bellum_advisor.py:860 (règle inverse partielle) | recetté | ‖ RECETTÉ par le CODE au sha SERVI 8009cf678 (22/09 soir, vérificateur) : code + appelant (outil /chat enregistré) + test — verdicts-2300 |
| 2321.18 | Construire un job séquencé pour une demande multi-intentions | multi-intentions | ThreadState.current_job/current_step/next_step (infra générique) | recetté | ‖ RECETTÉ par le CODE au sha SERVI 8009cf678 (22/09 soir, vérificateur) : code + appelant (outil /chat enregistré) + test — verdicts-2300 |
| 2321.19 | Ne jamais sauter directement à l'étape finale (ex. email) sans les étapes intermédiaires | multi-intentions : no-go saut d'étape | doctrine « le copilote prépare, ne relance jamais » ; pas de gate spécifique | recetté | ‖ RECETTÉ par le CODE au sha SERVI 8009cf678 (22/09 soir, vérificateur) : code + appelant (outil /chat enregistré) + test — verdicts-2300 |
| 2321.20 | Poser une hypothèse raisonnable et produire un premier résultat en cas d'ambiguïté | ambiguïté | ask_clarification (#1903.22) | déjà là | apps/ia/app/services/chat_tools.py:1392,1403-1410 (#1903.22 — « ta seule clarification… ne se dépense QUE sur le critère qui bloque vraiment l'ouverture de l'écran… un critère modifiable une fois l'écran ouvert ne la consomme jamais — ouvre l'écran avec ce que tu as ») — traiter le clair, ouvrir avec une hypothèse sur le reste ‖ 21/09 : balayage 6ea2f13b1 ‖ 22/09 (lot CHAT-1, b30fcddb6) : la route porte `confidence`='hypothese' + `reasoning` (le MARQUEUR DÉCLARÉ qui a déclenché, jamais un extrait du message), et le bloc l'annonce COMME une hypothèse avec son motif consultable (apps/ia/app/prompts/intent_route.py:139) — condition de l'arbitrage Louis 18/09 |
| 2321.21 | Ne jamais poser une série de questions avant de produire un premier résultat | ambiguïté : no-go sur-questionnement | ask_clarification (garde « une seule fois ») | déjà là | apps/ia/app/services/chat_tools.py:1392-1394 (« Demande UNE précision… et une seule fois dans la conversation. Propose 2 ou 3 options concrètes et cliquables, jamais une question ouverte ») ‖ 21/09 : balayage 6ea2f13b1 ‖ 22/09 (lot CHAT-1, b30fcddb6) : le routeur ne pose AUCUNE question : sur une égalité de marqueurs il tranche et produit, en se déclarant `hypothese` (apps/ia/app/services/compilers/intent_router.py:569). Aucun tour de clarification n'est ajouté par ce lot |
| 2321.22 | Router « à qui vendre ce consultant ? » vers un Reverse Market complet, pas un simple matching | NO-GO (explicite de l'issue) | deep-link `/consultants/:id/reverse-market` disponible via propose_guided_action | recetté | ‖ RECETTÉ par le CODE au sha SERVI 8009cf678 (22/09 soir, vérificateur) : code + appelant (outil /chat enregistré) + test — verdicts-2300 |

## 22/09/2026 — lot CHAT-1 (branche `feat/chat-intent-router-22-09`)

Le routeur d'intention n'existait pas : `chat_tools.py` déclare soixante outils et RIEN ne
lisait une demande pour décider lequel appeler. Il existe maintenant, en deux exemplaires
tenus par une garde de parité — `apps/ia/app/services/compilers/intent_router.py` (exécuté
dans le tour) et `packages/contracts/src/schemas/chat-intent-router.ts` (lisible par l'API et
le web) — il est APPELÉ (`apps/ia/app/routers/chat.py:473`), il peuple quatre des dix-huit
champs du contrat #2257 qui n'avaient aucun producteur, et il CHANGE le comportement du
modèle (`apps/ia/app/prompts/intent_route.py`, FR et EN).

**Ce qui est livré, et ce qui ne l'est pas.** Les dix intentions sont RECONNUES — c'est la
demande littérale des points .1 à .10. Cinq d'entre elles n'ont pas encore la capacité
d'AGIR, et le routeur le dit au lieu de l'inventer : `capability_gap` nommé, catégorie
`capacite_absente` (qui existe déjà, avec son écran back-office), et une consigne au modèle
de signaler par `note_unrouted_request` plutôt que de promettre. Les cinq manques nommés,
qui sont la liste de courses des autres lots de compilateurs :
`qualification_d_un_signal_libre`, `creation_d_un_besoin_depuis_un_brief`,
`creation_d_un_talent_depuis_un_cv`, `mise_a_jour_d_une_soumission`,
`creation_d_une_mission_apres_accord`, `plan_d_import_multi_objets`.

**Démo.** Ce lot n'ajoute AUCUNE table et AUCUNE clé de `raw_analysis` : la route est
calculée à chaque tour et n'est stockée nulle part. Il n'y a donc rien à semer, et
`demo-coverage.ts` n'a pas à être touché — la salle de démonstration exécute le même
`chat.py`, donc le même routeur, sur ses propres comptes.

**⚠️ Question ouverte pour Louis, inchangée (point .17).** `bellum_advisor.py:860` AUTORISE
de nommer un écran stable tant que l'action réelle passe par un outil. Ce lot suit l'ESPRIT
du NO-GO (jamais un nom SANS action réelle) et n'a pas touché cette règle. Si le NO-GO doit
interdire TOUTE citation de page, c'est là-bas qu'il faut trancher.
