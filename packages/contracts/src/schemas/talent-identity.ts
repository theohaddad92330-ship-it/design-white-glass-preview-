import { z } from 'zod'
import type { TalentDocument } from './talent.js'
import type {
  TalentDuplicateMatch,
  TalentDuplicateReason,
  TalentIdentityConflictField,
  TalentIdentitySignal,
} from './talent-duplicates.js'

/**
 * #2327 — LAU-FINAL-068 : la résolution d'identité d'un talent, AU-DELÀ de la
 * détection (`talent-duplicates.ts`).
 *
 * Ce que le chapitre demande et ce que la doctrine permet ne coïncident pas
 * entièrement, et le fichier le dit plutôt que de le cacher :
 *
 *  - **les sept états** sont livrés — cinq se DÉRIVENT des propositions, deux
 *    (`updated`, `ignored`) naissent d'une décision humaine ;
 *  - **quatre des cinq actions** sont ouvertes. « Fusionner » ne l'est PAS :
 *    `c37_fusion_doublons` — « on PROPOSE un rapprochement, on ne fusionne
 *    JAMAIS » — tranche contre, et la décision de la lever appartient à Louis.
 *    Aucune des quatre n'efface ni n'écrase quoi que ce soit : « mettre à jour
 *    une fiche » COPIE des documents, elle ne réécrit aucun champ ;
 *  - **toute décision s'annule** — c'est la part livrable de « une fusion peut
 *    être annulée » tant que la fusion elle-même n'existe pas.
 */

export const TALENT_IDENTITY_STATES = [
  'resolved', //           une clé forte, sans contradiction : c'est cette fiche
  'probable_duplicate', // une clé moyenne : à confirmer
  'ambiguous', //          une clé faible, ou plusieurs fiches possibles
  'new', //                personne ne ressemble — ou un humain l'a affirmé
  'updated', //            le dépôt a complété une fiche existante
  'conflicting', //        une clé forte ET une donnée qui la contredit
  'ignored', //            un humain a écarté la proposition
] as const
export const talentIdentityStateSchema = z.enum(TALENT_IDENTITY_STATES)
export type TalentIdentityState = (typeof TALENT_IDENTITY_STATES)[number]

/** Au-dessus, une clé désigne la personne (adresse, identifiant, fichier). */
const STRONG_CONFIDENCE = 0.9
/** Au-dessus, une clé vaut une question sérieuse — en dessous, un indice. */
const PROBABLE_CONFIDENCE = 0.6

/**
 * #2327.18 — l'état que DISENT les propositions, avant toute décision.
 *
 * Jamais `resolved` sur une clé faible : le nom seul reste `ambiguous`, quelle
 * que soit la liste (NO-GO du chapitre). Deux fiches désignées à la fois ne
 * sont jamais « résolues » : on ne sait pas laquelle.
 */
export function resolveTalentIdentityState(
  matches: readonly Pick<TalentDuplicateMatch, 'talentId' | 'confidence' | 'conflicts'>[],
): TalentIdentityState {
  if (matches.length === 0) return 'new'
  const strong = matches.filter(match => match.confidence >= STRONG_CONFIDENCE)
  if (strong.length > 0) {
    const targets = new Set(strong.map(match => match.talentId))
    if (targets.size > 1 || strong.some(match => match.conflicts.length > 0)) return 'conflicting'
    return 'resolved'
  }
  const probable = matches.filter(match => match.confidence >= PROBABLE_CONFIDENCE)
  if (probable.length === 1) return 'probable_duplicate'
  return 'ambiguous'
}

/**
 * #2183.13 — LE PALIER DE CONFIANCE À LA CRÉATION D'UNE FICHE.
 *
 * `resolveTalentIdentityState` rend `new` dès que `matches.length === 0` —
 * « aucune fiche ne ressemble ». Sur un candidat sans AUCUN signal d'identité
 * (ni nom, ni e-mail, ni téléphone, ni expérience lue), ce n'est pas une
 * conclusion : c'est l'absence de matière à comparer. Le dépôt AUTOMATIQUE
 * (`intakeAutomatic`, sans humain devant l'écran) créait alors la fiche en
 * silence sur ce simple constat — la création n'avait pas de palier de
 * confiance, seulement l'absence de doublon.
 *
 * Cette fonction ne remplace PAS `resolveTalentIdentityState` : elle nomme le
 * cas qu'il ne voit pas, pour que l'appelant le fasse rejoindre la revue
 * humaine (état `ambiguous`, déjà ouvert) plutôt que la création directe.
 */
export function hasIdentitySignal(candidate: {
  fullName: string | null
  email: string | null
  phone: string | null
  experienceKeys?: readonly string[]
}): boolean {
  return Boolean(
    candidate.fullName?.trim() ||
    candidate.email?.trim() ||
    candidate.phone?.trim() ||
    (candidate.experienceKeys && candidate.experienceKeys.length > 0),
  )
}

