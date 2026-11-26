import { renewalStatusSchema, type RenewalStatus } from '@bellum/contracts'
import {
  SOON_WINDOW_DAYS,
  isWithinDaysFromToday,
  toDayNumber,
  type AvailabilityBucket,
  type PlanningScale,
} from './planning'

/**
 * Théo missions-planning — LES FILTRES, LES PASTILLES ET LES VUES DU PLANNING.
 *
 * Pur : aucune dépendance sur la forme brute d'une mission. L'écran construit un
 * {@link PlanningMissionFacts} et ce fichier répond « est-ce qu'elle passe ? ».
 *
 * ⚠️ MULTI-SÉLECTION PARTOUT (décision de Louis, 23/10/2026) : plusieurs valeurs
 * d'un même critère sont un OU, des critères différents sont un ET. Une valeur
 * absente ne passe JAMAIS un filtre qui la demande — « non renseigné » n'est pas
 * une réponse à « Maëlle ».
 */

/** Ce que les filtres lisent d'une mission — jamais l'entité complète. */
export type PlanningMissionFacts = {
  startedOn: string | null
  endsOn: string | null
  renewalStatus: RenewalStatus | null
  account: string | null
  consultants: readonly string[]
  owner: string | null
  skills: readonly string[]
  clientTeams: readonly string[]
  businessUnit: string | null
  /** Calculée par l'appelant avec `availabilityBucket` — une seule dérivation (GA-26). */
  availabilityBucket: AvailabilityBucket
}

/**
 * La SITUATION d'une mission : quatre valeurs, jamais les quatorze statuts.
 *
 * Dérivée des DATES et du renouvellement, rien d'autre. Un démarrage futur prime
 * (la mission n'a pas commencé), puis un renouvellement ouvert, puis une fin
 * sous 30 jours. Une fin absente ne rend jamais « Fin proche ».
 */
export type MissionSituation = 'running' | 'renewal' | 'starting' | 'ending'
export const MISSION_SITUATIONS: readonly MissionSituation[] = ['running', 'renewal', 'starting', 'ending']

/** Un renouvellement OUVERT : on en parle, rien n'est signé ni refusé. */
const OPEN_RENEWALS: ReadonlySet<RenewalStatus> = new Set<RenewalStatus>([
  'feedback_demande',
  'discussion_en_cours',
  'reconduction_annoncee',
])

export function missionSituation(
  mission: Pick<PlanningMissionFacts, 'startedOn' | 'endsOn' | 'renewalStatus'>,
  today: string,
): MissionSituation {
  const start = toDayNumber(mission.startedOn)
  const base = toDayNumber(today)
  if (start !== null && base !== null && start > base) return 'starting'
  if (mission.renewalStatus !== null && OPEN_RENEWALS.has(mission.renewalStatus)) return 'renewal'
  // Une reconduction SIGNÉE : la date de fin n'en est plus une, la mission continue.
  if (mission.renewalStatus === 'renouvele') return 'running'
  if (isWithinDaysFromToday(mission.endsOn, today, SOON_WINDOW_DAYS)) return 'ending'
  return 'running'
}

/** Les quatre pastilles de la maquette. */
// #4197.4 — « Échéances sous 30 j · 60 j · 90 j » : trois fenêtres CUMULATIVES (comme `missions_ending_60/90`).
export const PLANNING_QUICK_CHIPS = ['ending', 'ending60', 'ending90', 'starting', 'noEnd', 'toCheck'] as const
export type PlanningQuickChip = (typeof PLANNING_QUICK_CHIPS)[number]

/**
 * `flagged` : la mission porte un conflit de planning (chevauchement, trou,
 * surallocation…) — calculé par `planning-conflicts`, jamais redéduit ici.
 */
export function matchesQuickChip(
  chip: PlanningQuickChip,
  mission: Pick<PlanningMissionFacts, 'startedOn' | 'endsOn'>,
  today: string,
  flagged: boolean,
): boolean {
  switch (chip) {
    case 'ending':
      return isWithinDaysFromToday(mission.endsOn, today, SOON_WINDOW_DAYS)
    case 'ending60':
      return isWithinDaysFromToday(mission.endsOn, today, 60)
    case 'ending90':
      return isWithinDaysFromToday(mission.endsOn, today, 90)
    case 'starting': {
      const start = toDayNumber(mission.startedOn)
      const base = toDayNumber(today)
      return start !== null && base !== null && start > base
    }
    case 'noEnd':
      return toDayNumber(mission.endsOn) === null
    case 'toCheck':
      return flagged
  }
}

