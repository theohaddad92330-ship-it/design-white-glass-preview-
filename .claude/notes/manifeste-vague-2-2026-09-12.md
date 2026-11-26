# Manifeste — vague 2 (pendant l'intégration et la recette du lot 1)

Base de tous les écrivains : `origin/main` = `4f1b68371`. Le lot 1 (PR #1974) n'est PAS mergé : aucun écrivain ne touche
`apps/web/src/features/chat/view/Chat.tsx`, `ReplyFooter.tsx`, `ShareConversation.tsx`, `scope/**`, `laura-home-suggestions.ts`,
`lib/laura-opener.ts`, `components/sidebar/**`, `routes/chat/**`, `apps/ia/app/services/secret_redaction.py`, ni le changelog.

| # | Lot | Périmètre | Interdits | Dépend de | Branche | Modèle | État |
| - | --- | --------- | --------- | --------- | ------- | ------ | ---- |
| 2a | Pièces jointes « fil seul » — serveur | migration additive `rag_documents` (plage **1792800000000–1792800009999**), module RAG API, ingestion/récupération RAG IA, client web `features/rag/api*` + hook | `Chat.tsx`, `/knowledge` UI, changelog | Q1 (documents existants) → défaut : inchangés | `feat/laura-pj-fil-seul-serveur` | sonnet | lancé |
| 3a | Mémoire — nature au prompt | `chat-context.service.ts` (faits → prompt), modèles/format mémoire IA (`bellum_advisor.py` `_format_memory`, `_BLOCK_MARKET_MEMORY` rang 1), éventuellement libellé « note de Laura » dans `features/memory/**` | portée perso (attend Q2), migration, `Chat.tsx`, changelog | — | `feat/laura-memoire-nature` | sonnet | lancé |
| 5a | Langue de l'interface + phrases interdites | `laura-turn.ts` (locale), DTO/pass-through `ia-proxy`, `ChatRequest` IA, `bellum_advisor.py` (langue, `_BLOCK_LAURA`), `style.py`, module unique des phrases interdites + `bellum_messages.py`/`bellum_outreach.py`/`linkedin_posts`/`activity`/`icebreaker` | `_format_memory` et bloc mémoire (3a), `Chat.tsx`, changelog | — | `feat/laura-langue-interface` | sonnet | lancé |
| P4 | Plan de migration des actions du chat vers Action OS | lecture seule | toute écriture, tout git | — | — | opus | lancé |

Points du registre visés : 2a → 1954.7, .9, .11, .12, .20 (serveur), .29 ; 3a → 1962.1, .8, .17, .18, .24, .25, .27, 1917.8, 1905.1 ;
5a → 1958.8, .9, 1922.15, .17, .18, .19, 1926.21, .25, 1929.6, 1920.12.

Conflits attendus à la fusion : `bellum_advisor.py` (3a / 5a, blocs différents), `chat.json` (clés différentes), éventuel schéma
`packages/contracts` (2a ingestion / 5a requête de chat — fichiers différents).
