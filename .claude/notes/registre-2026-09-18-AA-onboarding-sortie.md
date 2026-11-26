# LOT AA — la sortie de l'onboarding qui ne rendait pas la main

base : 2ebf5be56 — 18/09/2026
branche : fix/onboarding-le-report-rend-la-main-18-09

| # | Demande | Zone | État | Preuve en recette |
|---|---|---|---|---|
| AA.1 | « Reprendre plus tard » ramène dans l'app et on y reste (aucune redirection vers `/onboarding`) | `apps/web/src/features/onboarding/lib/onboarding-gate.ts` (`needsOnboarding`) | **livré** | Ligne redondante `if (status === 'refresh_required') return true` retirée : elle interceptait avant la lecture de `skippedAt` et empêchait un report posé APRÈS une demande de reconfiguration de faire sortir le compte. Test `onboarding-gate.test.ts` — « #2579 — un « Plus tard » posé APRÈS une demande de reconfiguration rend la main » (rouge avant le retrait, vert après). Recette écran restant à faire par un `recetteur` : compte `status: refresh_required`, cliquer « Reprendre plus tard » sur la page de reconfiguration, vérifier l'absence de redirection vers `/onboarding`. |
| AA.2 | « Quitter » depuis la barre du questionnaire fait de même | `apps/web/src/features/onboarding/view/OnboardingWizard.tsx` (hors périmètre — non touché) | **à trancher** | **DIVERGENCE CONFIRMÉE, non corrigée ici.** Les deux boutons ne partagent PAS le même chemin : « Reprendre plus tard » (`OnboardingWelcomePage.tsx:161`, `t('welcome.later')`) appelle `useSkipOnboarding()` → `POST /onboarding/skip` puis navigue — corrigé par AA.1. « Quitter » (`OnboardingWizard.tsx:207`, `t('actions.quit')`, barre sticky du questionnaire) est un simple `<Link to="/dashboard">` qui ne persiste RIEN : aucun appel à `skip`. Sur un compte `refresh_required`, cliquer « Quitter » depuis le wizard laisse `status` et `skipped_at` inchangés ; `CustomerPageContent` (`needsOnboarding`) redirige donc de nouveau vers `/onboarding` — la boucle persiste pour CE bouton précis, indépendamment du fix AA.1. Non corrigé ici : `OnboardingWizard.tsx` est déjà modifié par la branche non fusionnée #2577 (bouton « Continuer », unification des durées) — y toucher créerait un conflit sur un correctif qui attend son merge. À reprendre dans un lot dédié une fois #2577 mergé. |
| AA.3 | Une reconfiguration demandée PUIS reportée reste reprenable depuis Réglages › Profil (non-régression) | `apps/web/src/features/onboarding/lib/onboarding-gate.ts` (`resolveOnboardingEntry`) | **livré** | `resolveOnboardingEntry` lit `status === 'refresh_required'` indépendamment de `skippedAt` (ligne inchangée, non touchée par AA.1) : `entry === 'reconfiguration'` reste vrai que le report soit posé ou non. Test existant `onboarding-gate.test.ts:203` (`resolveOnboardingEntry` sur `refresh_required`) toujours vert. Garde serveur de l'invariant : `onboarding.service.spec.ts` — « #2572 — une demande de reconfiguration efface un « plus tard » PÉRIMÉ » (vérifié rouge en retirant temporairement `state.skipped_at = null` dans `requestRefresh`, puis reverti). |

## Lecture de la redondance (demandée par le brief)

**Confirmée juste.** `OnboardingService.requestRefresh` (`onboarding.service.ts:382`) pose déjà `state.skipped_at = null` au moment où il transitionne vers `refresh_required` — invariant server-side qui garantit que `skippedAt` est TOUJOURS `null` juste après une demande de reconfiguration. La ligne `if (status === 'refresh_required') return true` dans `needsOnboarding` (web) était donc strictement redondante avec le `return true` final : elle ne protégeait aucun cas réel du serveur actuel, et cassait le seul cas qu'elle n'avait pas prévu (un report posé APRÈS la demande). Aucun autre chemin serveur n'écrit `refresh_required` ou ne touche `skipped_at` hors de `requestRefresh`, `skipQuestionnaire` et `complete()` (vérifié par grep exhaustif sur `apps/api/src`, y compris migrations et `demo-seed.service.ts`, qui pose systématiquement `skipped_at = NULL`).

## Gates — état à la fin

- `pnpm vitest run apps/web/src/features/onboarding/lib/onboarding-gate.test.ts` → 156 tests, vert
- `pnpm vitest run apps/web/src/features/onboarding` → 440 tests, vert (0 échec ; suites hors périmètre en échec de COLLECTE — `@bellum/ui` sans son propre `node_modules` lié dans ce worktree — non liées à ce lot)
- `pnpm jest onboarding.service.spec.ts` (apps/api) → 46 tests, vert
- `pnpm --filter @bellum/api check-types:tests` → vert (0 erreur)
- `tsc --noEmit -p apps/web` → 0 erreur
- `pnpm lint:exports:types` (knip) → vert
- `prettier --check` sur les 3 fichiers touchés → vert

## Ce qui reste ouvert

- **AA.2 non corrigé** : voir ligne ci-dessus — bloqué par le périmètre du lot (fichier touché par #2577 en attente de merge).
- Recette écran (AA.1) à faire par un `recetteur` dédié, pas par ce lot.
