import type { Submission } from '@bellum/contracts'

/**
 * Théo C projects-presentations.R1 — QUATRE états à l'écran, les sorties dans le filtre.
 *
 * Le contrat garde six étapes et vingt et un sous-statuts (rien n'est migré, rien ne se perd) ; l'écran
 * Présentations en tire les quatre libellés de Théo — Présélection · Présenté · Entretien client · Retenu —,
 * plus « À présenter » (le dossier est prêt, rien n'est parti) et les cinq SORTIES (A4) : refusé, retiré,
 * sans réponse, converti en mission, archivé. Une sortie n'est jamais un état d'avancement : la liste par
 * défaut « En cours » ne la montre pas, le filtre « Tous les états » la retrouve, motif compris.
 */
export const PRESENTATION_STATES = [
  'preselection',
  'to_present',
  'presented',
  'client_interview',
  'retained',
  'declined',
  'withdrawn',
  'no_response',
  'converted',
  'archived',
] as const
export type PresentationState = (typeof PRESENTATION_STATES)[number]

const EXITS: readonly PresentationState[] = ['declined', 'withdrawn', 'no_response', 'converted', 'archived']

type StateInput = Pick<Submission, 'stage' | 'substatus'>

export function presentationState({ stage, substatus }: StateInput): PresentationState {
  // Les sous-statuts de sortie priment : « converti » et « archivé » vivent sur l'étape `accepted`,
  // « sans réponse » sur `submitted` — l'étape seule les ferait passer pour un avancement.
  if (substatus === 'converted_to_mission') return 'converted'
  if (substatus === 'archived') return 'archived'
  if (substatus === 'no_response') return 'no_response'
  switch (stage) {
    case 'rejected':
      return 'declined'
    case 'withdrawn':
      return 'withdrawn'
    case 'accepted':
      return 'retained'
    case 'interview':
      return 'client_interview'
    case 'submitted':
      return 'presented'
    case 'shortlisted':
      return substatus === 'ready_to_present' || substatus === 'to_validate' ? 'to_present' : 'preselection'
  }
}

export function isPresentationInProgress(state: PresentationState): boolean {
  return !EXITS.includes(state)
}

export type PresentationFunnel = {
  /** `null` = aucune présentation sur la fenêtre : « pas encore mesurable », jamais « 0 ». */
  preselected: number | null
  presented: number | null
  presentedWithoutReply: number | null
  interviews: number | null
  interviewsThisWeek: number | null
  retained: number | null
  missionsToPrepare: number | null
}

const DAY_MS = 86_400_000
const WINDOW_DAYS = 30
const WEEK_DAYS = 7

function within(value: string | null, now: Date, days: number): boolean {
  if (!value) return false
  const at = new Date(value).getTime()
  return Number.isFinite(at) && now.getTime() - at <= days * DAY_MS && at <= now.getTime() + DAY_MS
}

const orNull = (count: number): number | null => (count > 0 ? count : null)

/** Théo A1 — les quatre chiffres de l'entonnoir, sur 30 jours. Un absent reste `null`, jamais « 0 ». */
export function presentationFunnel(items: readonly Submission[], now: Date): PresentationFunnel {
  let preselected = 0
  let presented = 0
  let withoutReply = 0
  let interviews = 0
  let interviewsThisWeek = 0
  let retained = 0
  let toPrepare = 0
  for (const item of items) {
    const state = presentationState(item)
    if ((state === 'preselection' || state === 'to_present') && within(item.createdAt, now, WINDOW_DAYS))
      preselected += 1
    if (within(item.submittedAt, now, WINDOW_DAYS)) {
      presented += 1
      if (state === 'no_response' || (state === 'presented' && item.firstFeedbackAt === null)) withoutReply += 1
    }
    if (state === 'client_interview') {
      interviews += 1
      if (within(item.stageEnteredAt, now, WEEK_DAYS)) interviewsThisWeek += 1
    }
    if (state === 'retained' || state === 'converted') {
      retained += 1
      if (state === 'retained') toPrepare += 1
    }
  }
  return {
    preselected: orNull(preselected),
    presented: orNull(presented),
    presentedWithoutReply: orNull(withoutReply),
    interviews: orNull(interviews),
    interviewsThisWeek: orNull(interviewsThisWeek),
    retained: orNull(retained),
    missionsToPrepare: orNull(toPrepare),
  }
}

export type PresentationOwnerRow = { owner: string; inProgress: number; retained: number }

/** DOM.2 — chiffres par commercial sous l'entonnoir. Pas de porteur = pas de ligne (rien d'inventé). */
export function presentationsByOwner(items: readonly Submission[]): PresentationOwnerRow[] {
  const rows = new Map<string, PresentationOwnerRow>()
  for (const item of items) {
    if (!item.ownerName) continue
    const state = presentationState(item)
    if (!isPresentationInProgress(state)) continue
    const row = rows.get(item.ownerName) ?? { owner: item.ownerName, inProgress: 0, retained: 0 }
    if (state === 'retained') row.retained += 1
    else row.inProgress += 1
    rows.set(item.ownerName, row)
  }
  return [...rows.values()]
}
