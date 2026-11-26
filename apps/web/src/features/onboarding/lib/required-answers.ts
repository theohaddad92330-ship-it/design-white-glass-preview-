import { TEMPS1_REQUIRED_KEYS } from '@bellum/contracts'
import { ApiError } from '@/lib/api-error'
import { TEMPS1_CATALOGUE_SUBSTEPS } from './questions'

/** Le code que `POST /onboarding/complete` pose sur un refus « il manque des réponses exigées » (#4817). */
const INCOMPLETE_CODE = 'incomplete'

const REQUIRED_KEYS: ReadonlySet<string> = new Set(TEMPS1_REQUIRED_KEYS)

/**
 * #4818 — cette question ferme-t-elle la porte de complétion ? La SOURCE est `TEMPS1_REQUIRED_KEYS` (GA-26) :
 * aucun second registre de « questions importantes ».
 */
export function isRequiredAnswerKey(key: string): boolean {
  return REQUIRED_KEYS.has(key)
}

type MissingAnswerLink = {
  key: string
  /** Clé i18n du libellé de la question (jamais la clé de colonne `esn_name`). */
  labelKey: string
  stageCode: string
  slug: string
}

/**
 * #4817 — chaque clé manquante devient son libellé + la sous-étape qui pose RÉELLEMENT la question
 * (le catalogue complet : une question reportée au Temps 2 reste joignable). Une clé que le catalogue ne
 * connaît pas ne fait AUCUNE ligne (on ne nomme pas ce qu'on ne sait pas relier — GA-18/GA-19).
 */
export function missingAnswerLinks(keys: readonly string[]): MissingAnswerLink[] {
  const links: MissingAnswerLink[] = []
  for (const key of keys) {
    for (const sub of TEMPS1_CATALOGUE_SUBSTEPS) {
      const question = sub.questions.find(q => q.key === key)
      if (question) {
        links.push({ key, labelKey: question.label, stageCode: sub.stageCode, slug: sub.slug })
        break
      }
    }
  }
  return links
}

/**
 * Les clés manquantes que le serveur a NOMMÉES, ou `null` quand l'échec n'est PAS un refus pour réponses
 * manquantes (503 d'enregistrement, transition illégale, réseau) : l'écran ne doit alors jamais affirmer
 * « il manque des réponses essentielles » (#4817.3).
 */
export function missingKeysOf(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.code !== INCOMPLETE_CODE) return null
  const missing = (error.details as { missing?: unknown } | null | undefined)?.missing
  if (!Array.isArray(missing)) return null
  return missing.filter((k): k is string => typeof k === 'string')
}
