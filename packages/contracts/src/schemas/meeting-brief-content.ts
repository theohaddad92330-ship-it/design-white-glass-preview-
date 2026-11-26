import type { DecisionRole } from './contact.js'
import type { MeetingBriefBlock, MeetingBriefBlockKey, MeetingBriefGround } from './meeting-brief.js'
import type { DiscoveryFamily } from './meeting-questions.js'

/**
 * #2319 — ce que le brief d'avant rendez-vous a appris : QUAND il se propose,
 * ce qu'il avoue ne pas savoir, ce qui reste à vérifier, et combien de temps il
 * prend à lire.
 *
 * Même règle que `meeting-brief.ts` : aucune phrase n'est rédigée ici. Tout ce
 * qui sort de ce fichier est une CLÉ fermée (l'écran la traduit) ou un nombre
 * calculé. Aucun modèle n'est appelé, aucun critère protégé n'entre.
 */

/* -------------------------------------------------------------------------- */
/*  #2319.21 — LE BRIEF PROPOSÉ À T-1 H                                        */
/* -------------------------------------------------------------------------- */

/**
 * #2319.21 — l'horizon du second déclencheur, en minutes. Le premier (T-24 h)
 * choisit les rendez-vous À PRÉPARER ; celui-ci dit qu'il est temps d'OUVRIR
 * le brief. Un réglage, un endroit (GA-26) : l'API (carte « à préparer ») et
 * l'écran (bandeau « Aujourd'hui ») le lisent tous deux ici.
 */
export const MEETING_PREP_IMMINENT_MINUTES = 60

/**
 * Le rendez-vous commence-t-il dans l'heure ? Un rendez-vous commencé, sans
 * date ou à la date illisible ne l'est pas — « imminent » ne se devine pas.
 */
export function isMeetingImminent(start: string | null | undefined, now: Date): boolean {
  if (!start) return false
  const at = Date.parse(start)
  if (Number.isNaN(at)) return false
  const delta = at - now.getTime()
  return delta >= 0 && delta <= MEETING_PREP_IMMINENT_MINUTES * 60_000
}

/* -------------------------------------------------------------------------- */
/*  #2319.25 — CINQ MINUTES DE LECTURE                                         */
/* -------------------------------------------------------------------------- */

/** #2319.25 — « le brief doit tenir en cinq minutes par défaut ». */
export const MEETING_BRIEF_READING_BUDGET_MINUTES = 5

/**
 * La vitesse de lecture silencieuse d'un adulte sur un texte informatif —
 * 238 mots par minute (Brysbaert, 2019, méta-analyse de 190 études). Une
 * vitesse plus haute rendrait le budget facile à tenir sur le papier.
 */
const READING_WORDS_PER_MINUTE = 238

/**
 * Le temps de lecture du brief, en minutes ARRONDIES AU-DESSUS — ou `null`
 * quand il n'y a rien à lire : un brief vide ne se lit pas « en 0 min ».
 */
export function estimateMeetingBriefReadingMinutes(input: {
  readonly blocks: readonly Pick<MeetingBriefBlock, 'lines' | 'note'>[]
  readonly questions: readonly string[]
}): number | null {
  const texts = [
    ...input.blocks.flatMap(block => [...block.lines, ...(block.note ? [block.note] : [])]),
    ...input.questions,
  ]
  const words = texts.reduce((total, text) => total + text.split(/\s+/).filter(Boolean).length, 0)
  return words === 0 ? null : Math.ceil(words / READING_WORDS_PER_MINUTE)
}

/* -------------------------------------------------------------------------- */
/*  #2319.31 — LES LIMITES DU BRIEF                                            */
/* -------------------------------------------------------------------------- */

/**
 * #2319.31 — « signaux ET limites ». Les signaux ont leur bloc (`moving`) ; les
 * limites sont ce que le brief n'a PAS pu lire, nommé plutôt que tu. Un brief
 * qui se tait sur ses trous se lit comme complet.
 */
export const MEETING_BRIEF_LIMITS = [
  /** L'historique n'a pas pu être lu (≠ « aucun échange »). */
  'history_unread',
  /** Aucun signal DATÉ sur l'entreprise. */
  'no_dated_signal',
  /** L'état de la relation n'est pas établi : pas d'objectif dérivé. */
  'relationship_unknown',
  /** L'entourage de la personne n'est pas résolu. */
  'relations_unknown',
  /** Le vivier n'a pas pu être lu. */
  'bench_unread',
  /** Les opportunités, besoins et missions n'ont pas pu être lus. */
  'linked_unread',
] as const
export type MeetingBriefLimit = (typeof MEETING_BRIEF_LIMITS)[number]

