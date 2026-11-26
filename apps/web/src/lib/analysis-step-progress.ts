import { ANALYSIS_OPTIONAL_STEPS, ANALYSIS_STEP_ORDER, type AnalysisStep } from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * #3666 (décision Louis 13/10, « étapes, pas de % ») — L'AVANCEMENT D'UNE
 * ANALYSE SE DIT EN ÉTAPES, JAMAIS EN POURCENTAGE.
 *
 * Le `percent` que le serveur pousse est un jalon de phase (un plancher de
 * heartbeat : 15, 45, 72, 87), pas une mesure : l'afficher, c'était inventer une
 * précision. Ce que le job MESURE, c'est l'étape où il est (`currentStep`, le
 * `step` canonique de `analysisProgressEventSchema`) parmi les étapes réelles du
 * pipeline (`ANALYSIS_STEP_ORDER`, contrat). D'où « Étape 4 sur 9 : contacts clés ».
 *
 * UNE lecture (GA-26), relue par toutes les surfaces d'une analyse en cours :
 * l'écran d'attente, la ligne compacte du dossier, le lanceur, le panneau des
 * tâches de fond. La garde `un-avancement-se-dit-en-etapes.test.ts` refuse un
 * pourcentage d'avancement qui ne passerait pas par ici.
 */

type StepPosition = { index: number; total: number; step: AnalysisStep }

const OPTIONAL_STEP_SET: ReadonlySet<AnalysisStep> = new Set<AnalysisStep>(ANALYSIS_OPTIONAL_STEPS)

/**
 * #2164.4/.5/.6 — LES ÉTAPES DE CE RUN, dans l'ordre d'AFFICHAGE
 * (`ANALYSIS_STEP_ORDER`, jamais l'index d'enum). Une étape facultative que le
 * run n'a PAS émise n'y figure pas : ni cochée, ni comptée — jamais « faite »
 * par défaut.
 */
export function analysisRunSteps(emittedOptional: readonly AnalysisStep[] = []): AnalysisStep[] {
  return ANALYSIS_STEP_ORDER.filter(s => !OPTIONAL_STEP_SET.has(s) || emittedOptional.includes(s))
}

/** Les étapes qui PRÉCÈDENT `step` à l'écran dans ce run (celles que l'avancement coche). */
export function analysisStepsBefore(step: AnalysisStep, emittedOptional: readonly AnalysisStep[] = []): AnalysisStep[] {
  const steps = analysisRunSteps(emittedOptional)
  const idx = steps.indexOf(step)
  return idx < 0 ? [] : steps.slice(0, idx)
}

/** La position MESURÉE de l'étape en cours (1-indexée), ou `null` si elle est inconnue. */
export function analysisStepPosition(
  step: AnalysisStep | null | undefined,
  emittedOptional: readonly AnalysisStep[] = [],
): StepPosition | null {
  if (!step) return null
  // L'étape en cours compte toujours : une étape facultative émise est, par définition, exécutée.
  const steps = analysisRunSteps(emittedOptional.includes(step) ? emittedOptional : [...emittedOptional, step])
  const index = steps.indexOf(step)
  if (index < 0) return null
  return { index: index + 1, total: steps.length, step }
}

/**
 * « Étape 4 sur 9 : contacts clés » — ou `null` quand l'étape n'est pas connue :
 * l'écran dit alors « En cours », jamais une étape devinée ni un « 0 % ».
 */
export function analysisStepLabel(
  step: AnalysisStep | null | undefined,
  emittedOptional: readonly AnalysisStep[] = [],
): string | null {
  const position = analysisStepPosition(step, emittedOptional)
  if (!position) return null
  return i18n.t('analysis:progressCard.stepOf', {
    index: position.index,
    total: position.total,
    label: i18n.t(`analysis:progressCard.steps.${position.step}`),
  })
}
