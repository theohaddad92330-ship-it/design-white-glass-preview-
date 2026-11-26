import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { needStillOpenSql } from '@bellum/contracts'
import type { InverseMatch, MatchNeed, MatchResult } from '@bellum/contracts'
import { MatchRunEntity, MatchRunEntryEntity } from '../../../database/entities/match-run.entity'
import { evaluateCandidate } from './engine'
import { MatchingService } from './matching.service'

/**
 * Le matching INVERSE : « à quels besoins ce profil répond ? » (§5.2, BEL-MTC-304).
 *
 * C'est le cœur de l'intercontrat, et c'est le geste qui n'était pas outillé du
 * tout : quand un consultant se libérait, quelqu'un relisait les besoins à la
 * main. La routine J-30 existait déjà et se contentait de NOTIFIER — elle
 * annonçait une fin de mission sans jamais proposer la suite.
 *
 * La règle qui le porte est celle du N14 : un consultant libre le 1er septembre
 * ne peut être « recommandé » que sur un besoin démarrant après. Les autres
 * passent en « limites » avec le motif `unavailable_at_start` — visibles, avec
 * leur écart nommé, parce qu'un recruteur peut décaler un démarrage et pas un
 * algorithme.
 */
@Injectable()
export class InverseMatchingService {
  private readonly logger = new Logger(InverseMatchingService.name)

  /** Borne de volume : au-delà, ce n'est plus une liste qu'on lit. */
  private static readonly MAX_NEEDS = 200

  constructor(
    private readonly matching: MatchingService,
    @InjectRepository(MatchRunEntity) private readonly runs: Repository<MatchRunEntity>,
    @InjectRepository(MatchRunEntryEntity) private readonly entries: Repository<MatchRunEntryEntity>,
  ) {}

  async matchTalent(
    consultantId: string,
    workspaceId: string | null,
    userId: string,
    options: { canReadFinance: boolean; mineOnly?: boolean; now?: Date },
  ): Promise<InverseMatch | null> {
    const now = options.now ?? new Date()
    const { weights, threshold } = await this.matching.weightsFor(workspaceId)
    const needIds = await this.openNeedIds(workspaceId, userId, options.mineOnly ?? false)
    if (needIds.length === 0) {
      // Aucun besoin ouvert est une RÉPONSE, pas une erreur : l'écran doit
      // pouvoir dire « rien à proposer aujourd'hui » plutôt qu'échouer.
      const probe = await this.matching.loadCandidates(workspaceId, userId, EMPTY_NEED, [consultantId])
      if (probe.length === 0) return null
      return { runId: crypto.randomUUID(), consultantId, weights, threshold, evaluatedCount: 0, needs: [] }
    }

    const evaluated: { need: MatchNeed; result: MatchResult }[] = []
    for (const needId of needIds) {
      const need = await this.matching.loadNeed(needId, workspaceId)
      if (!need) continue
      // Le candidat est rechargé par besoin : l'historique client et le
      // « déjà en mission ici » dépendent du COMPTE, donc du besoin. Le charger
      // une fois pour tous rendrait ces deux drapeaux faux sur tous les autres.
      const [candidate] = await this.matching.loadCandidates(workspaceId, userId, need, [consultantId])
      if (!candidate) return null
      evaluated.push({
        need,
        result: evaluateCandidate(need, candidate, {
          weights,
          threshold,
          canReadFinance: options.canReadFinance,
          now,
        }),
      })
    }

    evaluated.sort(
      (a, b) =>
        b.result.pushableScore - a.result.pushableScore ||
        b.result.correspondenceScore - a.result.correspondenceScore ||
        (a.need.needId ?? '').localeCompare(b.need.needId ?? ''),
    )

    const run: InverseMatch = {
      runId: crypto.randomUUID(),
      consultantId,
      weights,
      threshold,
      evaluatedCount: evaluated.length,
      needs: evaluated,
    }
    await this.journal(run, workspaceId, userId, now)
    return run
  }

  /** Les besoins encore ouverts, les plus récents d'abord. */
  private async openNeedIds(workspaceId: string | null, userId: string, mineOnly: boolean): Promise<string[]> {
    const rows = await this.runs.manager.query<{ id: string }[]>(
      // #2558.1 — un besoin existe sans projet : la jointure au projet devient
      // FACULTATIVE (sinon les besoins sans projet sortaient du matching
      // inverse en silence), et le compte se rejoint par `n.account_id`.
      `SELECT n.id
         FROM project_needs n
         LEFT JOIN opportunities o ON o.id = n.project_id
         LEFT JOIN accounts a ON a.id = n.account_id
        WHERE ${needStillOpenSql('n.status')}
          AND ($1::uuid IS NULL OR n.workspace_id = $1 OR o.workspace_id = $1 OR a.workspace_id = $1)
          -- « Mon portefeuille » se lit sur le PORTEUR DU BESOIN : la table des
          -- comptes n'a pas de colonne de propriétaire, et en inventer une dans
          -- cette clause a fait échouer tout le matching inverse en production.
          AND ($2::boolean IS NOT TRUE OR n.owner_id = $3)
        ORDER BY n.updated_at DESC
        LIMIT ${InverseMatchingService.MAX_NEEDS}`,
      [workspaceId, mineOnly, userId],
    )
    return rows.map(row => row.id)
  }

  private async journal(run: InverseMatch, workspaceId: string | null, userId: string, now: Date): Promise<void> {
    try {
      await this.runs.save(
        this.runs.create({
          id: run.runId,
          workspace_id: workspaceId,
          user_id: userId,
          need_id: null,
          consultant_id: run.consultantId,
          direction: 'talent_to_needs',
          criteria: { consultantId: run.consultantId, needs: run.needs.map(entry => entry.need.needId) },
          weights: run.weights,
          weights_version_id: null,
          threshold: run.threshold,
          evaluated_count: run.evaluatedCount,
          prefiltered_count: 0,
          truncated: run.evaluatedCount >= InverseMatchingService.MAX_NEEDS,
          exclusion_counts: [],
          created_at: now,
        }),
      )
      if (run.needs.length > 0) {
        await this.entries.save(
          run.needs.map((entry, index) =>
            this.entries.create({
              run_id: run.runId,
              consultant_id: run.consultantId,
              need_id: entry.need.needId,
              rank: index + 1,
              correspondence_score: entry.result.correspondenceScore,
              pushable_score: entry.result.pushableScore,
              bucket: entry.result.bucket,
              axes: entry.result.axes,
              exclusions: entry.result.exclusions,
            }),
          ),
        )
      }
    } catch (error) {
      this.logger.error('Journal de matching inverse non écrit', { error, tags: { runId: run.runId } })
    }
  }
}

/** Un besoin VIDE, seulement pour vérifier qu'un talent existe. Il ne sert à
 *  aucun calcul : tous ses axes seraient non évaluables. */
const EMPTY_NEED: MatchNeed = {
  needId: null,
  role: '',
  accountName: null,
  accountSector: null,
  projectSectors: [],
  skills: [],
  minYears: null,
  seniorityBand: null,
  environment: [],
  languages: [],
  clearances: [],
  location: null,
  remote: null,
  startOn: null,
  targetRateCents: null,
  contractKind: null,
}
