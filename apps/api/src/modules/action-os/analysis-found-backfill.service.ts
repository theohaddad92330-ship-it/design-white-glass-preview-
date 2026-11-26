import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { ContactEntity } from '../../database/entities/contact.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { summariseAnalysisFound } from './analysis-found'
import { ANALYSIS_TRACKING_DEFINITION_KEY } from './copilot-card-catalog'

export type AnalysisFoundBackfillOutcome = {
  dryRun: boolean
  workspaceId: string
  /** Analyses de compte réussies de l'espace qui n'ont pas encore `analysisFound`. */
  candidates: number
  /** Ce qui SERAIT écrit (simulation) — 0 en mode réel. */
  wouldUpdate: number
  /** Ce qui a été écrit — 0 en simulation. */
  updated: number
  /** Candidats dont le compte n'a aucun contact visible : laissés SANS champ, jamais un zéro. */
  withoutContacts: number
}

/** Une passe ne lit pas un parc entier : l'opérateur relance tant que `candidates` > 0. */
const BACKFILL_BATCH = 200

/**
 * #3416.x2 — « un correctif de collecte RATTRAPE l'existant » (décision Louis
 * 18/09/2026). `CardResult.analysisFound` n'est posé qu'au règlement d'une
 * analyse : les runs réglés avant (ex. Thales) restaient sans « Ce que ça
 * apprend ». Ce service le calcule pour eux, depuis les contacts DÉJÀ en base.
 *
 * Ciblé : UN espace, analyses de compte `done` sans `analysisFound`, rien
 * d'autre. Idempotent : un run doté sort du filtre. Sans geste humain il ne
 * part jamais — seul `AnalysisFoundBackfillController` l'appelle, jamais le
 * déploiement ni un cron. Le seul champ écrit est `result.analysisFound`.
 */
@Injectable()
export class AnalysisFoundBackfillService {
  private readonly logger = new Logger(AnalysisFoundBackfillService.name)

  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runs: Repository<WorkflowRunEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
  ) {}

  async run(workspaceId: string, options: { dryRun: boolean }): Promise<AnalysisFoundBackfillOutcome> {
    const done = await this.runs.find({
      where: { workspace_id: workspaceId, definition_key: ANALYSIS_TRACKING_DEFINITION_KEY, status: 'done' },
      order: { created_at: 'ASC' },
    })
    const candidates = done
      .filter(run => run.account_id && run.result && !run.result.analysisFound)
      .slice(0, BACKFILL_BATCH)

    let wouldUpdate = 0
    let updated = 0
    let withoutContacts = 0
    for (const run of candidates) {
      const rows = await this.contacts.find({
        where: { account_id: run.account_id as string, workspace_id: workspaceId, deleted_at: IsNull() },
        take: 500,
      })
      const found = summariseAnalysisFound(rows)
      if (!found) {
        withoutContacts += 1
        continue
      }
      if (options.dryRun) {
        wouldUpdate += 1
        continue
      }
      const result = await this.runs.update(
        { id: run.id, workspace_id: workspaceId, status: 'done' },
        { result: { ...(run.result as NonNullable<typeof run.result>), analysisFound: found } },
      )
      updated += result.affected ?? 0
    }
    this.logger.log(
      `analysisFound backfill ws=${workspaceId} dryRun=${options.dryRun} candidates=${candidates.length} updated=${updated}`,
    )
    return { dryRun: options.dryRun, workspaceId, candidates: candidates.length, wouldUpdate, updated, withoutContacts }
  }
}
