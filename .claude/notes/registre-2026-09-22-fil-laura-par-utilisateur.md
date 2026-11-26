# Registre — #2703 : le fil de Laura par utilisateur (22/09/2026)

base : d57706d7a (origin/main) — 22/09/2026
branche : `fix/fil-laura-par-utilisateur-22-09`

**Le contrat (décision Louis, 22/09/2026)** : le fil PAR DÉFAUT devient privé par
utilisateur ; une conversation NOMMÉE reste partagée par l'espace.

| # | la demande en huit mots | écran/sujet | ce que j'ai mesuré au code | état | preuve en recette |
| --- | --- | --- | --- | --- | --- |
| #2703.1 | le fil par défaut appartient à son auteur | /chat | `threadWhere` filtrait `workspace_id`+`account_id`+`conversation_id`, jamais `user_id` (`chat-messages.service.ts:1004`) ; `user_id` est déjà écrit par `create` sur les deux rôles | recetté | ‖ RECETTÉ par le CODE au sha SERVI 03e7f1332 (22/09 soir, vérificateur) : code + appelant + test — verdicts-v15 |
| #2703.2 | une conversation nommée reste partagée | /chat | branche `if (conversationId)` de `threadWhere` inchangée, prouvée par test | recetté | ‖ RECETTÉ par le CODE au sha SERVI 03e7f1332 (22/09 soir, vérificateur) : code + appelant + test — verdicts-v15 |
| #2703.3 | la liste des fils ne montre plus le brouillon du voisin | /chat colonne gauche | `threadsBaseQuery` ne filtrait que `workspace_id` + `role='user'` | recetté | ‖ RECETTÉ par le CODE au sha SERVI 03e7f1332 (22/09 soir, vérificateur) : code + appelant + test — verdicts-v15 |
| #2703.4 | le titre d'un fil par défaut est celui de son auteur | /chat | `threadKey()` rendait `a:<compte>` pour tout l'espace → un titre pour deux fils privés | recetté | ‖ RECETTÉ par le CODE au sha SERVI 03e7f1332 (22/09 soir, vérificateur) : code + appelant + test — verdicts-v15 |
| #2703.5 | archiver/supprimer/dupliquer/exporter suivent la même clé | /chat | `setThreadArchived`, `deleteThread`, `duplicateThread`, `threadAuthor`, `threadExists`, `exchangeCounts`, `threadOpening`, `isThreadArchived`, `ChatThreadExportService.build` | recetté | ‖ RECETTÉ par le CODE au sha SERVI 03e7f1332 (22/09 soir, vérificateur) : code + appelant + test — verdicts-v15 |
| #2703.6 | le temps réel ne rediffuse pas un fil privé | /chat | aucune passerelle Socket.IO ne porte le chat : la réponse part en SSE sur la réponse HTTP de l'appelant (`ia-proxy.controller.ts`, en-têtes `text/event-stream`) | déjà là | CODE (relevé) |
| #2703.7 | le contexte envoyé au modèle suit la portée | Laura | `getConversationSummary` et `getConversationThreadState` sont déjà bornés par `userId` (D65, #1927.10) ; aucun corps de message du fil ne part au modèle depuis l'API | déjà là | CODE (relevé) |
| #2703.8 | chaque message d'une conversation partagée dit qui parle | /chat | `author` servi par `listThread` (#1940.4) ET rendu : `Chat.tsx:2689` → `MessageAuthor`, clé `messages.authorLabel` présente en FR **et** EN ‖ déjà là, rien à coder | déjà là | ÉCRAN bulle d'un collègue dans une conversation nommée |
| #2703.9 | les crédits restent comptés par personne | plafond | `measureUserMessagesSince(userId)` et `userMessageStampsSince(userId)` étaient déjà par personne ; rien d'agrégé entre espaces (GA-43 intacte) | déjà là | CODE (relevé) |
| #2703.10 | l'existant : qui récupère les fils déjà en base | migration | `chat_messages.user_id` porte l'auteur de CHAQUE ligne depuis l'origine : aucune migration, aucune ligne touchée, chacun retrouve les siennes | déjà là | CODE (relevé) |
| #2703.11 | parité démo | salle de démo | `chat_messages` « vide à dessein », la salle ne peut PAS avoir deux membres (FK dure vers `auth.users`) ‖ raison ÉTENDUE avec #2703, la preuve du cloisonnement vit au test | recetté | ‖ RECETTÉ par le CODE au sha SERVI 03e7f1332 (22/09 soir, vérificateur) : code + appelant + test — verdicts-v15 |

## Ce que la lecture a trouvé à côté (hors périmètre, non corrigé)

- `apps/ia/app/services/conversation_service.py:44` (`save_turn`, appelé deux fois par tour
  depuis `chat.py:775-776`) écrit dans `chat_messages` **sans `workspace_id` ni
  `conversation_id`**. Ces lignes sont INVISIBLES à toutes les lectures de l'API (qui
  exigent `workspace_id`), mais elles portent `user_id` et `role='user'` : elles sont donc
  comptées par le plafond quotidien (`measureUserMessagesSince`, qui filtre `user_id` seul).
  Un tour coûterait deux messages au plafond au lieu d'un. Non mesuré en production, non
  corrigé ici — c'est un point à part, pas #2703.
- `analysis.gateway.ts:85` fait `client.join(accountId)` sans vérifier l'espace du
  demandeur : c'est le terrain de #2704, pas celui-ci.
