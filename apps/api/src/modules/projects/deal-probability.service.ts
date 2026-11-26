import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import {
  DEAL_PROBABILITY_METHOD,
  backtestDealProbability,
  DECIDED_STAGES,
  OPEN_PIPELINE_STAGES,
  PROJECT_STAGES,
  calibrateDealProbability,
  financeScopeClause,
  probableQuarterRevenue,
  projectStageInSql,
  quarterWindow,
  type ProbableQuarter,
  type ProjectStage,
} from '@bellum/contracts'
import { ProjectEntity } from '../../database/entities/project.entity'
import type { PipelineScope } from './project-pipeline.service'

type OpenDealRow = {
  id: string
  account_id: string
  label: string
  stage: string
  amount_cents: number | string | null
  currency: string | null
  expected_close_on: string | null
}

type DecidedDealRow = { id: string; stage: string; states: (string | null)[] | null }

/**
 * Ce que la base anonyme commune dit des cas d'un compte — la forme que rend
 * `SharedBaseReaderService.caseOutcomesElsewhere`. Lue par le CONTRÔLEUR et
 * passée ici en fonction : un service ne va pas chercher le service d'un autre
 * module (GA-07).
 */
type SharedCaseReading =
  | { status: 'not_enough_shared_data' }
  | {
      status: 'shared'
      lines: {
        dimension: 'sector' | 'size' | 'group_role'
        won: number
        lost: number
        contributingWorkspaces: number
      }[]
    }
type SharedCasesOf = (accountId: string) => Promise<SharedCaseReading>

/** Le secteur d'abord, puis la taille, puis la position de groupe : du plus parlant au plus large. */
const SHARED_DIMENSION_ORDER = ['sector', 'size', 'group_role'] as const

const isStage = (value: string | null): value is ProjectStage =>
  value !== null && (PROJECT_STAGES as readonly string[]).includes(value)

/** Le plus haut stade OUVERT connu d'une affaire close — `null` si son parcours n'a pas été journalisé. */
function highestOpenStage(states: readonly (string | null)[]): ProjectStage | null {
  const open = OPEN_PIPELINE_STAGES as readonly string[]
  const known = states.filter(isStage).filter(stage => open.includes(stage))
  if (known.length === 0) return null
  return known.reduce((a, b) => (PROJECT_STAGES.indexOf(a) >= PROJECT_STAGES.indexOf(b) ? a : b))
}

/**
 * #4016 L1 (décision Louis 11/10/2026) — LE CA PROBABLE DU TRIMESTRE.
 *
 * Chaque affaire OUVERTE dont la signature attendue tombe dans le trimestre
 * reçoit une probabilité CALIBRÉE (`calibrateDealProbability`, méthode
 * `beta_binomial_stage_v1`) sur :
 *  - les issues RÉELLES de l'espace — affaires gagnées / perdues, et le plus
 *    haut stade que le journal des transitions leur connaît ;
 *  - la base anonyme commune (≥ 3 espaces) sur la dimension du compte — un a
 *    priori borné, jamais à la place de l'espace.
 *
 * Calculée à la LECTURE, jamais persistée (GA-64). L'historique est lu sur tout
 * l'espace, même en portée « mon portefeuille » : calibrer sur ses seules
 * affaires réduirait l'échantillon sans rien rendre plus juste.
 */
@Injectable()
export class DealProbabilityService {
  constructor(@InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>) {}

  async probableQuarter(
    workspaceId: string,
    scope: PipelineScope,
    sharedCasesOf: SharedCasesOf,
    now: Date = new Date(),
  ): Promise<ProbableQuarter> {
    const quarter = quarterWindow(now)
    const own =
      scope.kind === 'own'
        ? financeScopeClause({ kind: 'own', workspaceId, userId: scope.userId }, 'o', 4)
        : { sql: '', params: [] }
    const [openRows, decidedRows] = await Promise.all([
      this.projects.manager.query<OpenDealRow[]>(
        `SELECT o.id, o.account_id, o.label, o.stage, o.amount_cents::bigint AS amount_cents, o.currency,
                o.expected_close_on::text AS expected_close_on
           FROM opportunities o
           JOIN accounts acc ON acc.id = o.account_id
          WHERE (o.workspace_id = $1 OR acc.workspace_id = $1)
            AND acc.status <> 'deleted'
            AND ${projectStageInSql('o.stage', OPEN_PIPELINE_STAGES)}
            AND o.expected_close_on >= $2::date AND o.expected_close_on < $3::date${own.sql}
          ORDER BY o.expected_close_on, o.id`,
        [workspaceId, quarter.from, quarter.until, ...own.params],
      ),
      // Les issues RÉELLES : gagnées et perdues (une mise en veille n'est pas
      // une issue). Le parcours vient du journal des transitions d'étape.
      this.projects.manager.query<DecidedDealRow[]>(
        `SELECT o.id, o.stage,
                ARRAY(
                  SELECT s FROM commercial_transitions t,
                         LATERAL unnest(ARRAY[t.from_state, t.to_state]) AS s
                   WHERE t.subject_type = 'opportunity' AND t.subject_id = o.id
                ) AS states
           FROM opportunities o
           JOIN accounts acc ON acc.id = o.account_id
          WHERE (o.workspace_id = $1 OR acc.workspace_id = $1)
            AND acc.status <> 'deleted'
            AND ${projectStageInSql('o.stage', DECIDED_STAGES)}`,
        [workspaceId],
      ),
    ])

    const history = decidedRows.map(row => ({
      outcome: row.stage === 'won' ? ('won' as const) : ('lost' as const),
      highestStage: highestOpenStage(row.states ?? []),
    }))

    const sharedByAccount = new Map<string, SharedCaseReading>()
    for (const accountId of new Set(openRows.map(row => row.account_id))) {
      sharedByAccount.set(accountId, await sharedCasesOf(accountId))
    }

    const deals = openRows
      .filter(row => isStage(row.stage))
      .map(row => {
        const reading = sharedByAccount.get(row.account_id)
        const line =
          reading?.status === 'shared'
            ? SHARED_DIMENSION_ORDER.map(dimension => reading.lines.find(l => l.dimension === dimension)).find(Boolean)
            : undefined
        const closing_probability = calibrateDealProbability({
          stage: row.stage as ProjectStage,
          history,
          shared: line
            ? {
                won: line.won,
                lost: line.lost,
                contributingWorkspaces: line.contributingWorkspaces,
                dimension: line.dimension,
              }
            : null,
        })
        return {
          opportunity_id: row.id,
          label: row.label,
          stage: row.stage as ProjectStage,
          amount_cents: row.amount_cents === null ? null : Number(row.amount_cents),
          currency: row.currency,
          expected_close_on: row.expected_close_on,
          closing_probability,
        }
      })

    return {
      method: DEAL_PROBABILITY_METHOD,
      quarter,
      // #4016.1c — le calibrage mesuré a posteriori, sur les mêmes issues closes.
      calibration: backtestDealProbability(history),
      revenue: probableQuarterRevenue(
        deals.map(deal => ({
          amountCents: deal.amount_cents,
          currency: deal.currency,
          probability: deal.closing_probability,
        })),
      ),
      deals,
    }
  }
}