/**
 * #2327.20 — les actions OUVERTES sur une proposition.
 *
 * ⚠️ « fusionner » est ABSENTE, et c'est une décision en attente, pas un oubli
 * (`c37_fusion_doublons`). Si elle est levée, elle s'AJOUTE en fin de liste
 * (GA-08) — et la contrainte SQL `talent_identity_decisions_action_check`
 * s'élargit avant le code qui l'écrit (GA-11 / GA-12).
 */
export const TALENT_DUPLICATE_ACTIONS = [
  'keep_separate', //       « ce n'est pas la même personne » — mémorisé
  'update_existing', //     le CV rejoint la fiche existante, rien n'est écrasé
  'ignore', //              écartée pour l'instant — revient sur un signal plus fort
  'assign_to_recruiter', // confiée à quelqu'un de l'espace
] as const
export const talentDuplicateActionSchema = z.enum(TALENT_DUPLICATE_ACTIONS)
export type TalentDuplicateAction = (typeof TALENT_DUPLICATE_ACTIONS)[number]

/** Une décision sur une paire, prise depuis la fiche `:id`. */
export const talentDuplicateDecisionSchema = z
  .object({
    otherTalentId: z.string().guid(),
    action: talentDuplicateActionSchema,
    assigneeId: z.string().guid().nullable().default(null),
  })
  .strict()
  .refine(input => input.action !== 'assign_to_recruiter' || input.assigneeId !== null, {
    message: 'Attribuer une proposition demande quelqu’un à qui l’attribuer.',
    path: ['assigneeId'],
  })
export type TalentDuplicateDecisionInput = z.infer<typeof talentDuplicateDecisionSchema>

/** #2327.18 — l'état après une décision humaine. */
export function stateAfterDecision(action: TalentDuplicateAction, derived: TalentIdentityState): TalentIdentityState {
  switch (action) {
    case 'update_existing':
      return 'updated'
    case 'ignore':
      return 'ignored'
    case 'keep_separate':
      // Un humain a affirmé que ce sont deux personnes : pour cette paire, la
      // fiche est NOUVELLE.
      return 'new'
    case 'assign_to_recruiter':
      // Confier la question ne la tranche pas.
      return derived
  }
}

/** Une décision telle que l'écran la lit. */
export type TalentDuplicateDecision = {
  id: string
  talentId: string
  otherTalentId: string | null
  action: TalentDuplicateAction
  state: TalentIdentityState
  /** #2327.21 — la RÈGLE qui avait rapproché la paire au moment de décider. */
  reason: TalentDuplicateReason | null
  assigneeId: string | null
  assigneeName: string | null
  decidedByName: string | null
  decidedAt: string
  /** #2327.25 — une décision s'annule ; l'annulation est datée, jamais effacée. */
  undoneAt: string | null
}

/** Une proposition, avec sa phrase et la décision en cours s'il y en a une. */
export type TalentDuplicateProposal = TalentDuplicateMatch & {
  decision: TalentDuplicateDecision | null
}

/** Les doublons possibles d'une fiche existante. */
export type TalentDuplicatesReport = {
  state: TalentIdentityState
  items: TalentDuplicateProposal[]
}

/** #2327.19 — les champs mis côte à côte avant de décider. */
export const TALENT_COMPARED_FIELDS = ['fullName', 'email', 'phone', 'publicProfileUrl', 'title', 'location'] as const
export type TalentComparedField = (typeof TALENT_COMPARED_FIELDS)[number]
type TalentComparable = Partial<Record<TalentComparedField, string | null>>

function comparable(field: TalentComparedField, value: string | null | undefined): string {
  if (!value) return ''
  const text = value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  if (field === 'phone') {
    const only = text.replace(/\D/g, '')
    return only.length > 9 ? only.slice(-9) : only
  }
  if (field === 'publicProfileUrl') {
    return text
      .replace(/^[a-z]+:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '')
  }
  return text
}

/**
 * #2327.19 — identiques, différents, et renseignés d'UN SEUL côté. Les deux
 * derniers ne se confondent pas : un champ absent n'est pas un désaccord.
 */
export function compareTalentFields(
  a: TalentComparable,
  b: TalentComparable,
): { identical: TalentComparedField[]; different: TalentComparedField[]; oneSided: TalentComparedField[] } {
  const identical: TalentComparedField[] = []
  const different: TalentComparedField[] = []
  const oneSided: TalentComparedField[] = []
  for (const field of TALENT_COMPARED_FIELDS) {
    const left = comparable(field, a[field])
    const right = comparable(field, b[field])
    if (left === '' && right === '') continue
    if (left === '' || right === '') oneSided.push(field)
    else if (left === right) identical.push(field)
    else different.push(field)
  }
  return { identical, different, oneSided }
}

/** Une fiche, telle que la comparaison la montre. */
export type TalentIdentityCard = {
  id: string
  fullName: string | null
  email: string | null
  phone: string | null
  publicProfileUrl: string | null
  title: string | null
  location: string | null
  reviewStatus: string
  createdAt: string
}

/** #2327.21 — une ligne d'historique : avant, après, source, auteur, date, règle. */
export type TalentIdentityHistoryEntry = {
  field: string
  oldValue: string | null
  newValue: string | null
  source: string
  actorName: string | null
  at: string
  rule: string | null
}

