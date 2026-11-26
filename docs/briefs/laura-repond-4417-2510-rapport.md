# Rapport — LAURA-REPOND-4417 (#4417.1)

Branche : `claude/laura-repond-4417-2510` — SHA : `d55769f6` (le rapport est dans ce commit ou le suivant). Pas de PR.

## Cause réelle

`apps/ia/app/services/chat_orchestrator.py:328` `_MAX_TOOL_ROUNDS = 2` ; `chat_turn_plan.py` `plan_turn` rendait
`SIMPLE_TURN_PLAN` (2 rounds) pour « réponds au dernier mail de X ». Le chemin demande 3 appels séquentiels
(`search_mailbox` -> `read_mail_thread` -> `prepare_mail_draft`). Après 2 rounds, le tour final forcé n'offre que
`offer_reply_options` (`chat_orchestrator.py:~2870`, `_FINAL_CALL_TOOLS`) : Laura lit le fil, puis rédige DANS LE CHAT.
Ce n'est PAS la consigne ni la chaîne : la description d'outil et le prompt (`laura_role_and_voice.py:~400`) disent déjà
« `prepare_mail_draft` avec le `thread_id` » ; `thread_id` voyage jusqu'au dépôt (vérifié par lecture, hypothèse 1
écartée) : `chat_tools.py:~21870` proposal.thread_id -> `PendingActions.tsx:1213` -> `mailbox.controller.ts:146`
-> `google-mail.backend.ts:295` `createDraftInThread(..., request.threadId)`.

## Éval ROUGE avant / VERTE après

- Cas promptfoo ajouté (`evals/promptfoo/chat.yaml`, « #4417.1 … prepare_mail_draft AVEC le thread_id ») : assertion sur l'APPEL
  d'outil + `thread_id`, pas sur le texte. Sorties d'outils fictives figées (`tool_outputs`, nouveau dans `provider.py`).
  **NON EXÉCUTÉ** : pas d'`ANTHROPIC_API_KEY` dans la VM. Il juge le choix du modèle ; il ne peut pas voir le budget de
  rounds de l'orchestrateur (le fournisseur rejoue 3 rounds) — il aurait donc pu rester vert sur le défaut.
- Garde déterministe `apps/ia/tests/test_4417_reply_budget.py` (plan de tour, sans modèle) :
  AVANT : `4 failed, 4 passed` (rc=1, `plan.tool_rounds` = 2 < 3 sur les 4 formulations de réponse).
  APRÈS : `uv run python -m pytest tests/test_4417_reply_budget.py tests/test_chat_turn_plan.py tests/test_chat_reply_to_mail_4417.py` -> `78 passed`, rc=0 ;
  `tests/test_laura_acts.py` -> `27 passed`, rc=0.

## Correctif

`chat_turn_plan.py` : `is_mail_reply_request` + plan `mail_reply` à 3 rounds (`_MAIL_REPLY_TOOL_ROUNDS`). Autres demandes inchangées.
Aucun envoi, aucune route/écran/permission, `.github/workflows` intact. Aucun corps de mail réel.

## À prouver en production

Recette sur vraie boîte : « réponds au dernier mail de DHRU Khakhariya » doit rendre une carte brouillon, puis le brouillon
apparaît DANS le fil. Lancer le cas promptfoo avec clé (job `eval-nightly`). Limite : un fil très long ou une recherche
renvoyant plusieurs fils ambigus peut encore dépasser 3 rounds.
