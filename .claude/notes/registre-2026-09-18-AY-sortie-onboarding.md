# LOT AY — l'onboarding ne prend JAMAIS l'application en otage

base : cc90f0d76 — 18/09/2026
branche : feat/sortie-onboarding-toujours-possible-18-09

Le geste empêché : Ludovic Marx paie depuis un mois sans avoir jamais atteint le
produit (onboarding bouclé, sortie impossible), et Louis lui-même s'est
retrouvé enfermé sur son propre compte le 17/09 au soir. **Ces trois points
n'avaient AUCUN registre** — c'est pour ça que personne ne les comptait.

| # | Demande | Zone | Mesure avant ce lot | État | Preuve |
|---|---|---|---|---|---|
| 2579.2 | « Quitter » du questionnaire doit rendre la main, pas boucler | `apps/web/src/features/onboarding/view/OnboardingWizard.tsx` | `OnboardingWizard.tsx:231-240` était un `<Link to="/dashboard">` NU, il n'appelait jamais `skip()` — contrairement à `#2579.1` (`OnboardingWelcomePage.tsx:161`, corrigé). Corroboration : le commit `2406887d1` cite `#2579.1` et `#2579.3`, jamais `#2579.2`. Sur un compte `refresh_required` + `skipped_at: null`, `needsOnboarding` (`onboarding-gate.ts:125-126`) renvoyait aussitôt vers `/onboarding` — la boucle. | déjà là | `OnboardingWizard.tsx` : le bouton « Quitter » appelle désormais `skip.mutateAsync()` (MÊME geste que `#2579.1`, réutilisé — pas un second), **attendu** avant `navigate({ to: '/dashboard' })`, `.catch(() => undefined)` pour ne jamais enfermer sur un report qui échoue. Test `OnboardingWizard.test.tsx` describe `#2579.2` (3 tests) : appelle `skip.mutateAsync` une fois, ne navigue PAS avant que la promesse résolve, navigue quand même si `skip` rejette. `onboarding-gate.test.ts:112-116` (déjà vert, non touché) prouve le prédicat côté porte. ‖ trace `#2579.2` en code de production sur origin/main — balayage du 18/09/2026 |
| 2537.1 | Réponse visiblement enregistrée ; reprise après coupure au même endroit | `apps/web/src/features/onboarding/hooks/useOnboardingNavigation.ts` | Aucune trace `#2537` dédiée. Mécanismes plausibles déjà en place et déjà testés séparément (brouillon local `#2026.1`, horodatage `#2026.2`, message d'échec `#2537.4`), mais **zéro test ne couvrait « coupure réseau au milieu d'une étape, puis rechargement »** — le critère de recette exact de l'issue. | recetté | CODE 18/09 — useOnboardingNavigation (OnboardingWizard.tsx:100) : goTo appelé SEULEMENT après un enregistrement réussi (navigation.ts:63-67) + brouillon persisté (onboardingStore.ts:142) ; même hook relit la position au montage |
| 2537.3 | Rejouer un enregistrement ne double rien, ne bloque rien, message clair | `apps/api/src/modules/onboarding/onboarding.service.ts` (+ `useOnboardingNavigation.ts` côté message, réutilisé) | Zéro occurrence de code dédiée, aucun test. Mesuré en creusant : le mécanisme sous-jacent existe déjà (`transitionTo` : `if (state.status === to) return success(state)`, #2004.11 ; `esn_profiles` est un UPSERT par `user_id`) mais seule `requestRefresh` avait un témoin d'idempotence — `saveAnswers`/`advanceStage`, les deux chemins RÉELLEMENT rejoués par `onContinue`, n'en avaient aucun. | déjà là | `onboarding.service.spec.ts`, describe `#2537.3` (3 tests) : `saveAnswers` rejoué avec les mêmes réponses ne crée pas de seconde ligne `esn_profiles` (upsert par `user_id`, vérifié par lecture directe du dépôt) ; `advanceStage` rejoué avec le même code d'étape n'écrit pas une seconde ligne dans `user_onboarding_transitions` ; un rejeu ne bloque jamais (les deux appels réussissent). `useOnboardingNavigation.test.tsx`, dernier test du describe `#2537.1` : un succès après un échec n'avance QU'UNE fois (`navigate` appelé 1 fois malgré 2 appels à `save`). Message d'erreur : `onboardingSaveErrorKey` (`useOnboardingNavigation.ts:30-34`) réutilisé tel quel, non dupliqué — jamais « une erreur est survenue » (déjà couvert par `#2537.4`, vert, non touché). ‖ trace `#2537.3` en code de production sur origin/main — balayage du 18/09/2026 |

## Ce qui contredit le brief

- Les chemins de fichiers du brief supposaient `OnboardingWizard.tsx` à la
  racine de `features/onboarding/` ; il vit réellement dans
  `features/onboarding/view/OnboardingWizard.tsx` (confirmé par grep avant
  toute édition).
- Pour `2537.3`, le brief mesure « zéro occurrence de code » — **le mécanisme
  d'idempotence EXISTE et est documenté** (`transitionTo`, #2004.11 ;
  `classifyNetworkFailure`/`persistFailure`, #2084, avec ses propres tests
  lignes 230-295 de `onboarding.service.spec.ts`). Ce qui manquait vraiment
  n'était pas le mécanisme mais SA PREUVE sur les deux chemins que le
  questionnaire emprunte réellement.
- Effet de bord repéré, **non corrigé (hors périmètre de ce lot)** :
  `OnboardingService.complete()` rappelle `esnProfile.completeReedition`
  (génération de profil, appel modèle payant) même quand `transitionTo`
  renvoie un succès idempotent sur un statut DÉJÀ `completed` — un rejeu de
  la complétion (pas de l'enregistrement d'une réponse) re-déclencherait donc
  une génération. Ça concerne l'écran de relecture/génération
  (`OnboardingReviewPage`/`OnboardingGeneratingPage`), hors des fichiers
  listés pour ce lot ; à signaler comme point de suivi.

## Démo

Ces trois points sont **vides à dessein** côté démo : `onboarding-gate.ts`
(`needsOnboarding`) saute l'onboarding pour tout compte `is_demo === true`
avant même de lire `skipped_at`/le statut — la salle de démonstration
n'atteint jamais ni le bouton « Quitter » ni le questionnaire. Voir
`demo-coverage.ts` (entrée dédiée ajoutée par ce lot).
