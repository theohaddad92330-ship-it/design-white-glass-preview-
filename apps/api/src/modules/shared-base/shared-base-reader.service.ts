import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import {
  MARKET_PATTERN_TABLE,
  MARKET_PATTERN_WINDOW_DAYS,
  SHARED_ALL,
  SHARED_BASE_MIN_WORKSPACES,
  SHARED_SIGNAL_DEAL_WINDOW_DAYS,
  readSharedCells,
  regionKeyOfAddress,
  sectorKeyOfNaf,
  sizeBandOfEmployees,
  toMarketPatternLine,
  type OutcomeRecommendationDimension,
  type SharedCaseDimension,
  type SharedScope,
} from '@bellum/contracts'

/**
 * P05 (#3246, lot 09/10) — LA LECTURE de la base anonyme commune.
 *
 * Ce que Laura cite « ailleurs », À CÔTÉ de ce que l'espace mesure « chez
 * nous » — jamais à sa place. Trois règles, toutes tenues ici :
 *  · la lecture redit le seuil (`readSharedCells`) même si la base le tient
 *    par un CHECK : sous trois espaces, « pas assez de données communes » ;
 *  · des COMPTES (`positive` / `judged`), jamais un taux ni une probabilité ;
 *  · la salle de démonstration lit `scope = 'demo'`, le réel `scope = 'live'`.
 *
 * ⚠️ « Ailleurs » INCLUT l'espace qui demande : l'en exclure supposerait de
 * stocker la contribution de chaque espace (reste nommé, c92).
 */

type Segment = { sector: string; sizeBand: string }

type SharedCaseLine = {
  dimension: SharedCaseDimension
  value: string
  won: number
  lost: number
  contributingWorkspaces: number
}

type SharedSignalLine = {
  signalType: string
  /** Le secteur retenu : celui du compte s'il atteint le seuil, sinon `all`. */
  sector: string
  signals: number
  followedByDeal: number
  contributingWorkspaces: number
}

/** P05.c — combien de signaux de ce type ont été suivis d'une affaire ouverte, ailleurs. */
type SharedSignalPrecedence = { basis: 'shared_anonymous_base'; minWorkspaces: number; windowDays: number } & (
  | { status: 'shared'; lines: SharedSignalLine[] }
  | { status: 'not_enough_shared_data' }
)

/** P05.b — « dans la base commune » : les cas des autres espaces qui partagent une dimension du compte. */
type SharedCaseOutcomes = { basis: 'shared_anonymous_base'; minWorkspaces: number } & (
  | { status: 'shared'; lines: SharedCaseLine[] }
  | { status: 'not_enough_shared_data' }
)

type SharedActionOutcomes = {
  basis: 'shared_anonymous_base'
  minWorkspaces: number
  dimension: OutcomeRecommendationDimension
} & (
  | {
      status: 'shared'
      /** Le segment RETENU — le plus fin qui atteint le seuil (`all` = tous). */
      segment: Segment
      contributingWorkspaces: number
      values: Array<{ value: string; positive: number; judged: number; contributingWorkspaces: number }>
    }
  | { status: 'not_enough_shared_data' }
)

/** #4286.15.c — une tendance publiée : la sortie de la porte `toMarketPatternLine`, rien d'autre. */
type MarketPatternLine = NonNullable<ReturnType<typeof toMarketPatternLine>>

/** #4286.15.c — les tendances de marché entre espaces (`market_pattern`), autour du segment d'un compte. */
type SharedMarketPatterns = { basis: 'shared_anonymous_base'; minWorkspaces: number; windowDays: number } & (
  | { status: 'shared'; lines: MarketPatternLine[] }
  | { status: 'not_enough_shared_data' }
)

type MarketPatternRow = {
  topic: string
  sector_key: string
  size_band: string
  region_key: string
  observations: number
  contributing_workspaces: number
}

