# Registre — épopée #4288 (vague L, 27/10/2026)

Preuve = lecture de la chaîne route → écran → composant → service (`git grep`). Aucun test exécuté dans ce
lot : `@bellum/contracts` non construit (vitest web) et pytest absent (IA) dans la VM cloud — la CI tranche.

| # | Origine | État | Verdict | Appelant (fichier:ligne) | Geste qui le prouve en production |
| --- | --- | --- | --- | --- | --- |
| #4288.1 | #3905.5 | déjà là | câblé | `chat_orchestrator.py:1543` (`forced_first_step`), `:2486` (`tools_for_round`, web retiré tant que espace+API non tentés), `routers/chat.py:1792` (`announce_order`), `chat_tools.py:16482` (`tag_origin`) | « trouve-moi des comptes dans l'industrie » → 1er outil = comptes de l'espace, pas de `web_search` au round 0, une ligne annonce l'ordre |
| #4288.2 | #3905.6 | déjà là | câblé | idem + `compilers/intent_router.py:1240` (`asks_to_find_accounts_in_a_sector`) | même geste : aucune recherche web avant les comptes de l'espace |
| #4288.3 | #3905.7 | reformulé | câblé par morceaux, jamais recetté de bout en bout | cascade ci-dessus → `run_account_search` → carte `account_ranking` (`chat_read_tool_card_coverage.py:114`) → `ReplyBlockView.tsx:34` → `AccountRankingCard.tsx` | espace neuf : une phrase → carte de comptes → cocher → Analyser |
| #4288.4 | #4065.8 | déjà là | câblé | `chat_orchestrator.py:2506` (`_forced_closed_records_kwargs` force `list_records`), `record_listing.py:1275` (`_fetch_crm_deals`), `bellum_api.py:894` → `copilot-crm-deals.controller.ts:50` (route `internal/copilot/crm/deals`, module `copilot-bridge.module.ts:291`) | « liste mes affaires perdues en 2026 » → tableau Société/Affaire/Interlocuteur ; CRM sans lecture d'affaires → `connected:false`, dit en clair |
| #4288.5 | #4065.9 | déjà là | câblé | `record_listing.py:955-957` (`ats_records`) → `copilot-ats-records.controller.ts` → `ats.service.ts:snapshot` (`interviewedSinceDays`) | « missions terminées » → lignes ; « candidats vus en entretien » → liste, ou « La liste des candidats de l'ATS n'a pas répondu » (`record_listing.py:965`), jamais zéro |
| #4288.6 | #4269.1 | déjà là | câblé | `AccountRankingCard.tsx:157` (`onAnalyze`) → `:125` `POST /analysis-batches` source `laura` → `analysis-batches.controller.ts:23` ; CHECK SQL `laura` (migration 1796000544454) | /chat : cocher 2 comptes proposés → « Analyser la sélection » → 2 analyses dans la file |

## Décisions / réserves (ma reco, sans bloquer)
- #4288.4 RA 19/10 FAIL : cause amont = portées HubSpot (déjà corrigées, `crm-config.ts` #4065.8) ; rien à re-coder, à re-recetter.
- #4288.5 RA 19/10 PARTIAL : « source ATS non lue » est le comportement voulu quand `/candidates` ou `interviewedAt` manque (jamais « 0 »). Reco : ne rien changer ; à recetter sur un ATS qui rend la date d'entretien.
- `search_workspace_accounts` (marche 1) rend une carte `file_export`, pas `account_ranking` : pas de case « Analyser » sur les comptes DÉJÀ dans l'espace. Reco : laisser (ils sont déjà analysables depuis la liste des comptes) ; à reprendre seulement si la recette l'exige.
- Droits : aucune route, menu ni action neufs dans ce lot ; `crm:read` refuse déjà `crm_read_forbidden` (controller :48).
