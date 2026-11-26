import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { DiscoverCandidateFeedbackResponse, DiscoverCandidateFeedbackVerdict } from '@bellum/contracts'
import { Repository } from 'typeorm'
import { DiscoverCandidateFeedbackEntity } from '../../database/entities/discover-candidate-feedback.entity'

/**
 * #3671.2bis — « Mauvaise entreprise » sur une carte Découvrir : le signal
 * affiché n'appartient pas à ce SIREN. Enregistré côté serveur, par espace,
 * pour que le candidat ne soit plus rattaché aux recherches suivantes — voir
 * `withoutWrongCompanyCandidates` (`ia-proxy.controller.ts`), seul lecteur de
 * {@link excludedSirens}.
 *
 * Table dédiée plutôt qu'un élargissement d'`account_feedback` (voir le
 * docblock de la migration) ; même raison et même forme que
 * `discover_candidate_notes` — un candidat n'a pas encore de ligne `accounts`.
 *
 * `workspaceId` entre déjà RÉSOLU (GA-07 : un service ne va pas chercher le
 * service d'un autre module) — son appelant, le contrôleur, le résout.
 */
@Injectable()
export class DiscoverCandidateFeedbackService {
  private readonly logger = new Logger(DiscoverCandidateFeedbackService.name)

  constructor(
    @InjectRepository(DiscoverCandidateFeedbackEntity)
    private readonly feedback: Repository<DiscoverCandidateFeedbackEntity>,
  ) {}

  /** Idempotent : un second clic sur la même carte ne double jamais la ligne
   *  (`discover_candidate_feedback_unique`, ON CONFLICT DO NOTHING). */
  async record(
    workspaceId: string,
    userId: string,
    siren: string,
    verdict: DiscoverCandidateFeedbackVerdict,
  ): Promise<DiscoverCandidateFeedbackResponse> {
    await this.feedback.manager.query(
      `INSERT INTO discover_candidate_feedback (workspace_id, user_id, siren, verdict)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_id, siren, verdict) DO NOTHING`,
      [workspaceId, userId, siren, verdict],
    )
    return { siren, verdict, recordedAt: new Date().toISOString() }
  }

  /**
   * Les SIREN que CET espace a déclarés « Mauvaise entreprise » — à exclure
   * des résultats des recherches Découvrir suivantes. Jamais fatal : une
   * lecture en échec rend un ensemble vide (comportement d'avant cette
   * capacité), jamais une exclusion inventée.
   */
  async excludedSirens(workspaceId: string): Promise<Set<string>> {
    try {
      const rows = await this.feedback.manager.query<Array<{ siren: string }>>(
        `SELECT siren FROM discover_candidate_feedback WHERE workspace_id = $1 AND verdict = 'wrong_company'`,
        [workspaceId],
      )
      return new Set(rows.map(row => row.siren))
    } catch (error) {
      this.logger.warn('Lecture des retours Découvrir en échec (non-fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
      return new Set()
    }
  }
}
