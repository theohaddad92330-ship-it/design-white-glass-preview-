# Rapport — fix/4962-r4-redaction-throttle

1. **Throttler /internal/*** — fait. `apps/api/src/common/user-throttler.guard.ts` : `shouldSkip` exempte `/internal/*` portant un `x-internal-secret` valide (comparaison à temps constant, même secret que `InternalSecretGuard`). Sans secret / mauvais secret / route publique : toujours comptées. Test : `user-throttler.guard.spec.ts` (jest, 14/14, rouge -> vert).
2. **« La rédaction a échoué » muet** — fait. `contact-engagement/conversation.ts` `refusalReason` : 429 -> `generation.rateLimited`, 502/503/504/timeout -> `generation.unavailable` (fr + en) ; Réessayer inchangé. Test : `conversation.test.tsx` (vitest, 53/53 ; l'ancien test « 503 sans raison » remplacé).
3. **« Planifier cet appel » muet** — fait. `PlanCallDialog` (`ApproachDialogs.tsx`) : champs Raison/Objectif éditables, pré-remplis depuis le script, + texte d'aide visible tant qu'un des deux manque. Test : `ApproachDialogs.test.tsx` (4/4, rouge -> vert).

Non fait / limites : cause racine de l'échec de rédaction du 02/11 06:51 toujours NON prouvée (logs hors fenêtre, cf. diagnostic) ; la limite de concurrence côté `bellum_api.py` n'est pas dans le brief. Pas de PR, pas de ci:local.
