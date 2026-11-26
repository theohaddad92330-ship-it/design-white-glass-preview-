import {
  SHARED_ALL,
  SHARED_MESSAGE_LEARNING_SIGNALS,
  type SharedCaseDimension,
  type SharedMessageLearningSignal,
  classifyCommercialOutcome,
  classifyRuleOutcome,
  poolSharedCells,
  regionKeyOfAddress,
  sectorKeyOfNaf,
  sizeBandOfEmployees,
  skillDomainOfJobTitle,
  type MarketPatternSkillDomain,
} from '@bellum/contracts'

/**
 * P05 (#3246, lot 09/10) — LES CELLULES DE LA BASE ANONYME COMMUNE.
 *
 * Fonctions pures, séparées de la lecture DB (même découpage que
 * `similar-cases.ts`) : elles reçoivent des comptages DÉJÀ groupés par espace
 * et rendent des cellules sans aucun identifiant d'espace, chacune portée par
 * au moins trois espaces (`poolSharedCells`, c92_base_anonyme_commune).
 */

/** Le segment d'un compte et ses agrégats : (secteur, taille), (secteur, toutes), (tous, taille), (tous, toutes). */
function segmentsOf(nafCode: string | null, employees: string | null): Array<[string, string]> {
  const sector = sectorKeyOfNaf(nafCode)
  const size = sizeBandOfEmployees(employees)
  const sectors = sector ? [SHARED_ALL, sector] : [SHARED_ALL]
  const sizes: string[] = size ? [SHARED_ALL, size] : [SHARED_ALL]
  return sectors.flatMap(sectorKey => sizes.map((sizeBand): [string, string] => [sectorKey, sizeBand]))
}

export type ActionOutcomeSourceRow = {
  workspaceId: string
  /** La valeur de la dimension (étape de cadence, route, niveau d'effort) — un jeton. */
  value: string | null
  nafCode: string | null
  employees: string | null
  outcome: string | null
  count: number
  /** `commercial` : un outcome du grand livre, classé par sa propre partition. */
  source?: 'commercial'
}

type ActionOutcomeCell = {
  value: string
  sectorKey: string
  sizeBand: string
  positive: number
  judged: number
  contributingWorkspaces: number
}

/**
 * P05.a — les issues DÉCLARÉES (même partition que `recommendFromOutcomes`),
 * mutualisées par valeur × secteur × taille. Une issue qui ne juge pas
 * l'approche ne compte pas ; un secteur ou une taille illisible ne fait pas
 * de segment (la ligne compte seulement dans les agrégats « tous »).
 */
export function actionOutcomeCells(rows: readonly ActionOutcomeSourceRow[]): ActionOutcomeCell[] {
  const pool: Array<{
    workspaceId: string
    cell: { value: string; sectorKey: string; sizeBand: string }
    counts: { positive: number; judged: number }
  }> = []
  for (const row of rows) {
    const value = row.value?.trim()
    if (!value || row.count <= 0) continue
    const kind = row.source === 'commercial' ? classifyCommercialOutcome(row.outcome) : classifyRuleOutcome(row.outcome)
    if (kind === null) continue
    for (const [sectorKey, sizeBand] of segmentsOf(row.nafCode, row.employees)) {
      pool.push({
        workspaceId: row.workspaceId,
        cell: { value, sectorKey, sizeBand },
        counts: { positive: kind === 'positive' ? row.count : 0, judged: row.count },
      })
    }
  }
  return poolSharedCells(pool).map(({ cell, counts, contributingWorkspaces }) => ({
    ...cell,
    ...counts,
    contributingWorkspaces,
  }))
}

export type CaseOutcomeSourceRow = {
  workspaceId: string
  nafCode: string | null
  employees: string | null
  /** `groupe` / `filiale` (`accounts.group_role`) — un jeton, ou rien. */
  groupRole: string | null
  outcome: 'won' | 'lost'
  count: number
}

type CaseOutcomeCell = {
  dimension: SharedCaseDimension
  value: string
  won: number
  lost: number
  contributingWorkspaces: number
}

/**
 * P05.b — les cas gagnés (retours de mission) et perdus (opportunités
 * `lost`), mutualisés par secteur (division NAF), taille (INSEE) et position
 * de groupe : les MÊMES trois dimensions que `deriveCaseMemory` (« chez
 * nous »). Le MOTIF d'une perte ne sort pas — il vient du catalogue propre à
 * chaque espace (texte libre) ; reste nommé au registre (c92).
 */
export function caseOutcomeCells(rows: readonly CaseOutcomeSourceRow[]): CaseOutcomeCell[] {
  const pool: Array<{
    workspaceId: string
    cell: { dimension: SharedCaseDimension; value: string }
    counts: { won: number; lost: number }
  }> = []
  for (const row of rows) {
    if (row.count <= 0) continue
    const counts = { won: row.outcome === 'won' ? row.count : 0, lost: row.outcome === 'lost' ? row.count : 0 }
    const values: Array<[SharedCaseDimension, string | null]> = [
      ['sector', sectorKeyOfNaf(row.nafCode)],
      ['size', sizeBandOfEmployees(row.employees)],
      ['group_role', row.groupRole?.trim() || null],
    ]
    for (const [dimension, value] of values) {
      if (value) pool.push({ workspaceId: row.workspaceId, cell: { dimension, value }, counts })
    }
  }
  return poolSharedCells(pool).map(({ cell, counts, contributingWorkspaces }) => ({
    ...cell,
    ...counts,
    contributingWorkspaces,
  }))
}