/** `unread` = on n'a PAS PU lire. Une liste lue et vide est `read`. */
type ReadState = 'read' | 'unread'

export function deriveMeetingBriefLimits(input: {
  readonly activities: ReadState
  /** Combien de signaux DATÉS — `null` quand la colonne est illisible. */
  readonly datedSignals: number | null
  readonly relationshipKnown: boolean
  readonly relationsKnown: boolean
  readonly bench: ReadState
  readonly linked: ReadState
}): MeetingBriefLimit[] {
  const holes: Record<MeetingBriefLimit, boolean> = {
    history_unread: input.activities === 'unread',
    no_dated_signal: input.datedSignals === null || input.datedSignals === 0,
    relationship_unknown: !input.relationshipKnown,
    relations_unknown: !input.relationsKnown,
    bench_unread: input.bench === 'unread',
    linked_unread: input.linked === 'unread',
  }
  return MEETING_BRIEF_LIMITS.filter(limit => holes[limit])
}

/* -------------------------------------------------------------------------- */
/*  #2319.38 — CE QUI RESTE À VÉRIFIER                                         */
/* -------------------------------------------------------------------------- */

/** Un point à vérifier pendant le rendez-vous — une clé, que l'écran traduit. */
export type MeetingBriefCheck =
  /** Un rôle de décision LU (fiche marquée hypothèse), pas établi. */
  | { readonly kind: 'probable_role'; readonly name: string; readonly role: DecisionRole }
  /** Un bloc du brief qui est une lecture, en tout ou partie. */
  | { readonly kind: 'inferred_block'; readonly block: MeetingBriefBlockKey }
  /** Le type de rendez-vous (donc l'objectif) n'est pas établi. */
  | { readonly kind: 'meeting_type' }

/**
 * #2319.38 — tout ce que le brief a DÉDUIT, rassemblé en une liste à vérifier.
 *
 * Elle ne s'invente pas de doute : un brief entièrement sourcé n'a rien à
 * vérifier, et la liste est vide. Elle ne se cite pas elle-même.
 */
export function deriveMeetingBriefToVerify(input: {
  readonly probableRoles: readonly { readonly name: string; readonly role: DecisionRole }[]
  readonly blocks: readonly { readonly key: MeetingBriefBlockKey; readonly ground: MeetingBriefGround }[]
  readonly meetingTypeKnown: boolean
}): MeetingBriefCheck[] {
  return [
    ...input.probableRoles
      .filter(person => person.name.trim().length > 0)
      .map(person => ({ kind: 'probable_role' as const, name: person.name.trim(), role: person.role })),
    ...input.blocks
      .filter(block => block.key !== 'to_verify')
      .filter(block => block.ground.kind === 'inferred' || block.ground.kind === 'mixed')
      .map(block => ({ kind: 'inferred_block' as const, block: block.key })),
    ...(input.meetingTypeKnown ? [] : [{ kind: 'meeting_type' as const }]),
  ]
}

/* -------------------------------------------------------------------------- */
/*  #2319.45 — LE CONTEXTE DE L'UTILISATEUR                                    */
/* -------------------------------------------------------------------------- */

/**
 * #2319.45 — les familles de questions que l'utilisateur TIENT déjà, d'après
 * ce que l'espace sait de sa relation à ce compte.
 *
 *  · au moins un échange enregistré sur ce compte ⇒ on ne redemande pas le
 *    contexte ;
 *  · un besoin ou une mission déjà liés ⇒ le projet est connu.
 *
 * `null` (on n'a pas pu lire) ne vaut RIEN de su : un connecteur en panne ne
 * doit pas faire sauter des questions.
 */
export function deriveAnsweredFamilies(input: {
  readonly exchangesOnAccount: number | null
  readonly linkedKinds: readonly ('opportunity' | 'need' | 'mission')[] | null
}): DiscoveryFamily[] {
  const answered: DiscoveryFamily[] = []
  if (input.exchangesOnAccount !== null && input.exchangesOnAccount > 0) answered.push('context')
  if (input.linkedKinds?.some(kind => kind === 'need' || kind === 'mission')) answered.push('project_mission')
  return answered
}