/** #4286.15.c — du plus fin au plus large sur les trois axes (secteur d'abord : c'est ce qui sépare le plus deux marchés). */
function marketPatternSegments(
  sector: string | null,
  sizeBand: string | null,
  region: string | null,
): Array<{ sectorKey: string; sizeBand: string; regionKey: string }> {
  const sectors = sector ? [sector, SHARED_ALL] : [SHARED_ALL]
  const sizes = sizeBand ? [sizeBand, SHARED_ALL] : [SHARED_ALL]
  const regions = region ? [region, SHARED_ALL] : [SHARED_ALL]
  return sectors.flatMap(sectorKey =>
    sizes.flatMap(size => regions.map(regionKey => ({ sectorKey, sizeBand: size, regionKey }))),
  )
}

/** Du plus fin au plus large : (secteur, taille), (secteur, toutes), (tous, taille), (tous, toutes). */
function candidateSegments(sector: string | null, sizeBand: string | null): Segment[] {
  const out: Segment[] = []
  if (sector && sizeBand) out.push({ sector, sizeBand })
  if (sector) out.push({ sector, sizeBand: SHARED_ALL })
  if (sizeBand) out.push({ sector: SHARED_ALL, sizeBand })
  out.push({ sector: SHARED_ALL, sizeBand: SHARED_ALL })
  return out
}

type CaseOutcomeRow = {
  dimension: SharedCaseDimension
  value: string
  won: number
  lost: number
  contributing_workspaces: number
}

@Injectable()
export class SharedBaseReaderService {
  constructor(private readonly dataSource: DataSource) {}

  /** La salle de démonstration ne lit jamais le réel, et inversement. */
  async scopeFor(workspaceId: string): Promise<SharedScope> {
    const rows = await this.dataSource.query<Array<{ is_demo: boolean | null }>>(
      `SELECT is_demo FROM workspaces WHERE id = $1`,
      [workspaceId],
    )
    return rows[0]?.is_demo ? 'demo' : 'live'
  }

  /** Le secteur (division NAF), la taille (INSEE) et la position de groupe d'un compte DE CET espace. */
  async segmentOf(
    workspaceId: string,
    accountId: string,
  ): Promise<{ sector: string | null; sizeBand: string | null; groupRole: string | null; region: string | null }> {
    const rows = await this.dataSource.query<
      Array<{
        naf_code: string | null
        employees: string | null
        group_role: string | null
        headquarters?: string | null
        address?: string | null
      }>
    >(
      `SELECT naf_code, employees, group_role, headquarters, address FROM accounts WHERE id = $1 AND workspace_id = $2`,
      [accountId, workspaceId],
    )
    return {
      sector: sectorKeyOfNaf(rows[0]?.naf_code),
      sizeBand: sizeBandOfEmployees(rows[0]?.employees),
      groupRole: rows[0]?.group_role?.trim() || null,
      // #4286.15.c — la région du siège (registre), sinon de l'adresse saisie : MÊME règle que l'écrivain.
      region: regionKeyOfAddress(rows[0]?.headquarters ?? rows[0]?.address ?? null),
    }
  }

  /**
   * P05.a (#3211.11) — « ce qui marche ailleurs » pour une dimension : le
   * segment le plus fin du compte qui atteint le seuil, sinon le total.
   */
  async actionOutcomesElsewhere(
    workspaceId: string,
    dimension: OutcomeRecommendationDimension,
    accountId?: string,
  ): Promise<SharedActionOutcomes> {
    const scope = await this.scopeFor(workspaceId)
    const { sector, sizeBand } = accountId
      ? await this.segmentOf(workspaceId, accountId)
      : { sector: null, sizeBand: null }
    const rows = await this.dataSource.query<
      Array<{
        value: string
        sector_key: string
        size_band: string
        positive: number
        judged: number
        contributing_workspaces: number
      }>
    >(
      `SELECT value, sector_key, size_band, positive, judged, contributing_workspaces
       FROM shared_action_outcome_aggregates
       WHERE scope = $1 AND dimension = $2`,
      [scope, dimension],
    )
    const base = { basis: 'shared_anonymous_base' as const, minWorkspaces: SHARED_BASE_MIN_WORKSPACES, dimension }
    for (const segment of candidateSegments(sector, sizeBand)) {
      const reading = readSharedCells(
        rows
          .filter(row => row.sector_key === segment.sector && row.size_band === segment.sizeBand)
          .map(row => ({
            value: row.value,
            positive: Number(row.positive),
            judged: Number(row.judged),
            contributingWorkspaces: Number(row.contributing_workspaces),
          })),
      )
      if (reading.status === 'shared') {
        return {
          ...base,
          status: 'shared',
          segment,
          contributingWorkspaces: reading.contributingWorkspaces,
          values: [...reading.rows].sort((a, b) => b.judged - a.judged || a.value.localeCompare(b.value)),
        }
      }
    }
    return { ...base, status: 'not_enough_shared_data' }
  }

