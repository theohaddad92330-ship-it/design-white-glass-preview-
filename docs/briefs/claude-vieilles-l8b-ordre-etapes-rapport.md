# Rapport — claude/vieilles-l8b-ordre-etapes (L8-bis, #2164.4/.5/.6)

Branche depuis `origin/claude/vieilles-l8-analyse-etapes` (lot L8, non fusionné). Aucune PR (le fil l'ouvre).

## Par point

- **Prérequis : ordre d'affichage** — livré `66a167c3` : `ANALYSIS_STEP_ORDER` + `ANALYSIS_OPTIONAL_STEPS` (contrat),
  branché dans `stores/analysisStore.ts`, `lib/analysis-step-progress.ts`, `components/analysis/AnalysisProgressCard.tsx`
  (+ `run.optionalSteps`). `lib/analysis-subscription.ts` : aucun changement nécessaire (il passe par `startedStepFor`/`progressStepFor`).
  Enum : 3 valeurs ajoutées EN FIN, aucune renumérotation. FR + EN (`analysis.json` : libellés + aperçus).
- **2164.4 réutilisation** — livré `b11044bd` : `analysis.worker.ts` émet `reuse_existing` AVANT la 1re phase quand
  `previousAnalysis`/`accountFacts`/`knownContacts` sont non vides et que le run n'est pas repris. Rien à réutiliser ⇒ rien émis.
- **2164.5 recherche actuelle** — livré `b11044bd` : `phase1_research.py` émet `current_research` avant d'attendre la recherche web.
- **2164.6 recherche thématique** — livré `b11044bd` : `phase1_research.py` émet `thematic_research` avant d'attendre offres/BOAMP/DECP.
- **Étape non exécutée ⇒ ni cochée ni comptée** — livré (store + lib). Fragment `changes/claude-vieilles-l8b-ordre-etapes.yml` (FR/EN + classement démo « vide à dessein »).

## Tests (rouge → vert)

contracts `analysis.step-order.test.ts` + `enum-additivity` ; web `analysis-step-order.test.ts` (4), `analysisStore.test.ts`, `AnalysisProgressCard.test.tsx` ;
api `analysis.worker.spec.ts` (116, 2 neufs ; rouge confirmé avant le code).
`check-types` @bellum/web : 0 `error TS`. @bellum/api : 3 erreurs `Cannot find module '@bellum/email'` (paquet non construit ici, étranger au diff).
**Non vérifié** : `apps/ia/tests/test_phase1_research.py::test_phase1_research_names_current_and_thematic_research_steps` écrit mais NON exécuté (pas de venv IA dans cette VM) ; `py_compile` OK.
Les tests contrats/web ont été écrits avec le code dans le même geste (pas de rouge préalable pour eux).

## Questions

- **Q1** — `features/launcher/AccountLaunchSurface.tsx` et `components/sidebar/background-tasks/useBackgroundEntries.ts` appellent `analysisStepLabel(currentStep)` sans `optionalSteps` (hors périmètre) : le total y ignore les étapes facultatives déjà émises. Les brancher ?
- **Q2** — Démo : `features/demo/demo-run.ts` (parcours scripté, hors périmètre) n'émet pas les 3 étapes ; classé « vide à dessein ». Élargir le périmètre pour les y faire apparaître ?
- **Q3** — Pourcentages `reuse_existing` 2 / `current_research` 20 / `thematic_research` 31 choisis par moi (monotones, avant les jalons voisins) : à confirmer.

SHA de tête : voir le commit qui ajoute ce rapport (parent `b11044bd`).
