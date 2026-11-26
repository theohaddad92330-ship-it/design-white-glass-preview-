# Rapport — fix/4962-r2-onboarding-ecritures

- Défaut 2 (#5028) : FAIT. `routes/actions/$id.tsx` `beforeLoad` : `redirect({ to: '/actions' })` si `id === 'ecritures'`
  (pas de ligne dans la table des anciennes adresses : la garde `route-migration-registry.test.ts` l'interdit).
  Test `routes/actions/ecritures-redirect.test.ts` (rouge puis vert) ; `legacy-addresses.test.ts` vert.
- Défaut 1 (#4969) : cause = `setStatus(userId,'failed')` écrivait le statut SANS motif (3 sites), donc « raison non enregistrée ».
  - API : colonne `profile_context_failure_reason` (migration 20261101120000), codes `model_error` / `model_unreachable` /
    `persist_failed` (jamais le message d'erreur), exposé en `failureReason` par `GET /profile-context`. Spec : 3 tests rouge -> vert, 75/75.
  - Web : `/settings/profile` affiche « Échec — <raison> » (i18n fr+en). `/settings/profile/audit` : un échec de lecture du
    profil se dit (`loadError`, `role=alert`) au lieu de rester sur « Lecture de ton profil… ».
- NON fait : la CAUSE réelle de l'échec en prod ne se lit pas dans le code (timeout IA 120 s, une seule tentative, ou
  panne IA) : lire `failureReason` après le prochain échec. Pas de geste de relance ajouté sur ce bloc.
- Limite : la page d'audit reste en « Lecture… » tant que l'une des neuf requêtes agrégées charge ; seul l'échec de
  la lecture du profil est traité.
- Tests : vitest (5 specs web), jest profile-context.service.spec, tsc web propre ; tsc api non concluant (`@bellum/email` non construit).
- Jamais lancé : ci:local, suite complète, build racine.
