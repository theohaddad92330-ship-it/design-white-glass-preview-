import type { MeetingType } from './meeting-brief.js'

/**
 * #4424 — préparer un R1, un R2, et un pitch (décisions Louis 21/10/2026).
 *
 * Même règle que `meeting-brief.ts` : aucune phrase n'est rédigée ici. Ce
 * fichier rend des CLÉS fermées (le déroulé, les phrases du pitch) et des
 * SÉLECTIONS de ce que l'espace sait déjà (REX, compte rendu du R1). L'écran
 * traduit ; aucun modèle n'est appelé ; rien n'est inventé.
 *
 *  · Le R1 (cold call / premier rendez-vous) : ouverture → REX à citer →
 *    questions de découverte → proposition d'atelier.
 *  · Le R2 (l'atelier) : besoin client, cadrage, brief des opportunités,
 *    prochaine étape — et il REPREND ce que le R1 a appris, ou dit qu'il n'en
 *    connaît pas.
 *  · Le pitch vaut pour TOUS les types : 3 à 5 phrases, offre de l'ESN × enjeu
 *    du compte. Sans profil d'offre, il n'y a pas de pitch, et l'écran le dit.
 */

/* -------------------------------------------------------------------------- */
/*  LE DÉROULÉ                                                                 */
/* -------------------------------------------------------------------------- */

/** Les temps d'un rendez-vous préparé. Un enum n'insère jamais au milieu (GA-08). */
export const MEETING_FLOW_STEPS = [
  // R1
  'opening',
  'rex',
  'discovery',
  'workshop_proposal',
  // R2
  'client_need',
  'framing',
  'opportunities_brief',
  'next_step',
] as const
export type MeetingFlowStep = (typeof MEETING_FLOW_STEPS)[number]

const FLOW_BY_TYPE: Partial<Readonly<Record<MeetingType, readonly MeetingFlowStep[]>>> = {
  r1_discovery: ['opening', 'rex', 'discovery', 'workshop_proposal'],
  r2_workshop: ['client_need', 'framing', 'opportunities_brief', 'next_step'],
}

/**
 * #4424.2 / #4424.3 — le déroulé du rendez-vous. Seuls le R1 et le R2 en ont
 * un dédié ; les autres types n'en reçoivent pas un inventé (`[]`).
 */
export function deriveMeetingFlow(meetingType: MeetingType | null): MeetingFlowStep[] {
  return meetingType ? [...(FLOW_BY_TYPE[meetingType] ?? [])] : []
}

/* -------------------------------------------------------------------------- */
/*  LES REX À CITER                                                            */
/* -------------------------------------------------------------------------- */

/** Au-delà de trois retours d'expérience, on récite un catalogue. */
export const REX_MAX_ITEMS = 3

/**
 * Les catégories de document de Connaissances qui SONT des retours
 * d'expérience : la preuve client distillée (`RAG_CATEGORIES`) et le cas
 * client déposé comme support (`OUTREACH_ASSET_CATEGORIES`).
 */
const REX_DOCUMENT_CATEGORIES: ReadonlySet<string> = new Set(['client_proof', 'case_study'])

export function isRexDocumentCategory(category: string | null | undefined): boolean {
  return !!category && REX_DOCUMENT_CATEGORIES.has(category)
}

export type RexKind = 'mission' | 'document' | 'reference'
export type RexItem = { readonly kind: RexKind; readonly label: string; readonly date: string | null }
export type RexSelection =
  | { readonly kind: 'found'; readonly items: readonly RexItem[]; readonly observedAt: string | null }
  /** Aucun REX dans l'espace : l'écran invite à en ajouter dans Connaissances. */
  | { readonly kind: 'none' }

type Dated = { readonly label: string | null | undefined; readonly date: string | null | undefined }

function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function time(date: string | null): number {
  if (!date) return Number.NEGATIVE_INFINITY
  const at = Date.parse(date)
  return Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at
}

/**
 * #4424.2 — les REX à citer, choisis dans ce que l'espace sait DÉJÀ : missions
 * passées, documents de preuve client, références déclarées au profil.
 *
 * Les éléments DATÉS passent devant (le plus récent d'abord) ; les références
 * du profil, qui n'ont pas de date, ferment la liste. Un même libellé ne se
 * cite qu'une fois. Rien du tout ⇒ `none` — jamais un REX générique.
 */
