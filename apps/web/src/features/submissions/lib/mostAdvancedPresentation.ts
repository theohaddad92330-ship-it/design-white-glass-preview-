import type { Submission, SubmissionStage } from '@bellum/contracts'

const ADVANCEMENT: readonly SubmissionStage[] = ['accepted', 'interview', 'submitted', 'shortlisted']

/**
 * Théo C HT-6 — la présentation la plus avancée d'une affaire : là où `/propositions?project=` atterrit
 * désormais. Les sorties (refusé, retiré) ne passent qu'à défaut de présentation vivante.
 */
export function mostAdvancedPresentation(items: readonly Submission[]): Submission | null {
  for (const stage of ADVANCEMENT) {
    const found = items.find(item => item.stage === stage)
    if (found) return found
  }
  return items[0] ?? null
}
