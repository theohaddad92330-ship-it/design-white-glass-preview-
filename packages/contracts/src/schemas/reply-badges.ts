import { z } from 'zod'

/**
 * #3764 (BEL-LAU-1009) — LE VOCABULAIRE DES BADGES DES RÉPONSES DE LAURA.
 *
 * Une situation = un badge. Les réponses disaient la même chose de dix façons
 * (« non mesuré », « données partielles », « à confirmer »…) ; ce fichier
 * ferme la liste. Deux niveaux, jamais mélangés :
 *   - {@link REPLY_BADGE_CODES} : dix badges de STATUT, ceux de l'issue ;
 *   - {@link REPLY_LABEL_FAMILIES} : quatre familles de libellés courts
 *     (confiance, fraîcheur, preuve, action), chacune une petite
 *     échelle fermée.
 * Les libellés FR/EN vivent dans `apps/web/src/i18n/locales/*\/chat.json`
 * (`replyBadges.*`, un seul endroit — GA-26) ; ici : les codes, les tons, et la
 * dérivation déterministe qui garantit « mêmes situations, mêmes badges ».
 *
 * Doctrine : une valeur absente ne produit AUCUN badge (« non mesuré » n'est
 * jamais un libellé, jamais « 0 ») ; aucune probabilité ; aucun nom de
 * fournisseur ; un badge nomme un état, il ne promet rien.
 */

export const REPLY_BADGE_CODES = [
  'mapping_partial',
  'to_qualify',
  'priority',
  'to_watch',
  'qualification_needed',
  'historical_signal',
  'current_signal_verified',
  'scope_to_confirm',
  'no_current_proof',
  'action_to_validate',
] as const
export const replyBadgeCodeSchema = z.enum(REPLY_BADGE_CODES)
export type ReplyBadgeCode = z.infer<typeof replyBadgeCodeSchema>

type ReplyBadgeTone = 'neutral' | 'info' | 'success' | 'warning'

/** Le ton de chaque badge — une seule lecture visuelle par code. */
export const REPLY_BADGE_TONES: Readonly<Record<ReplyBadgeCode, ReplyBadgeTone>> = {
  mapping_partial: 'warning',
  to_qualify: 'info',
  priority: 'success',
  to_watch: 'info',
  qualification_needed: 'warning',
  historical_signal: 'neutral',
  current_signal_verified: 'success',
  scope_to_confirm: 'warning',
  no_current_proof: 'warning',
  action_to_validate: 'info',
}

/**
 * Les quatre familles de libellés courts, chacune une échelle fermée.
 *
 * #3764 / #3861 (Louis, 11/10) — il n'y a PAS de famille « complétude » : la ligne « Complétude »
 * sous une réponse de Laura n'est jamais affichée (#3764 gagne). Le fait qu'elle disait — des sources
 * non consultées — a son badge nommé (`qualification_needed`) et son panneau « Voir la source ».
 */
export const REPLY_LABEL_FAMILIES = {
  confidence: ['high', 'medium', 'low'],
  freshness: ['current', 'recent', 'dated'],
  proof: ['verified', 'declared', 'inferred'],
  action: ['draft', 'proposal', 'to_validate'],
} as const
export type ReplyLabelFamily = keyof typeof REPLY_LABEL_FAMILIES
export type ReplyLabelValue<F extends ReplyLabelFamily> = (typeof REPLY_LABEL_FAMILIES)[F][number]

/** Plus de badges que ça sur une réponse = un mur : on garde les plus utiles. */
export const REPLY_BADGES_MAX = 3

/** Ordre de service : ce qui change la lecture d'abord. */
const BADGE_ORDER: readonly ReplyBadgeCode[] = [
  'no_current_proof',
  'mapping_partial',
  'scope_to_confirm',
  'qualification_needed',
  'action_to_validate',
  'historical_signal',
  'current_signal_verified',
  'priority',
  'to_watch',
  'to_qualify',
]

