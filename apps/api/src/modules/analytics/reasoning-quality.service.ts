import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { persistedChatContext } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import {
  buildReasoningQualityReport,
  reasoningTurnFromContext,
  type ContestedSourceRow,
  type GenericJudgementSample,
  type ReasoningQualityReport,
  type ReasoningTurnSample,
} from './reasoning-quality'

const DEFAULT_DAYS = 30
const MAX_DAYS = 90
/** Plafond de lecture : un rapport de pilotage ne balaie pas la table entière. */
const MAX_ROWS = 20_000

/**
 * #3223.3 (#3198) — lit les contextes persistés des réponses de Laura et en tire
 * le rapport du raisonnement commercial. Cross-tenant par nature (le produit,
 * pas un client) : la requête ne ramène NI identifiant d'espace NI texte de
 * message — uniquement la colonne `context`, déjà passée par la liste blanche.
 */
/**
 * La SEULE lecture des contextes de tours, partagée par le rapport et par les
 * alertes de qualité (GA-26 : une dérivation vit à un seul endroit). Une
 * lecture impossible rend zéro tour — traduit en « non mesuré », jamais en
 * « Laura raisonne parfaitement ».
 */
export async function readReasoningTurns(
  runs: Repository<AnalysisRunEntity>,
  since: Date,
  logger: Logger,
): Promise<ReasoningTurnSample[]> {
  try {
    const rows = (await runs.query(
      `SELECT m.context AS context
         FROM chat_messages m
         JOIN workspaces w ON w.id = m.workspace_id
        WHERE m.role = 'assistant'
          AND m.context IS NOT NULL
          AND w.is_demo = false
          AND m.created_at >= $1
        ORDER BY m.created_at DESC
        LIMIT $2`,
      [since, MAX_ROWS],
    )) as Array<Record<string, unknown>>
    const turns: ReasoningTurnSample[] = []
    for (const row of rows) {
      const turn = reasoningTurnFromContext(persistedChatContext(row['context']))
      if (turn) turns.push(turn)
    }
    return turns
  } catch (error) {
    logger.warn('Contextes de tours illisibles — le rapport de raisonnement reste non mesuré', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

/**
 * #3223 (décision Louis 11/10/2026) — les verdicts du juge « recommandation
 * générique » sur les réponses de la fenêtre. Ni texte ni identifiant : un
 * jeton et l'empreinte du juge. Lecture impossible = aucun verdict, donc
 * « non mesuré », jamais « aucune réponse générique ».
 */
export async function readGenericJudgements(
  runs: Repository<AnalysisRunEntity>,
  since: Date,
  logger: Logger,
): Promise<GenericJudgementSample[]> {
  try {
    const rows = (await runs.query(
      `SELECT j.verdict AS verdict, j.judge_version AS judge_version
         FROM chat_generic_judgements j
         JOIN chat_messages m ON m.id = j.message_id
         JOIN workspaces w ON w.id = m.workspace_id
        WHERE w.is_demo = false
          AND m.created_at >= $1
        LIMIT $2`,
      [since, MAX_ROWS],
    )) as Array<Record<string, unknown>>
    return rows.flatMap(row =>
      typeof row['verdict'] === 'string' && typeof row['judge_version'] === 'string'
        ? [{ verdict: row['verdict'], judgeVersion: row['judge_version'] }]
        : [],
    )
  } catch (error) {
    logger.warn('Verdicts du juge illisibles — le taux de réponses génériques reste non mesuré', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

/**
 * #3223 (décision Louis 11/10/2026) — les tours dont la correction est
 * décidable, comptés PAR ESPACE et par (secteur NAF, effectif) du compte du
 * fil. L'identifiant d'espace ne quitte jamais `contestedRankingOf`, qui ne
 * garde que les cellules portées par trois espaces au moins ; aucun nom de
 * compte n'est lu.
 */
async function readContestedRows(
  runs: Repository<AnalysisRunEntity>,
  since: Date,
  logger: Logger,
): Promise<ContestedSourceRow[]> {
  try {
    const rows = (await runs.query(
      `SELECT m.workspace_id AS workspace_id, a.naf_code AS naf_code, a.employees AS employees,
              COUNT(*) FILTER (WHERE m.context->'reasoning_trace'->>'correction_recognized' = 'true') AS contested,
              COUNT(*) AS decided
         FROM chat_messages m
         JOIN workspaces w ON w.id = m.workspace_id
         JOIN accounts a ON a.id = m.account_id
        WHERE m.role = 'assistant'
          AND w.is_demo = false
          AND m.created_at >= $1
          AND m.context->'reasoning_trace'->>'correction_recognized' IN ('true', 'false')
        GROUP BY m.workspace_id, a.naf_code, a.employees`,
      [since],
    )) as Array<Record<string, unknown>>
    return rows.flatMap(row =>
      typeof row['workspace_id'] === 'string'
        ? [
            {
              workspaceId: row['workspace_id'],
              nafCode: typeof row['naf_code'] === 'string' ? row['naf_code'] : null,
              employees: typeof row['employees'] === 'string' ? row['employees'] : null,
              contested: Number(row['contested'] ?? 0) || 0,
              decided: Number(row['decided'] ?? 0) || 0,
            },
          ]
        : [],
    )
  } catch (error) {
    logger.warn('Tours corrigés illisibles — le classement des contestations reste vide', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}

@Injectable()
export class ReasoningQualityService {
  private readonly logger = new Logger(ReasoningQualityService.name)

  constructor(@InjectRepository(AnalysisRunEntity) private readonly runs: Repository<AnalysisRunEntity>) {}

  async report(days: number | undefined, now: Date = new Date()): Promise<ReasoningQualityReport> {
    const windowDays =
      Number.isFinite(days) && (days as number) > 0 ? Math.min(Math.floor(days as number), MAX_DAYS) : DEFAULT_DAYS
    const since = new Date(now.getTime() - windowDays * 86_400_000)
    return buildReasoningQualityReport(await readReasoningTurns(this.runs, since, this.logger), windowDays, {
      judgements: await readGenericJudgements(this.runs, since, this.logger),
      contested: await readContestedRows(this.runs, since, this.logger),
    })
  }
}