  /**
   * P05.b (#3210.1) — pour chaque dimension CONNUE du compte (secteur,
   * taille, position de groupe), les cas gagnés / perdus de la base commune
   * qui la partagent. Une dimension inconnue ou sous le seuil ne fait AUCUNE
   * ligne (doctrine « on n'affiche pas ce qu'on n'a pas ») ; aucune ligne du
   * tout = « pas assez de données communes ».
   */
  async caseOutcomesElsewhere(workspaceId: string, accountId: string): Promise<SharedCaseOutcomes> {
    return this.caseOutcomesElsewhereFor(workspaceId)(accountId)
  }

  /**
   * Même lecture, pour PLUSIEURS comptes d'un même espace (une affaire par
   * compte, le CA probable) : le périmètre et les cellules de la base commune
   * sont les mêmes pour tous — lus une seule fois, à la première demande ; seul
   * le segment du compte change.
   */
  caseOutcomesElsewhereFor(workspaceId: string): (accountId: string) => Promise<SharedCaseOutcomes> {
    const base = { basis: 'shared_anonymous_base' as const, minWorkspaces: SHARED_BASE_MIN_WORKSPACES }
    let cells: Promise<CaseOutcomeRow[]> | undefined
    const cellsOnce = () => {
      cells ??= this.scopeFor(workspaceId).then(scope =>
        this.dataSource.query<CaseOutcomeRow[]>(
          `SELECT dimension, value, won, lost, contributing_workspaces
           FROM shared_case_outcome_aggregates
           WHERE scope = $1`,
          [scope],
        ),
      )
      return cells
    }
    return async accountId => {
      const [rows, segment] = await Promise.all([cellsOnce(), this.segmentOf(workspaceId, accountId)])
      const wanted: Array<[SharedCaseDimension, string | null]> = [
        ['sector', segment.sector],
        ['size', segment.sizeBand],
        ['group_role', segment.groupRole],
      ]
      const reading = readSharedCells(
        wanted.flatMap(([dimension, value]) =>
          rows
            .filter(row => value && row.dimension === dimension && row.value === value)
            .map(row => ({
              dimension,
              value: row.value,
              won: Number(row.won),
              lost: Number(row.lost),
              contributingWorkspaces: Number(row.contributing_workspaces),
            })),
        ),
      )
      if (reading.status !== 'shared') return { ...base, status: 'not_enough_shared_data' }
      return { ...base, status: 'shared', lines: reading.rows }
    }
  }