/** Les critères, les plus pertinents d'abord : la fenêtre « Filtrer » replie les derniers. */
export const PLANNING_FILTER_KEYS = [
  'account',
  'consultant',
  'owner',
  'situation',
  'skill',
  'clientTeam',
  'availability',
  'businessUnit',
] as const
export type PlanningFilterKey = (typeof PLANNING_FILTER_KEYS)[number]
export type PlanningFilters = Record<PlanningFilterKey, readonly string[]>

export function emptyPlanningFilters(): PlanningFilters {
  return {
    account: [],
    consultant: [],
    owner: [],
    situation: [],
    skill: [],
    clientTeam: [],
    availability: [],
    businessUnit: [],
  }
}

export function countActiveFilters(filters: PlanningFilters): number {
  return PLANNING_FILTER_KEYS.filter(key => filters[key].length > 0).length
}

export function toggleValue(values: readonly string[], value: string): string[] {
  return values.includes(value) ? values.filter(other => other !== value) : [...values, value]
}

function anyOf(wanted: readonly string[], have: readonly (string | null)[]): boolean {
  if (wanted.length === 0) return true
  return have.some(value => value !== null && wanted.includes(value))
}

export function matchesPlanningFilters(
  mission: PlanningMissionFacts,
  filters: PlanningFilters,
  today: string,
): boolean {
  return (
    anyOf(filters.account, [mission.account]) &&
    anyOf(filters.consultant, mission.consultants) &&
    anyOf(filters.owner, [mission.owner]) &&
    anyOf(filters.situation, [missionSituation(mission, today)]) &&
    anyOf(filters.skill, mission.skills) &&
    anyOf(filters.clientTeam, mission.clientTeams) &&
    anyOf(filters.availability, [mission.availabilityBucket]) &&
    anyOf(filters.businessUnit, [mission.businessUnit])
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MES VUES — les filtres ET la fenêtre de dates (missions-planning.R7)
// ─────────────────────────────────────────────────────────────────────────────

export type PlanningGroupBy = 'mission' | 'account' | 'consultant'
const GROUP_BY: readonly PlanningGroupBy[] = ['mission', 'account', 'consultant']

export type PlanningView = {
  filters: PlanningFilters
  chips: readonly PlanningQuickChip[]
  /** Le mois d'ancrage de la fenêtre (`YYYY-MM`), `null` = celui d'aujourd'hui. */
  anchor: string | null
  scale: PlanningScale
  groupBy: PlanningGroupBy
  withFinished: boolean
}

/**
 * Une vue du planning vit dans le même registre que les vues de « Missions »
 * (`scope: 'missions'`), sous UNE clé à elle : la liste ne la lit pas comme un
 * critère, et le planning ne lit que cette clé.
 */
const RECORD_KEY = 'planning'

export function planningViewToSavedRecord(view: PlanningView): Record<string, unknown> {
  return {
    [RECORD_KEY]: {
      filters: Object.fromEntries(
        PLANNING_FILTER_KEYS.filter(key => view.filters[key].length > 0).map(key => [key, [...view.filters[key]]]),
      ),
      chips: [...view.chips],
      anchor: view.anchor,
      scale: view.scale,
      groupBy: view.groupBy,
      withFinished: view.withFinished,
    },
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : []
}

/** Défensif : une clé devenue inconnue relit « pas de critère » pour CETTE clé. Jamais d'exception. */
export function savedRecordToPlanningView(record: unknown): PlanningView | null {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return null
  const raw = (record as Record<string, unknown>)[RECORD_KEY]
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  const rawFilters =
    source.filters !== null && typeof source.filters === 'object' && !Array.isArray(source.filters)
      ? (source.filters as Record<string, unknown>)
      : {}
  const filters = emptyPlanningFilters()
  for (const key of PLANNING_FILTER_KEYS) filters[key] = stringList(rawFilters[key])
  const chips = stringList(source.chips).filter((chip): chip is PlanningQuickChip =>
    (PLANNING_QUICK_CHIPS as readonly string[]).includes(chip),
  )
  const groupBy = GROUP_BY.find(value => value === source.groupBy) ?? 'mission'
  return {
    filters,
    chips,
    anchor: typeof source.anchor === 'string' && /^\d{4}-\d{2}$/.test(source.anchor) ? source.anchor : null,
    scale: source.scale === 6 ? 6 : 4,
    groupBy,
    withFinished: source.withFinished === true,
  }
}

/** Une valeur de renouvellement lue du serveur, ou `null` si inconnue. */
export function knownRenewalStatus(value: unknown): RenewalStatus | null {
  const parsed = renewalStatusSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
