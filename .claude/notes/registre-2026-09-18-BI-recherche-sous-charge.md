# Registre — lot BI, recherche sous charge et provenance (18/09/2026)

base : ad014503dd33f9610747a729229eb2dfac465d35 — 18/09/2026

| numéro | demande en huit mots | sujet | mesure | état | preuve |
| --- | --- | --- | --- | --- | --- |
 | 2535.2 | répéter la raison que le serveur donne déjà | web:discover | chaîne vérifiée à l'appelant le 18/09 par le fil principal | déjà là | `DiscoverStates.tsx:234` (appelant) ; `ia-proxy.controller.ts:888` ; clés FR+EN présentes ‖ SERVI EN PROD 18/09 (API `08bfa42a8`, tête de `main`) — passé de `livré` à `déjà là`. | ‖ ⚠️ Recette prod 18/09 (7e769e0ca) — NON VÉRIFIABLE EN RECETTE : une requête absurde déclenche la validation métier (« Je n'ai reconnu ni un lieu, ni un secteur… »), pas l'échec serveur visé (délai dépassé / service indisponible). Provoquer une vraie panne backend sort de la lecture seule. Le point reste livré sur preuve de code ; sa preuve ÉCRAN n'existe pas.
| 2535.1 | recherche coupée à 45 s quand une analyse tourne | api:ia http | dispatcher undici unique tracé de `IaClient.discoverRegistry` à `tryFetch`, LONG_CALL_DISPATCHER partagé avec l'analyse de fond | déjà là | `packages/http/src/client.ts:392` (appelant, dispatcher choisi) ; `apps/api/src/modules/ia/ia.client.ts:1033` (discoverRegistry, interactive: true) ; `apps/api/src/modules/analysis/analysis.worker.ts:507` (concurrency: 3, même processus Node) ‖ trace `#2535.1` en code de production sur origin/main — balayage du 18/09/2026 |
| 2536.1 | clarification répondue relance une autre clarification | ia:chat | prompt système tracé à l'appelant réel, tests rejoués sur ce sha | déjà là | `apps/ia/app/routers/chat.py:592` (appelant, `clarification_spent_block`) ; `apps/ia/app/prompts/thread_state.py:53` ; `apps/ia/tests/test_chat_clarification_not_reasked.py` (38 tests verts, `/tmp/venv13`) ‖ trace `#2536.1` en code de production sur origin/main — balayage du 18/09/2026 |
| 2547.1 | compte proposé sans signal daté ni source | ia:chat | chaîne tracée de `run_account_search` à `cited_sources`, tests rejoués sur ce sha | déjà là | AUDIT des clôtures 24/09 nuit sur main 16dbc3ae2e — commit dca9fa3f6e, chat_tools.py:5374-5470 + run_account_search :5599 |

## Ce que TU dois vérifier avant de croire ce tableau

Les lignes 2536.1 et 2547.1 étaient déjà livrées par le commit `027f6bea9`
(« fix(ia,web): Laura cite ses signaux et ne reboucle plus sur une
clarification », 17/09/2026 21:41, ancêtre de `origin/main`) — landé APRÈS la
recette du soir citée par le brief, et cite lui-même #2536.1 et #2547.1 par
numéro dans son propre message de commit. Vérifié : `git merge-base
--is-ancestor 027f6bea9 ad014503d` → oui. 38 tests rejoués sur `/tmp/venv13`
(pytest) : tous verts.

Seule 2535.1 a reçu du CODE NEUF dans ce lot (voir rapport de l'agent).
