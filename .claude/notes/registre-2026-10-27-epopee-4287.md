# Registre — épopée #4287 « Laura : fiabilité et cohérence des réponses » (vague L, 27/10/2026)

Verdicts par `git grep` sur origin/main 8b6d99fc. Appelant = premier maillon atteint par un geste utilisateur.
Écran de prod non rejoué depuis ce lot cloud (pas de navigateur, pas de ANTHROPIC_API_KEY) : la colonne « geste » est la preuve à jouer.

| Point | Verdict | Appelant (fichier:ligne) | Geste de recette |
| --- | --- | --- | --- |
| #4287.1 six questions | câblé | `chat_tools.py` (#4287.1) ; prompt `bellum_compare.py` ; `tests/test_4287_1_comparaison_six_questions.py` vert | /chat « compare A et B » : six questions couvertes. Adhérence du modèle vivant : non testable hors clé. |
| #4287.2 Accor/Airbus | câblé (code) | `chat_tools.py:15112` secteur lu sur le compte visé | Airbus : alternatives. Dépend de `bet_horizon` en données prod, non vérifiable ici. |
| #4287.3 compact clair/sombre | non vérifiable ici | hors périmètre (web), pas de navigateur | /chat < 768 px, bascule de thème |
| #4287.4 même famille de rendu | câblé | `routers/chat.py:1341-1342` (`derive_reply_style`, `reply_style_block`) | « Cartographie … 34 » + 2 raffinements |
| #4287.5 vide → actions suivantes | câblé | `chat_tools.py:1908` ; `known_shape_gate` importé `chat_orchestrator.py:248` | résultat vide : next_action visibles |
| #4287.6 | reformulé | décision #3762, `reply_formats.py:73` | — |
| #4287.7 textes à 390 px | non vérifiable ici | web | /chat à 390 px |
| #4287.8 expérience CV | câblé | `chat_tools.py:19885` → `talent.service.ts:288,338` | « consultants chez Sanofi » (CV d'Inès Castel semé en démo) |
| #4287.9 besoin fermé | câblé | `chat_tools.py:20230,20240` → `bellum_api.py:730` → `copilot-bridge.controller.ts:1947` | « Sanofi a-t-il eu des besoins fermés ? » (semé : `demo-dataset.ts:6050`) |
| #4287.10 | reformulé | NO-GO ratifié | — |
| #4287.11 N derniers contacts | câblé | `chat_tools.py:1102` (schéma) → `:17350,17395` → `bellum_api.py:1726` → `copilot-contacts-search.controller.ts:49` (module `copilot-bridge.module.ts:276`) → `contacts.service.ts:2501` | « relance les 2 derniers contacts » |
| #4287.12 / .13 / .15 | reformulé | décisions Louis 17/10 et 16/10 | — |
| #4287.14 N brouillons | câblé | `chat_tools.py:1813,16663,18561` ; `commercial_method_turn.py:371-396` ; `test_4287_n2…` vert | idem .11 : 2 cartes e-mail, sans question |
| #4287.16 Sanofi démo | câblé | `demo-coverage.ts:1525` (`DEMO_SANOFI_CLOSED_NEED_COVERAGE`), `seedBriefClosedNeeds` | démo : « Sanofi a-t-il eu des besoins fermés ? » |
| #4287.17 note achats groupe | non vérifiable ici | migration/portée de note : web et API hors périmètre IA | fiche groupe › Notes (R 19/10 : onglet introuvable en démo SG, à rejouer) |
| #4287.18 seau par utilisateur | câblé | `chat_orchestrator.py:2484,2892,2916` (`_ChatTurnThrottle(user_id)`), `rate_limiter.py:581` | deux membres écrivent ensemble : seaux `claude_chat@<id>` |
| #4287.19 libellé « industry » | câblé | `chat_tools.py:14288` → `_search_axes` `:15511` → `_sector_labels` `:639` | « Secteur d'activité visé : Industrie » |

Tests ciblés lancés : 5 fichiers `test_4287_*` (25 passed).
Aucun orphelin trouvé dans le périmètre IA ; aucune route ni menu ouvert, donc aucun nouveau test de refus.