export type SignalDealSourceRow = {
  workspaceId: string
  /** Le type du signal (`signal_history.signal_type` : `budget`, `nomination`…) — un jeton. */
  signalType: string | null
  nafCode: string | null
  /** Signaux assez anciens pour être jugés sur la fenêtre. */
  signals: number
  /** Parmi eux, ceux suivis d'une affaire OUVERTE sur le même compte dans la fenêtre. */
  followedByDeal: number
}

type SignalDealCell = {
  signalType: string
  sectorKey: string
  signals: number
  followedByDeal: number
  contributingWorkspaces: number
}

/**
 * P05.c — un type de signal suivi d'une affaire ouverte sous
 * `SHARED_SIGNAL_DEAL_WINDOW_DAYS` jours, mutualisé par secteur (division NAF)
 * et au total. Un compte, jamais une causalité : « 4 sur 11 ont été suivis
 * d'une affaire » ne dit pas que le signal l'a provoquée.
 */
export function signalDealCells(rows: readonly SignalDealSourceRow[]): SignalDealCell[] {
  const pool: Array<{
    workspaceId: string
    cell: { signalType: string; sectorKey: string }
    counts: { signals: number; followedByDeal: number }
  }> = []
  for (const row of rows) {
    const signalType = row.signalType?.trim().toLowerCase()
    if (!signalType || row.signals <= 0) continue
    const counts = { signals: row.signals, followedByDeal: Math.min(row.followedByDeal, row.signals) }
    const sector = sectorKeyOfNaf(row.nafCode)
    for (const sectorKey of sector ? [SHARED_ALL, sector] : [SHARED_ALL]) {
      pool.push({ workspaceId: row.workspaceId, cell: { signalType, sectorKey }, counts })
    }
  }
  return poolSharedCells(pool).map(({ cell, counts, contributingWorkspaces }) => ({
    ...cell,
    ...counts,
    contributingWorkspaces,
  }))
}

export type MessageLearningSourceRow = {
  workspaceId: string
  /** Un jeton de `SHARED_MESSAGE_LEARNING_SIGNALS` — jamais un texte, jamais un corps de message. */
  signal: string
  count: number
}

type MessageLearningCell = { signal: SharedMessageLearningSignal; count: number; contributingWorkspaces: number }

const MESSAGE_LEARNING_SIGNALS: ReadonlySet<string> = new Set(SHARED_MESSAGE_LEARNING_SIGNALS)

/**
 * #2877 (#2385.5, niveau GLOBAL — Louis 11/10/2026) — les signaux
 * d'apprentissage des messages mutualisés : un COMPTE par signal, porté par
 * trois espaces au moins. Un signal hors du vocabulaire fermé ne sort pas —
 * c'est la forme, pas une liste noire, qui garantit qu'aucun texte ne voyage.
 */
export function messageLearningCells(rows: readonly MessageLearningSourceRow[]): MessageLearningCell[] {
  const pool = rows
    .filter(row => MESSAGE_LEARNING_SIGNALS.has(row.signal) && row.count > 0)
    .map(row => ({ workspaceId: row.workspaceId, cell: { signal: row.signal }, counts: { count: row.count } }))
  return poolSharedCells(pool).map(({ cell, counts, contributingWorkspaces }) => ({
    signal: cell.signal as SharedMessageLearningSignal,
    count: counts.count,
    contributingWorkspaces,
  }))
}

export type MarketPatternSourceRow = {
  workspaceId: string
  /** L'intitulé du recrutement repéré — LU pour en tirer une famille de métier, jamais écrit. */
  jobTitle: string | null
  nafCode: string | null
  employees: string | null
  /** Le siège ou l'adresse du compte — lu pour son code postal (région), jamais écrit. */
  address: string | null
}

type MarketPatternCell = {
  topic: MarketPatternSkillDomain
  sectorKey: string
  sizeBand: string
  regionKey: string
  observations: number
  contributingWorkspaces: number
}

/**
 * #4286.15.c (Louis 22/10/2026, `c127_market_pattern_tendances_entre_espaces`) — les recrutements
 * repérés, mutualisés par famille de métier × secteur × taille × région, et les cellules « tous » de
 * chaque axe. Un intitulé hors référentiel ne compte nulle part ; un axe illisible ne fait que « tous ».
 * Des COMPTES, jamais un taux ; trois espaces au moins par cellule (`poolSharedCells`). Ni l'intitulé,
 * ni l'adresse, ni l'espace ne sortent : seuls les jetons.
 */
export function marketPatternCells(rows: readonly MarketPatternSourceRow[]): MarketPatternCell[] {
  const pool: Array<{
    workspaceId: string
    cell: { topic: MarketPatternSkillDomain; sectorKey: string; sizeBand: string; regionKey: string }
    counts: { observations: number }
  }> = []
  for (const row of rows) {
    const topic = skillDomainOfJobTitle(row.jobTitle)
    if (!topic) continue
    const sector = sectorKeyOfNaf(row.nafCode)
    const size = sizeBandOfEmployees(row.employees)
    const region = regionKeyOfAddress(row.address)
    for (const sectorKey of sector ? [SHARED_ALL, sector] : [SHARED_ALL]) {
      for (const sizeBand of size ? [SHARED_ALL, size] : [SHARED_ALL]) {
        for (const regionKey of region ? [SHARED_ALL, region] : [SHARED_ALL]) {
          pool.push({
            workspaceId: row.workspaceId,
            cell: { topic, sectorKey, sizeBand, regionKey },
            counts: { observations: 1 },
          })
        }
      }
    }
  }
  return poolSharedCells(pool).map(({ cell, counts, contributingWorkspaces }) => ({
    ...cell,
    observations: counts.observations,
    contributingWorkspaces,
  }))
}
