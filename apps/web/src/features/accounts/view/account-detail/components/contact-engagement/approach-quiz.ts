import type { DecisionRole } from '@bellum/contracts'
import { i18n } from '@/i18n'
import type { MessageParameters } from './message-parameters'

/**
 * #3633 (Louis 05/10/2026) — « au clic sur Email suggéré, l'email doit être
 * basé sur le rang du contact, le contexte global, et poser au moins 3
 * questions sous forme de QCM sur la manière d'aborder la situation ».
 *
 * AUCUN second générateur ni contrat neuf : les réponses se traduisent dans ce
 * que `/ia/message` lit déjà —
 *  - l'OBJECTIF → `parameters.objective` (codes du moteur, revalidés côté IA) ;
 *  - l'ANGLE → `context`, l'angle libre que le moteur lit depuis toujours ;
 *  - le TON → `parameters.constraints` (contraintes de forme, ≤ 300 car.).
 * Le contexte global (dossier du compte, signaux, relation, dernière perte) et
 * le rôle de décision du contact sont lus CÔTÉ MOTEUR depuis `contactId`
 * (`apps/ia/app/routers/message.py`) ; le rang pré-coche ici l'objectif
 * recommandé, que le commercial peut changer. Le corps des messages reçus ne
 * part jamais au modèle (doctrine) — rien de tel n'est ajouté ici.
 */

export const APPROACH_QUESTIONS = [
  {
    key: 'objective',
    options: ['ouverture_compte', 'demande_information', 'positionnement_expertise', 'relance'],
  },
  { key: 'angle', options: ['signal', 'role', 'reference', 'question'] },
  { key: 'tone', options: ['formal', 'direct', 'warm'] },
] as const

type ApproachQuestionKey = (typeof APPROACH_QUESTIONS)[number]['key']
export type ApproachAnswers = Partial<Record<ApproachQuestionKey, string>>

/** Ce que la génération reçoit : l'angle (`context`) et les paramètres choisis. */
export type ApproachChoice = { angle: string; parameters: MessageParameters }

/**
 * Le rang (rôle de décision) pré-coche l'objectif : un décideur budgétaire
 * s'ouvre, un bloqueur se rassure en validant le contexte, un relais se
 * questionne. Rang inconnu ou historique : rien n'est deviné.
 */
const OBJECTIVE_BY_ROLE: Partial<Record<DecisionRole, string>> = {
  economic: 'ouverture_compte',
  technical: 'positionnement_expertise',
  // #2204.21 (Louis 16-17/10) — « valider un contexte » EST `demande_information`, pas un objectif en plus (GA-26).
  procurement: 'demande_information',
  blocker: 'demande_information',
  user: 'demande_information',
  champion: 'demande_information',
  influencer: 'demande_information',
}

export function recommendedAnswers(role: DecisionRole | null | undefined): ApproachAnswers {
  const objective = role ? OBJECTIVE_BY_ROLE[role] : undefined
  return objective ? { objective } : {}
}

/**
 * #3694.5 — « Laura ne pose une question que si la réponse change significativement
 * le message ». Un rang connu pré-coche l'objectif : le dossier répond déjà, la
 * génération part SANS question (`directApproach`). Seul un rang inconnu pose la
 * question de l'objectif ; l'angle et le ton ne sont plus jamais exigés — ils
 * affinent, sans bloquer (tranché sans Louis : la décision du 05/10 « le PDF
 * prime » retire le QCM fixe de trois questions).
 */
export function needsApproachQuestion(role: DecisionRole | null | undefined): boolean {
  return recommendedAnswers(role).objective === undefined
}

/** L'approche sans question : l'objectif du rang, aucun angle imposé (le moteur choisit le signal le plus actionnable). */
export function directApproach(role: DecisionRole | null | undefined): ApproachChoice | null {
  return approachChoice(recommendedAnswers(role))
}

/** `null` tant que l'objectif manque ; l'angle et le ton, s'ils sont donnés, s'ajoutent sans être exigés. */
export function approachChoice(answers: ApproachAnswers): ApproachChoice | null {
  const { objective, angle, tone } = answers
  if (!objective) return null
  return {
    // i18n keys: approachQuiz.angleInstruction.signal|role|reference|question
    angle: angle ? i18n.t(`engagement:approachQuiz.angleInstruction.${angle}`) : '',
    parameters: {
      objective,
      // i18n keys: approachQuiz.toneInstruction.formal|direct|warm
      ...(tone ? { constraints: i18n.t(`engagement:approachQuiz.toneInstruction.${tone}`) } : {}),
    },
  }
}