  /**
   * P05.c — pour chaque type de signal demandé, combien de signaux de ce type
   * ont été suivis d'une affaire ouverte sous 90 jours dans la base commune :
   * le secteur du compte s'il atteint le seuil, sinon le total. Un type sous
   * le seuil ne fait AUCUNE ligne. Un compte, jamais une causalité.
   */
  async signalPrecedenceElsewhere(
    workspaceId: string,
    signalTypes: readonly string[],
    accountId?: string,
  ): Promise<SharedSignalPrecedence> {
    const base = {
      basis: 'shared_anonymous_base' as const,
      minWorkspaces: SHARED_BASE_MIN_WORKSPACES,
      windowDays: SHARED_SIGNAL_DEAL_WINDOW_DAYS,
    }
    const types = [...new Set(signalTypes.map(type => type.trim().toLowerCase()).filter(Boolean))]
    if (types.length === 0) return { ...base, status: 'not_enough_shared_data' }
    const [scope, sector] = await Promise.all([
      this.scopeFor(workspaceId),
      accountId ? this.segmentOf(workspaceId, accountId).then(segment => segment.sector) : Promise.resolve(null),
    ])
    const rows = await this.dataSource.query<
      Array<{
        signal_type: string
        sector_key: string
        signals: number
        followed_by_deal: number
        contributing_workspaces: number
      }>
    >(
      `SELECT signal_type, sector_key, signals, followed_by_deal, contributing_workspaces
       FROM shared_signal_deal_aggregates
       WHERE scope = $1 AND signal_type = ANY($2)`,
      [scope, types],
    )
    const lines: SharedSignalLine[] = []
    for (const signalType of types) {
      for (const sectorKey of sector ? [sector, SHARED_ALL] : [SHARED_ALL]) {
        const reading = readSharedCells(
          rows
            .filter(row => row.signal_type === signalType && row.sector_key === sectorKey)
            .map(row => ({
              signalType,
              sector: sectorKey,
              signals: Number(row.signals),
              followedByDeal: Number(row.followed_by_deal),
              contributingWorkspaces: Number(row.contributing_workspaces),
            })),
        )
        if (reading.status === 'shared') {
          lines.push(...reading.rows)
          break
        }
      }
    }
    if (lines.length === 0) return { ...base, status: 'not_enough_shared_data' }
    return { ...base, status: 'shared', lines }
  }

  /**
   * #4286.15.c (Louis 22/10/2026, `c127_market_pattern_tendances_entre_espaces`) — les TENDANCES de
   * marché entre espaces autour d'un compte : pour chaque famille de métier recruté, la cellule la plus
   * fine de son segment (secteur, taille, région) que trois espaces au moins portent, sinon une plus
   * large. Chaque ligne passe par la porte `toMarketPatternLine` (forme fermée, seuil redit, libellé
   * « observé dans N espaces ») ; une famille sous le seuil partout ne fait AUCUNE ligne. Des comptes,
   * jamais un taux ni une probabilité.
   */
  async marketPatternsElsewhere(workspaceId: string, accountId: string): Promise<SharedMarketPatterns> {
    const base = {
      basis: 'shared_anonymous_base' as const,
      minWorkspaces: SHARED_BASE_MIN_WORKSPACES,
      windowDays: MARKET_PATTERN_WINDOW_DAYS,
    }
    const [scope, segment] = await Promise.all([this.scopeFor(workspaceId), this.segmentOf(workspaceId, accountId)])
    const segments = marketPatternSegments(segment.sector, segment.sizeBand, segment.region)
    const rows = await this.dataSource.query<MarketPatternRow[]>(
      `SELECT topic, sector_key, size_band, region_key, observations, contributing_workspaces
       FROM ${MARKET_PATTERN_TABLE}
       WHERE scope = $1 AND sector_key = ANY($2) AND size_band = ANY($3) AND region_key = ANY($4)`,
      [
        scope,
        [...new Set(segments.map(cell => cell.sectorKey))],
        [...new Set(segments.map(cell => cell.sizeBand))],
        [...new Set(segments.map(cell => cell.regionKey))],
      ],
    )
    const lines: MarketPatternLine[] = []
    for (const topic of [...new Set(rows.map(row => row.topic))].sort()) {
      for (const wanted of segments) {
        const row = rows.find(
          candidate =>
            candidate.topic === topic &&
            candidate.sector_key === wanted.sectorKey &&
            candidate.size_band === wanted.sizeBand &&
            candidate.region_key === wanted.regionKey,
        )
        if (!row) continue
        // La ligne passe ENTIÈRE par la porte : une colonne de plus (coût, prix, nom) la fait refuser.
        const { sector_key, size_band, region_key, observations, contributing_workspaces, ...rest } = row
        const line = toMarketPatternLine({
          ...rest,
          sectorKey: sector_key,
          sizeBand: size_band,
          regionKey: region_key,
          observations: Number(observations),
          contributingWorkspaces: Number(contributing_workspaces),
        })
        if (line) {
          lines.push(line)
          break
        }
      }
    }
    if (lines.length === 0) return { ...base, status: 'not_enough_shared_data' }
    lines.sort((a, b) => b.observations - a.observations || a.topic.localeCompare(b.topic))
    return { ...base, status: 'shared', lines }
  }
}
