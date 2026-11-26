# Diag #4962 — « La rédaction a échoué » sur approach/call (02/11)

Verdict : cause de l'échec de rédaction NON PROUVÉE (logs de 06:51 hors fenêtre). Hypothèse Throttler/Découvrir = PEU PROBABLE pour la rédaction.

## 1. Chemin (origin/main)

- CallApproachBody.tsx:~78-90 `useEngagementConversation({autoDraft:true})` -> conversation.ts:619 POST /ia/message (apiFetch)
- ia-proxy.controller.ts:2602 `@Post('message')` `@Throttle(LLM_DRAFT_RATE_LIMIT)` (:253 = 20/min par utilisateur) -> this.ia.generateMessage -> IA FastAPI POST /message/generate (apps/ia/app/routers/message.py:264)
- IA : lit Supabase en direct (contact, compte, profil), puis UN SEUL appel pont : method_consumers.py:92 `bellum_api.contradicted_method_rules` (/internal/copilot/method/contradicted-rules), seulement si des règles de discipline sortent ; `_post` rend None sur non-2xx (bellum_api.py:58-110) => un 429 y est AVALÉ, le brouillon continue. /internal/copilot/base/identity n'est PAS sur ce chemin (seul appelant : discover_skill_offers.py:904, discover_signals.py:1003).
- « La rédaction a échoué » (engagement.json generation.failed) = ApproachPage/CallApproachBody quand lastEntry.role==='error' ; conversation.ts:87-95 `refusalReason` : message NOMMÉ seulement pour message_refused / contact_not_found / account_not_found / account_no_go ; TOUT autre échec (503 upstream_error de message-failure.ts:64-90, 429, 502 IA, timeout) = texte générique. Donc le texte ne distingue pas la cause.

## 2. Throttler et /internal/*

- OUI s'applique : APP_GUARD UserThrottlerGuard (app.module.ts:473), 120/min (app.module.ts:192-208) ; aucun SkipThrottle sur InternalSecretGuard ni base-reader.controller.ts. Tracker = `ip:<req.ip>` (user-throttler.guard.ts:43-62, pas de user/cookie sur appel interne) => TOUS les appels IA->API partagent un compteur par IP. Voulu : aucun commentaire ne le dit => probablement non voulu.
- Logs : 07:10 -> 253 POST base/identity en 201 (Découvrir en parallèle), 07:11 -> 25x201 + 44x429 (api.log, 1ère ligne 429 à 07:11:06). Incohérent avec 120/min (253 passés) : non expliqué (fenêtre/clé Redis) — non prouvé.
- Une rafale Découvrir peut épuiser le quota IP partagé des routes internes (identity, market/search, briefing...) : fait échouer Laura/Découvrir, PAS la rédaction (fail-soft ci-dessus).

## 3. Logs

- `railway logs` ne remonte que 07:00-07:14 (API) et 07:10-07:15 (IA) : le 06:51-06:52 est hors fenêtre ; aucun POST /ia/message ni approach dans ces fenêtres ; aucun 429 hors base/identity. Rien reproduit (lecture seule).

## 4. « Planifier cet appel »

- ApproachDialogs.tsx:~298-390 PlanCallDialog -> outreachMessagesApi.createCall (outreach/api.ts:301, POST /outreach/call-tasks). Bouton « Créer » `disabled={!reason||!objective||...}` ; reason/objective dérivent du SCRIPT (EngagementCreateCallTask.tsx:24-30). Ouverture non rédigée => script '' => bouton désactivé, aucun clic effectif, aucun toast. Donc #4979 = CONSÉQUENCE de l'échec + défaut UX (désactivé sans explication), pas un bug d'endpoint.

## Hypothèses classées (rédaction)

1. IA/modèle : 502 « empty draft » / erreur LLM / timeout du proxy -> 503 upstream_error générique. Vérifier logs API 06:51 `Message — le moteur IA a échoué (upstream_error)` + logs IA.
2. 429 /ia/message (20/min/user) : improbable (2 essais).
3. Garde de rédaction IA (assert_claims_are_grounded 422...) : 422 avec phrase serait NOMMÉ -> ne donne pas le générique, sauf corps illisible.
4. Compte/contact recette : dossier vide => assert_context_is_not_vague (422 nommé aussi).

## Correctif proposé

- Obtenir les logs 06:51Z (Railway/Sentry/Datadog, `feature:message`) avant tout correctif de fond.
- apps/api/src/common : exempter /internal/* du Throttler (SkipThrottle sur InternalSecretGuard routes) ou tracker dédié par `x-internal-secret`+userId ; apps/ia/app/services/bellum_api.py : limiter la concurrence de identity.
- web conversation.ts refusalReason : exposer le code (429/503) ; PlanCallDialog : message quand script vide.
