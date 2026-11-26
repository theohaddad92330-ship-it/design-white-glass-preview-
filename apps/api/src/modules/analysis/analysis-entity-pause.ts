import { readEntityResolution, type AnalysisEntityQuestion } from '@bellum/contracts'

/**
 * #2164.17 — CORRIGER UNE AMBIGUÏTÉ PENDANT LE JOB.
 *
 * Avant : une identité ambiguë (deux sociétés homonymes) ne se corrigeait
 * qu'APRÈS le run — contacts, organigramme et plan avaient déjà été payés sur
 * l'hypothèse. Maintenant, sur un run lancé par NOM (aucun SIREN verrouillé),
 * le worker se met en pause après la recherche et pose la question.
 *
 * La pause est un job BullMQ DIFFÉRÉ (`moveToDelayed`) : la question vit dans
 * les données du job, rien n'est écrit en base, aucune contrainte SQL n'est
 * touchée. Le compte reste `analyzing`.
 */

/** Combien de temps la question attend une réponse avant que le run reprenne
 *  sur l'hypothèse. Court : un commercial parti ailleurs ne doit pas retarder
 *  son dossier de plus de quelques minutes. */
export const ENTITY_QUESTION_WAIT_MS = 5 * 60_000

const SIREN = /^\d{9}$/

/** La réponse enregistrée sur le job (POST `/analysis/:accountId/entity-answer`). */
export type EntityAnswerOnJob = { siren: string; answeredAt: string }

/**
 * La question à poser, ou `null` quand il n'y a rien à demander : identité non
 * ambiguë, blob illisible, ou moins de DEUX entités porteuses d'un SIREN (un
 * choix à un seul n'est pas un choix — et un candidat sans SIREN ne peut pas
 * verrouiller la recherche).
 */
export function entityQuestionFor(research: unknown, now: Date): AnalysisEntityQuestion | null {
  const blob = research && typeof research === 'object' && !Array.isArray(research) ? research : null
  const resolution = readEntityResolution(blob as Record<string, unknown> | null)
  if (resolution?.state !== 'ambiguous') return null
  const seen = new Set<string>()
  const candidates: AnalysisEntityQuestion['candidates'] = []
  for (const candidate of resolution.question?.candidates ?? []) {
    const siren = candidate.siren?.trim() ?? ''
    if (!SIREN.test(siren) || seen.has(siren)) continue
    seen.add(siren)
    candidates.push({ name: candidate.name, siren, city: candidate.city?.trim() || null })
  }
  if (candidates.length < 2) return null
  const hypothesis = resolution.identifiers['siren']?.trim() ?? ''
  return {
    candidates,
    hypothesisSiren: SIREN.test(hypothesis) ? hypothesis : null,
    askedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ENTITY_QUESTION_WAIT_MS).toISOString(),
  }
}

/**
 * Comment le run REPREND après une pause.
 *  - aucune pause passée : rien ne change, la pause reste possible ;
 *  - réponse = l'hypothèse : la recherche déjà payée est gardée (reprise
 *    ordinaire, phases sautées) ;
 *  - réponse ≠ l'hypothèse : la recherche repart, verrouillée sur ce SIREN ;
 *  - aucune réponse avant l'échéance : reprise sur l'hypothèse.
 * Une question ne se pose qu'UNE fois par run.
 */
export function resumePlanAfterEntityPause(
  question: AnalysisEntityQuestion | undefined,
  answer: EntityAnswerOnJob | undefined,
): { pauseAllowed: boolean; siren: string | null; freshResearch: boolean } {
  if (!question) return { pauseAllowed: true, siren: null, freshResearch: false }
  if (!answer) return { pauseAllowed: false, siren: null, freshResearch: false }
  return { pauseAllowed: false, siren: answer.siren, freshResearch: answer.siren !== question.hypothesisSiren }
}

/** Le signal levé dans le flux du graphe : la recherche a landé, la question
 *  est prête, le worker met le job en pause (`AnalysisWorker.pauseForEntity`). */
export class AnalysisAwaitingEntitySignal extends Error {
  constructor(readonly question: AnalysisEntityQuestion) {
    super('Analyse en pause : identité ambiguë, question posée')
    this.name = 'AnalysisAwaitingEntitySignal'
  }
}