/** Seuils de fraîcheur, en jours — le même pour toutes les réponses. */
const FRESH_DAYS = 30
const DATED_DAYS = 180
const DAY_MS = 86_400_000

/**
 * Ce que le pied d'une réponse SAIT. Chaque champ absent (`null`/`undefined`)
 * veut dire « on ne sait pas » et ne produit aucun badge.
 */
export interface ReplyBadgeSituation {
  /** Date ISO de la source la plus ANCIENNE (le maillon faible). */
  oldestAsOf?: string | null
  /** Nombre de sources lues par les outils pendant ce tour. */
  sourceCount?: number | null
  /** Le tour a lu au moins un outil. `false` = aucune lecture, `null` = on ne sait pas. */
  toolsRead?: boolean | null
  /**
   * #4071.3 (recette R6 14/10) — les faits du compte et la mémoire de l'espace sont
   * injectés SERVER-SIDE (jamais par un appel d'outil, cf. `AccountFactsService` /
   * `workspaceRecallContextFor`) : un tour qui n'a lu AUCUN outil peut malgré tout
   * s'appuyer sur une preuve réelle. `true` = au moins un des deux a été fourni ;
   * ne change rien quand `toolsRead` n'est pas `false`.
   */
  contextFactsRead?: boolean | null
  /** Ce que Laura n'a pas pu consulter (noms). */
  notConsultedCount?: number | null
  /** Une action attend le geste de l'utilisateur. */
  pendingAction?: boolean
  /** Un périmètre a été déduit et attend confirmation. */
  scopeUnconfirmed?: boolean
  /** La cartographie du périmètre est incomplète. */
  mappingPartial?: boolean
  /** Maintenant — injecté, jamais lu dans la fonction (déterminisme). */
  now: Date
}

export interface ReplyBadgeLabels {
  /** Les badges de statut, dans l'ordre de service, au plus {@link REPLY_BADGES_MAX}. */
  badges: ReplyBadgeCode[]
  freshness: ReplyLabelValue<'freshness'> | null
}

/**
 * La MÊME situation donne TOUJOURS les mêmes badges — c'est la règle de
 * l'issue, et c'est pour ça que la dérivation est une fonction pure.
 */
export function deriveReplyBadges(situation: ReplyBadgeSituation): ReplyBadgeLabels {
  const found = new Set<ReplyBadgeCode>()

  const asOfMs = situation.oldestAsOf ? Date.parse(situation.oldestAsOf) : Number.NaN
  const ageDays = Number.isFinite(asOfMs) ? (situation.now.getTime() - asOfMs) / DAY_MS : null
  let freshness: ReplyLabelValue<'freshness'> | null = null
  if (ageDays !== null && ageDays >= 0) {
    freshness = ageDays <= FRESH_DAYS ? 'current' : ageDays <= DATED_DAYS ? 'recent' : 'dated'
    if (freshness === 'dated') found.add('historical_signal')
    if (freshness === 'current') found.add('current_signal_verified')
  }

  // Aucune lecture d'outil, ou des outils lus sans source : rien d'actuel ne prouve la réponse.
  // Sauf si des faits du compte / la mémoire de l'espace ont été injectés server-side (#4071.3) :
  // cette preuve-là ne passe jamais par un outil, mais c'est bien une preuve actuelle.
  if (
    (situation.toolsRead === false && !situation.contextFactsRead) ||
    (situation.toolsRead === true && situation.sourceCount === 0)
  ) {
    found.add('no_current_proof')
    found.delete('current_signal_verified')
  }

  if (situation.mappingPartial) found.add('mapping_partial')
  if (situation.scopeUnconfirmed) found.add('scope_to_confirm')
  if (situation.pendingAction) found.add('action_to_validate')

  const missing = situation.notConsultedCount ?? 0
  if (missing > 0 && !situation.mappingPartial) found.add('qualification_needed')

  return {
    badges: BADGE_ORDER.filter(code => found.has(code)).slice(0, REPLY_BADGES_MAX),
    freshness,
  }
}
