import { parseStepVariables } from './outreach-multichannel.js'

/**
 * Lot L-C (#4166) — LE SCORE DE QUALITÉ D'UN MESSAGE, calculé sur place.
 *
 * Six critères, jamais une note nue : le résultat NOMME les critères tenus, les
 * ratés et ceux qui ne s'évaluent pas (pas d'objet sur LinkedIn). Aucune
 * probabilité de réponse. Calcul PUR sur le texte que l'utilisateur a sous les
 * yeux dans l'écran — rien ne sort vers un serveur ni vers un modèle (le corps
 * d'un message n'y va pas, doctrine c96).
 *
 * ⚠️ Distinct de `outreach_messages_quality_flags` (`outreach-quality-flag.ts`) :
 * ceux-là sont des signaux DÉCLARÉS par un relecteur (faux fait, mauvais appel à
 * l'action) et ne lisent jamais le texte ; ce score LIT le brouillon que
 * l'utilisateur est en train d'écrire. Les deux ne couvrent pas les mêmes
 * critères, il n'y avait rien à réutiliser.
 */

export const MESSAGE_QUALITY_CRITERIA = [
  'length',
  'single_question',
  'personalization',
  'short_subject',
  'empty_variable',
  'jargon',
] as const
export type MessageQualityCriterion = (typeof MESSAGE_QUALITY_CRITERIA)[number]

export const MESSAGE_MAX_WORDS = 120
export const MESSAGE_SUBJECT_MAX_CHARS = 60

/** Le jargon vendeur qui trahit un message en série. Cherché en mots entiers. */
export const MESSAGE_JARGON: readonly string[] = [
  'solution innovante',
  'synergie',
  'synergies',
  'disruptif',
  'révolutionnaire',
  'best-in-class',
  'leader du marché',
  'clé en main',
  'valeur ajoutée',
  'game changer',
  'écosystème',
  'booster',
]

export type MessageQualityInput = {
  channel: 'email' | 'linkedin' | 'call' | 'task' | 'reminder'
  subject?: string | undefined
  body?: string | undefined
  /** Prénom, nom du compte, poste… : un de ces termes dans le corps = personnalisé. */
  personalization?: readonly string[] | undefined
}

export type MessageQualityScore =
  | { evaluated: false }
  | {
      evaluated: true
      passed: MessageQualityCriterion[]
      failed: MessageQualityCriterion[]
      /** Critères qui ne s'appliquent pas à ce canal (jamais comptés comme tenus ni ratés). */
      notEvaluable: MessageQualityCriterion[]
      /** Les mots de jargon trouvés, pour les nommer. */
      jargon: string[]
    }

const wordCount = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length
const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function scoreMessageQuality(input: MessageQualityInput): MessageQualityScore {
  if (input.channel !== 'email' && input.channel !== 'linkedin') return { evaluated: false }
  const body = input.body?.trim() ?? ''
  if (!body) return { evaluated: false }

  const passed: MessageQualityCriterion[] = []
  const failed: MessageQualityCriterion[] = []
  const notEvaluable: MessageQualityCriterion[] = []
  const check = (criterion: MessageQualityCriterion, ok: boolean): void => {
    ;(ok ? passed : failed).push(criterion)
  }

  check('length', wordCount(body) < MESSAGE_MAX_WORDS)
  // Une demande claire : exactement un point d'interrogation.
  check('single_question', (body.match(/\?/g) ?? []).length === 1)

  const lower = body.toLowerCase()
  const hasVariable = parseStepVariables(body).length > 0
  const hasTerm = (input.personalization ?? []).some(
    term => term.trim() !== '' && lower.includes(term.trim().toLowerCase()),
  )
  check('personalization', hasVariable || hasTerm)

  if (input.channel === 'email') {
    const subject = input.subject?.trim() ?? ''
    check('short_subject', subject.length > 0 && subject.length <= MESSAGE_SUBJECT_MAX_CHARS)
  } else {
    notEvaluable.push('short_subject')
  }

  // Une variable sans repli est vide si personne ne l'a remplie : le texte garde son `{{…}}`.
  check(
    'empty_variable',
    !parseStepVariables(`${input.subject ?? ''} ${body}`).some(variable => variable.fallback === null),
  )

  const jargon = MESSAGE_JARGON.filter(word => new RegExp(`(^|[^\\p{L}])${escape(word)}($|[^\\p{L}])`, 'iu').test(body))
  check('jargon', jargon.length === 0)

  return { evaluated: true, passed, failed, notEvaluable, jargon }
}
