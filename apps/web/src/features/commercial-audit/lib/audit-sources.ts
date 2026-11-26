import type { EsnAnswers } from '@bellum/contracts'
import { stageQuestions, TEMPS1_STAGES, type Question } from '@/features/onboarding/lib/questions'
import type { AuditHeadline } from './build-audit'

/**
 * #4425.1 — D'OÙ VIENT CHAQUE VALEUR DE L'AUDIT.
 *
 * Une valeur qui vient d'un champ du profil se corrige EN PLACE ; une valeur
 * CALCULÉE (verdict, maturité, plan…) ne s'édite pas — elle dit à partir de
 * quoi elle l'est, et chaque source mène à son champ. Cette table est la seule
 * qui répond à « à partir de quoi ? » (GA-26) ; `audit-sources.test.ts` vérifie
 * que chaque clé nommée est une vraie question du questionnaire.
 *
 * ⚠️ Les entrées des cinq en-têtes sont les RÉPONSES que le profileur lit pour
 * produire la valeur (registre `onboarding-question-consumers.ts`, zone
 * `audit`), pas une recopie de la valeur : corriger la réponse relance la
 * génération du contexte (`PUT /esn-profile`), l'en-tête se recalcule ensuite.
 * L'archétype, lui, est une fonction pure de la taille (`esn_profiler.py`,
 * `esn_archetype(size)`).
 */
export const AUDIT_HEADLINE_SOURCES: Record<AuditHeadline['key'], readonly (keyof EsnAnswers)[]> = {
  posture: ['positioning'],
  archetype: ['consultant_size'],
  target: ['target_sectors', 'target_company_types', 'ideal_client_size'],
  bottleneck: ['main_sales_pain', 'sales_freins'],
  cadence: ['weekly_sales_time_declared'],
}

/**
 * Les blocs CALCULÉS dont les entrées ne se réduisent pas à un champ : ils
 * nomment les ÉTAPES du profil qui les alimentent (les trois que le registre
 * des consommateurs classe `audit`), jamais un champ qu'on ne saurait prouver.
 */
export const AUDIT_COMPUTED_BLOCK_STAGES = {
  verdict: ['company_info', 'offer_expertise', 'target_market'],
  maturity: ['company_info', 'offer_expertise', 'target_market'],
  chain: ['company_info', 'target_market'],
  plan: ['company_info', 'offer_expertise', 'target_market'],
  hypotheses: ['company_info', 'offer_expertise', 'target_market'],
  pool: ['company_info'],
  observations: ['company_info', 'target_market'],
} as const satisfies Record<string, readonly string[]>

type KeyedQuestion = { question: Question; stageCode: string }

const QUESTION_BY_KEY: ReadonlyMap<string, KeyedQuestion> = new Map(
  TEMPS1_STAGES.flatMap(stage =>
    stageQuestions(stage).map((question): [string, KeyedQuestion] => [
      question.key,
      { question, stageCode: stage.code },
    ]),
  ),
)

/** La question du questionnaire qui pose cette réponse, ou `null` (jamais devinée). */
export function answerQuestionOf(key: keyof EsnAnswers): Question | null {
  return QUESTION_BY_KEY.get(key)?.question ?? null
}

/** Le code de l'étape `/settings/profile/$stage` où cette réponse se saisit, ou `null`. */
export function answerStageOf(key: keyof EsnAnswers): string | null {
  return QUESTION_BY_KEY.get(key)?.stageCode ?? null
}