/** #2327.19 — tout ce qu'il faut voir avant de décider d'une paire. */
export type TalentDuplicatePreview = {
  a: TalentIdentityCard
  b: TalentIdentityCard
  /** `null` quand plus rien ne rapproche les deux fiches. */
  match: TalentDuplicateMatch | null
  fields: ReturnType<typeof compareTalentFields>
  documents: { a: TalentDocument[]; b: TalentDocument[] }
  history: { a: TalentIdentityHistoryEntry[]; b: TalentIdentityHistoryEntry[] }
  /**
   * Les conséquences, CHIFFRÉES quand elles le sont : « mettre à jour » copie
   * `documentsCopiedOnUpdate` documents de B vers A et n'écrase AUCUN champ.
   * `mergeAvailable` reste `false` tant que `c37_fusion_doublons` tient.
   */
  consequences: { documentsCopiedOnUpdate: number; fieldsOverwritten: 0; mergeAvailable: false }
  decisions: TalentDuplicateDecision[]
}

type Locale = 'fr' | 'en'

const SIGNAL_LABELS: Record<Locale, Record<Exclude<TalentIdentitySignal, 'experiences'>, string>> = {
  fr: {
    external_id: 'le même identifiant dans un outil connecté',
    email: 'le même e-mail',
    document: 'le même fichier',
    public_profile: 'le même profil public',
    phone: 'le même téléphone',
    name: 'le même nom',
    employer: 'le même employeur',
    location: 'la même localisation',
  },
  en: {
    external_id: 'the same ID in a connected tool',
    email: 'the same email',
    document: 'the same file',
    public_profile: 'the same public profile',
    phone: 'the same phone number',
    name: 'the same name',
    employer: 'the same employer',
    location: 'the same location',
  },
}

const CONFLICT_LABELS: Record<Locale, Record<TalentIdentityConflictField, string>> = {
  fr: { name: 'le nom', email: 'l’e-mail', phone: 'le téléphone', public_profile: 'le profil public' },
  en: { name: 'the name', email: 'the email', phone: 'the phone number', public_profile: 'the public profile' },
}

const NUMBERS: Record<Locale, string[]> = {
  fr: ['zéro', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix'],
  en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'],
}

function experiencesLabel(count: number, locale: Locale): string {
  const word = NUMBERS[locale][count] ?? String(count)
  if (locale === 'fr') return count > 1 ? `${word} expériences identiques` : `${word} expérience identique`
  return count > 1 ? `${word} identical experiences` : `${word} identical experience`
}

function joinList(items: string[], locale: Locale): string {
  if (items.length <= 1) return items.join('')
  const last = items[items.length - 1]
  return `${items.slice(0, -1).join(', ')} ${locale === 'fr' ? 'et' : 'and'} ${last}`
}

/**
 * #2327.26 — la phrase que Laura (et l'écran) disent d'un rapprochement.
 *
 * Trois registres, jamais confondus : une clé qui vaut une question sérieuse
 * (« semblent appartenir à la même personne »), un indice (« c'est un indice,
 * pas une preuve »), et le nom SEUL, dit explicitement insuffisant — c'est le
 * NO-GO du chapitre. Aucune probabilité n'est énoncée.
 */
export function explainTalentDuplicate(
  match: Pick<TalentDuplicateMatch, 'signals' | 'sharedExperiences' | 'conflicts' | 'confidence'>,
  locale: Locale,
): string {
  const fr = locale === 'fr'
  if (match.signals.length === 1 && match.signals[0] === 'name') {
    return fr
      ? 'Ces deux fiches portent le même nom, et rien d’autre ne concorde : ce n’est pas suffisant pour dire qu’il s’agit de la même personne.'
      : 'These two records share the same name and nothing else matches: that is not enough to say they are the same person.'
  }
  const parts = match.signals.map(signal =>
    signal === 'experiences' ? experiencesLabel(match.sharedExperiences, locale) : SIGNAL_LABELS[locale][signal],
  )
  const shared = joinList(parts, locale)
  let sentence: string
  if (match.confidence >= PROBABLE_CONFIDENCE) {
    sentence = fr
      ? `Ces deux fiches semblent appartenir à la même personne parce qu’elles partagent ${shared}.`
      : `These two records seem to belong to the same person because they share ${shared}.`
  } else {
    sentence = fr
      ? `Ces deux fiches partagent ${shared} : c’est un indice, pas une preuve qu’il s’agit de la même personne.`
      : `These two records share ${shared}: that is a hint, not proof that they are the same person.`
  }
  if (match.conflicts.length === 0) return sentence
  const conflicts = joinList(
    match.conflicts.map(field => CONFLICT_LABELS[locale][field]),
    locale,
  )
  const plural = match.conflicts.length > 1
  return fr
    ? `${sentence} À vérifier : ${conflicts} ${plural ? 'diffèrent' : 'diffère'}.`
    : `${sentence} Check: ${conflicts} ${plural ? 'differ' : 'differs'}.`
}