export function selectRex(input: {
  readonly missions: readonly Dated[]
  readonly documents: readonly Dated[]
  readonly references: readonly (string | null | undefined)[]
}): RexSelection {
  const dated: RexItem[] = [
    ...input.missions.map(row => ({ kind: 'mission' as const, row })),
    ...input.documents.map(row => ({ kind: 'document' as const, row })),
  ]
    .map(({ kind, row }) => ({ kind, label: (row.label ?? '').trim(), date: row.date?.trim() || null }))
    .filter(item => item.label.length > 0)
    .sort((a, b) => time(b.date) - time(a.date))
  const references: RexItem[] = input.references
    .map(label => (label ?? '').trim())
    .filter(label => label.length > 0)
    .map(label => ({ kind: 'reference' as const, label, date: null }))

  const seen = new Set<string>()
  const items = [...dated, ...references]
    .filter(item => {
      const key = fold(item.label)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, REX_MAX_ITEMS)
  if (items.length === 0) return { kind: 'none' }
  const newest = items.filter(item => time(item.date) !== Number.NEGATIVE_INFINITY).map(item => item.date)
  return { kind: 'found', items, observedAt: newest[0] ?? null }
}

/* -------------------------------------------------------------------------- */
/*  CE QUE LE R1 A APPRIS                                                      */
/* -------------------------------------------------------------------------- */

export type DatedLabel = { readonly label: string; readonly date: string }

export type R1Recap =
  /** Le compte rendu le plus récent AVANT ce rendez-vous, et les besoins nés depuis. */
  | { readonly kind: 'found'; readonly recap: DatedLabel; readonly needsSince: readonly DatedLabel[] }
  /** Les comptes rendus ont été lus : aucun. Le R2 le DIT. */
  | { readonly kind: 'none' }
  /** On n'a pas pu lire — ce n'est pas « aucun R1 ». */
  | { readonly kind: 'unread' }

/**
 * #4424.3 — ce que le R1 a appris, repris dans le R2.
 *
 * Le R1 est le compte rendu de rendez-vous (note issue de la cascade post-RDV)
 * le plus récent dont la date PRÉCÈDE ce rendez-vous ; un compte rendu écrit
 * après ne peut pas l'avoir préparé. Les besoins retenus sont ceux créés depuis
 * ce compte rendu — c'est ce que la cascade y a fait naître. Sans date de
 * rendez-vous, tous les comptes rendus comptent : on ne devine pas une heure.
 */
export function deriveR1Recap(input: {
  readonly meetingStart: string | null
  readonly recaps: readonly DatedLabel[] | null
  readonly needs: readonly DatedLabel[] | null
}): R1Recap {
  if (input.recaps === null) return { kind: 'unread' }
  const start = input.meetingStart ? Date.parse(input.meetingStart) : Number.NaN
  const before = input.recaps
    .filter(recap => recap.label.trim().length > 0 && !Number.isNaN(Date.parse(recap.date)))
    .filter(recap => Number.isNaN(start) || Date.parse(recap.date) < start)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  const recap = before[0]
  if (!recap) return { kind: 'none' }
  const from = Date.parse(recap.date.slice(0, 10))
  const needsSince = (input.needs ?? [])
    .filter(need => need.label.trim().length > 0 && Date.parse(need.date) >= from)
    .filter(need => Number.isNaN(start) || Date.parse(need.date) < start)
  return { kind: 'found', recap, needsSince }
}

/* -------------------------------------------------------------------------- */
/*  LE PITCH                                                                   */
/* -------------------------------------------------------------------------- */

export const MEETING_PITCH_MIN_SENTENCES = 3
export const MEETING_PITCH_MAX_SENTENCES = 5

/** Les phrases du pitch — des clés que l'écran traduit, avec leurs valeurs. */
export const MEETING_PITCH_SENTENCES = [
  'who',
  'stake',
  'answer',
  'answer_no_stake',
  'proof',
  'ask',
  'ask_workshop',
  'ask_next_step',
] as const
export type MeetingPitchSentenceKey = (typeof MEETING_PITCH_SENTENCES)[number]
export type MeetingPitchSentence = {
  readonly key: MeetingPitchSentenceKey
  readonly values: Readonly<Record<string, string>>
}
export type MeetingPitch =
  | { readonly kind: 'ready'; readonly sentences: readonly MeetingPitchSentence[] }
  /** Ni nom d'ESN ni offre au profil : pas de pitch, et l'écran le dit. */
  | { readonly kind: 'no_profile' }

/** Au-delà de trois offres, la phrase devient une plaquette. */
const PITCH_MAX_OFFERS = 3

/**
 * #4424.4 — le pitch de réunion, pour TOUS les types : qui on est (profil de
 * l'espace), l'enjeu lu au dossier du compte, en quoi l'offre y répond, un REX
 * s'il y en a un, et la demande de fin — l'atelier pour un R1, la suite pour un
 * R2, un échange pour les autres. Toujours entre trois et cinq phrases.
 */
export function deriveMeetingPitch(input: {
  readonly esnName: string | null | undefined
  readonly offers: readonly (string | null | undefined)[]
  readonly stakes: readonly string[]
  readonly rex: RexItem | null
  readonly accountName: string | null | undefined
  readonly meetingType: MeetingType | null
}): MeetingPitch {
  const esn = (input.esnName ?? '').trim()
  const offers = [...new Set(input.offers.map(offer => (offer ?? '').trim()).filter(Boolean))].slice(
    0,
    PITCH_MAX_OFFERS,
  )
  if (!esn || offers.length === 0) return { kind: 'no_profile' }
  const offerList = offers.join(', ')
  const stake = input.stakes.map(value => value.trim()).find(Boolean) ?? null
  const account = (input.accountName ?? '').trim()

  const sentences: MeetingPitchSentence[] = [{ key: 'who', values: { esn, offers: offerList } }]
  if (stake) {
    if (account) sentences.push({ key: 'stake', values: { account, stake } })
    sentences.push({ key: 'answer', values: { offer: offers[0] ?? offerList, stake } })
  } else {
    sentences.push({ key: 'answer_no_stake', values: { offers: offerList } })
  }
  if (input.rex) sentences.push({ key: 'proof', values: { rex: input.rex.label } })
  sentences.push({
    key:
      input.meetingType === 'r1_discovery'
        ? 'ask_workshop'
        : input.meetingType === 'r2_workshop'
          ? 'ask_next_step'
          : 'ask',
    values: {},
  })
  return { kind: 'ready', sentences: sentences.slice(0, MEETING_PITCH_MAX_SENTENCES) }
}
