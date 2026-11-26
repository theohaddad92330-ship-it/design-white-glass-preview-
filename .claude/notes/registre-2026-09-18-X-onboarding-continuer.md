# LOT X — onboarding, « Continuer » désactivé et muet (#2577)

base : 73b6ecdc4 — 18/09/2026
branche : `fix/onboarding-continuer-dit-ce-qui-manque-18-09`

Route mesurée : `/onboarding/<id>/company_info/vivier-collecte`, compte
`status: refresh_required`, SHA servi `73b6ecdc4`. Relevé en production : bouton
`disabled: true`, `aria-disabled: null`, classe contenant `cursor-pointer`,
`[role="alert"], [aria-live]` → 0 élément, clic → rien.

| Point | Demande | État | Preuve |
| --- | --- | --- | --- |
| #2577.1 | Continuer dit ce qui manque, au clic | déjà là | `4bcdac12b` — un `disabled` natif ne reçoit aucun `click` (c'était la cause du silence en production) ; le bouton reste actionnable, `handleContinueClick` (`OnboardingWizard.tsx`) nomme le nombre de questions manquantes dans une région `role="status"`/`aria-live="polite"` (`data-testid="onboarding-continue-feedback"`) et déplace le focus sur la première question sans réponse via `revealTarget`/`onboardingQuestionRevealId` (`src/lib/reveal-target.ts`, `SubStepQuestions.tsx`). Le cas « trop d'éléments » (R15N-10, `exceedsMax`) garde son `title` dédié et n'affiche jamais ce second message. Test rouge→vert : `OnboardingWizard.test.tsx` (`#2577.1`), cassé volontairement (`{false && showMissingFeedback …}`) puis restauré — 2 tests rougissaient pour la bonne raison, un test « corpus non vide » (`status.textContent`) et un témoin du cas voisin (réponse déjà valide → jamais de message). ‖ trace `#2577.1` en code de production sur origin/main — balayage du 18/09/2026 |
| #2577.2 | aria-disabled remplace disabled, curseur cohérent | déjà là | `4bcdac12b` — `aria-disabled={!isValid \|\| undefined}` remplace `disabled={pending \|\| !isValid}` sur le bouton Continuer (`OnboardingWizard.tsx`) ; `pending` (enregistrement en cours) reste porté par `isLoading`, qui pose son propre `disabled` natif — ce n'est pas le cas que #2577 corrige. Classe `aria-disabled:cursor-not-allowed aria-disabled:opacity-50` (le curseur ne promet plus un clic-suite qui n'arrive pas). Deux tests existants (`#2021.5`, `R15N-10`) migrés de `toBeDisabled()` vers `toBeEnabled()` + `toHaveAttribute('aria-disabled', 'true')`. ‖ trace `#2577.2` en code de production sur origin/main — balayage du 18/09/2026 |
| #2577.3 | Une seule durée annoncée aux deux écrans | recetté | CODE 18/09 — source unique ONBOARDING_ESTIMATED_MINUTES (onboarding-gate.ts:142) lue par OnboardingWelcomePage.tsx:244 et dérivée par estimateMinutesRemaining (OnboardingStepper.tsx:59) — GA-26 |
| #2577.4 | Numéro de l'étape 6 semble manquer | déjà là | Mesure dans le code, pas une supposition : `OnboardingStepper.tsx:99` — `{done ? <Check className="h-3.5 w-3.5" /> : i + 1}` — un step `done` (`resultStepStatus`, `onboarding-progress.ts:64-72` : TOUTES ses questions répondues, sur les RÉPONSES enregistrées, jamais sur la position de l'étape courante) affiche un coche SVG à la place du chiffre. Ce n'est PAS « l'étape courante qui masque son numéro » au sens littéral de la question posée — c'est l'étape TERMINÉE qui le fait, y compris une étape jamais visitée dans la session en cours si ses réponses existent déjà (cas `refresh_required` : les réponses de `goals` peuvent dater d'un questionnaire antérieur complété, alors que l'écran ouvert est `company_info/vivier-collecte`). Comportement voulu et déjà gardé par un test : `OnboardingStepper.test.tsx:166` — `expect(organisation?.querySelector('svg')).toBeTruthy() // le check, pas un numéro` (describe `#2023.1 — le statut des étapes vient des réponses, pas de l'index`). Un lecteur de texte seul (sans capture d'écran) lit alors « Tes objectifs » sans chiffre PRÉCÉDENT ni mot « terminé » — la coche SVG n'a pas de nom accessible, mais GA-32 (icône nommée) ne porte que sur `size="icon"` des boutons, pas sur ce badge non interactif : aucune garde du dépôt n'est en défaut. Aucun code touché — periemetre de ce lot n'inclut pas de refonte de ce badge. |

## Portes exécutées

- `node apps/web/node_modules/typescript/bin/tsc --noEmit -p apps/web/tsconfig.json` — vert.
- `pnpm lint:exports:types` — vert.
- `node node_modules/prettier/bin/prettier.cjs --list-different <fichiers touchés>` — vert (test file reformaté par le hook pre-commit, revérifié vert après).
- Tests ciblés vitest (`apps/web`, `--maxWorkers=2`) : `OnboardingWizard.test.tsx` (15/15), `SubStepQuestions.test.tsx` (24/24), `onboarding-progress.test.ts` (15/15), `onboarding-gate.test.ts` + `OnboardingStepper.test.tsx` + `OnboardingWelcomePage.test.tsx` + `ReconfigureAnswersSection.test.tsx` (regression, 56/56 + 170/170 combinés) — tous verts.
- `demo-coverage.ts` : non touché — aucune nouvelle table, aucune nouvelle clé de `raw_analysis` (vérifié, pas supposé : `git diff --stat` du lot ne liste que des fichiers `apps/web/src/features/onboarding/**` et deux `i18n/locales/*/onboarding.json`).

## Non fait / hors périmètre

- `apps/web/src/features/profile/components/ReconfigureAnswersSection.tsx` consomme `reconfigurationPlan` mais n'est pas dans le périmètre de ce lot (`features/profile/**`) — non touché, tests de régression verts.
- Pas de recette écran (navigateur) faite par cet agent écrivain — preuve en recette à faire par un `recetteur` dédié.
