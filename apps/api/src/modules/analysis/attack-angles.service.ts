import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { type EntityManager, Repository } from 'typeorm'
import type { AnalysisAttackAngle } from '@bellum/contracts'
import { AttackAngleEntity } from '../../database/entities/attack-angle.entity'

@Injectable()
export class AttackAnglesService {
  constructor(
    @InjectRepository(AttackAngleEntity)
    private readonly attackAngles: Repository<AttackAngleEntity>,
  ) {}

  /**
   * Persist the ranked attack angles produced by Phase 1. The first angle
   * is flagged as recommended; rank starts at 1.
   *
   * Multi-user Phase 2: each row carries ``workspace_id`` (the run owner's
   * active workspace, resolved by the caller) so the team-scoped reads see it;
   * ``user_id`` is kept as created-by attribution. See
   * ``agent_docs/multi-user-workspaces.md``.
   *
   * Accepts an optional ``manager`` so the caller can wrap the insert in
   * the same transaction as the matching ``analysis.phase_completed``
   * outbox event (see ``AnalysisPersistenceService.saveResearch``).
   */
  async bulkInsert(
    accountId: string,
    userId: string,
    workspaceId: string,
    angles: AnalysisAttackAngle[],
    manager?: EntityManager,
  ): Promise<void> {
    if (!angles.length) return
    const repo = manager ? manager.getRepository(AttackAngleEntity) : this.attackAngles
    const rows = angles.map((angle, i) =>
      repo.create({
        account_id: accountId,
        user_id: userId,
        workspace_id: workspaceId,
        title: angle.title,
        description: angle.strategy || angle.description,
        entry_point: angle.entry_contact_persona,
        is_recommended: i === 0,
        rank: i + 1,
      }),
    )
    await repo.save(rows)
  }
}
