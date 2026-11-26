import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import {
  computeMissionEndChecklist,
  type MissionEndCheckInput,
  type MissionEndCheckKey,
  type MissionEndChecklist,
  type MissionEndDeclared,
  type MissionEndReasonInput,
  type MissionInterruption,
  type MissionInterruptionInput,
  type MissionInterruptionResponsibility,
  type MissionInterruptionRisk,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'

/**
 * #2414 (LAU-FINAL-128) / épopée #2986 — fin de mission : motif typé,
 * checklist de sortie, mission interrompue. Même patron que
 * {@link import('./mission-start-readiness.service.js').MissionStartReadinessService}
 * : les gestes déclarés vivent en base, le verdict se recalcule en pur
 * ({@link computeMissionEndChecklist}).
 */
@Injectable()
export class MissionEndService {
  constructor(
    @InjectRepository(InvoiceReadinessEntity)
    private readonly repo: Repository<InvoiceReadinessEntity>,
  ) {}

  // ── Checklist de sortie (#2414.11-33) ─────────────────────────────────────

  async checklist(workspaceId: string, missionId: string): Promise<MissionEndChecklist> {
    await this.assertMission(workspaceId, missionId)
    const rows = returnedRows<{ item_key: string; note: string; confirmed_by: string; confirmed_at: string | Date }>(
      await this.repo.manager.query(
        `SELECT item_key, note, confirmed_by, confirmed_at FROM mission_end_checks
          WHERE mission_id = $1 AND workspace_id = $2 AND archived_at IS NULL`,
        [missionId, workspaceId],
      ),
    )
    const declared: MissionEndDeclared[] = rows.map(r => ({
      key: r.item_key as MissionEndCheckKey,
      confirmedAt: new Date(r.confirmed_at).toISOString(),
      confirmedBy: r.confirmed_by,
      note: r.note,
    }))
    return computeMissionEndChecklist({ declared })
  }

  /** Cocher un item : une re-confirmation ARCHIVE le geste précédent (on archive, on ne supprime pas). */
  async confirmCheck(
    workspaceId: string,
    userId: string,
    missionId: string,
    input: MissionEndCheckInput,
  ): Promise<MissionEndChecklist> {
    await this.assertMission(workspaceId, missionId)
    await this.archiveCheck(workspaceId, userId, missionId, input.item)
    await this.repo.manager.query(
      `INSERT INTO mission_end_checks (workspace_id, mission_id, item_key, note, confirmed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [workspaceId, missionId, input.item, input.note.trim(), userId],
    )
    return this.checklist(workspaceId, missionId)
  }

  async withdrawCheck(
    workspaceId: string,
    userId: string,
    missionId: string,
    item: MissionEndCheckKey,
  ): Promise<MissionEndChecklist> {
    await this.assertMission(workspaceId, missionId)
    await this.archiveCheck(workspaceId, userId, missionId, item)
    return this.checklist(workspaceId, missionId)
  }

  private async archiveCheck(workspaceId: string, userId: string, missionId: string, item: string): Promise<void> {
    await this.repo.manager.query(
      `UPDATE mission_end_checks SET archived_at = now(), archived_by = $4
        WHERE mission_id = $1 AND workspace_id = $2 AND item_key = $3 AND archived_at IS NULL`,
      [missionId, workspaceId, item, userId],
    )
  }

  // ── Motif de fin typé (#2414.1-8) ─────────────────────────────────────────

  async setEndReason(workspaceId: string, missionId: string, input: MissionEndReasonInput): Promise<void> {
    await this.assertMission(workspaceId, missionId)
    await this.repo.manager.query(
      `UPDATE missions SET end_reason = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3`,
      [input.reason, missionId, workspaceId],
    )
  }

  // ── Mission interrompue — NO-GO (#2414.54-59) ─────────────────────────────

  /**
   * Déclare une interruption : motif du bilan des responsabilités, risque,
   * les deux accusés (confidentialité, non-sollicitation). N'écrit JAMAIS de
   * disponibilité confirmée — {@link confirmAvailability} est le SEUL chemin,
   * un second geste humain distinct (NO-GO du #2414).
   */
  async declareInterruption(
    workspaceId: string,
    userId: string,
    missionId: string,
    input: MissionInterruptionInput,
  ): Promise<void> {
    await this.assertMission(workspaceId, missionId)
    const existing = returnedRows<{ id: string }>(
      await this.repo.manager.query(
        `SELECT id FROM mission_interruptions WHERE mission_id = $1 AND workspace_id = $2 LIMIT 1`,
        [missionId, workspaceId],
      ),
    )
    if (existing.length > 0) {
      throw new ConflictException('Cette mission porte déjà une déclaration d’interruption.')
    }
    await this.repo.manager.query(
      `INSERT INTO mission_interruptions
         (workspace_id, mission_id, responsibility, risk, confidentiality_acknowledged,
          non_solicitation_acknowledged, note, availability_confirmed, declared_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)`,
      [
        workspaceId,
        missionId,
        input.responsibility,
        input.risk,
        input.confidentialityAcknowledged,
        input.nonSolicitationAcknowledged,
        input.note.trim(),
        userId,
      ],
    )
    // Le motif TYPÉ de la mission suit sa déclaration d'interruption — sans second geste.
    await this.setEndReason(workspaceId, missionId, { reason: 'interruption' })
  }

  /**
   * #2414 NO-GO — le SEUL chemin qui lève `availability_confirmed`. Exige
   * qu'une interruption ait été déclarée au préalable : on ne revalide rien
   * qui n'a pas été posé.
   */
  async confirmAvailability(workspaceId: string, userId: string, missionId: string): Promise<void> {
    await this.assertMission(workspaceId, missionId)
    const [row] = returnedRows<{ id: string }>(
      await this.repo.manager.query(
        `SELECT id FROM mission_interruptions WHERE mission_id = $1 AND workspace_id = $2 LIMIT 1`,
        [missionId, workspaceId],
      ),
    )
    if (!row) throw new NotFoundException('Aucune interruption déclarée pour cette mission.')
    await this.repo.manager.query(
      `UPDATE mission_interruptions SET availability_confirmed = true, availability_confirmed_by = $1, availability_confirmed_at = now()
        WHERE mission_id = $2 AND workspace_id = $3`,
      [userId, missionId, workspaceId],
    )
  }

  /** L'interruption déclarée pour cette mission, ou `null` — jamais devinée. */
  async readInterruption(workspaceId: string, missionId: string): Promise<MissionInterruption | null> {
    await this.assertMission(workspaceId, missionId)
    const [row] = returnedRows<{
      id: string
      mission_id: string
      responsibility: string
      risk: string
      confidentiality_acknowledged: boolean
      non_solicitation_acknowledged: boolean
      note: string
      availability_confirmed: boolean
      availability_confirmed_by: string | null
      availability_confirmed_at: string | Date | null
      declared_by: string
      declared_at: string | Date
    }>(
      await this.repo.manager.query(
        `SELECT id, mission_id, responsibility, risk, confidentiality_acknowledged, non_solicitation_acknowledged,
                note, availability_confirmed, availability_confirmed_by, availability_confirmed_at, declared_by, declared_at
           FROM mission_interruptions WHERE mission_id = $1 AND workspace_id = $2 LIMIT 1`,
        [missionId, workspaceId],
      ),
    )
    if (!row) return null
    return {
      id: row.id,
      missionId: row.mission_id,
      responsibility: row.responsibility as MissionInterruptionResponsibility,
      risk: row.risk as MissionInterruptionRisk,
      confidentialityAcknowledged: true,
      nonSolicitationAcknowledged: true,
      note: row.note,
      availabilityConfirmed: row.availability_confirmed,
      availabilityConfirmedAt: row.availability_confirmed_at
        ? new Date(row.availability_confirmed_at).toISOString()
        : null,
      availabilityConfirmedBy: row.availability_confirmed_by,
      declaredBy: row.declared_by,
      declaredAt: new Date(row.declared_at).toISOString(),
    }
  }

  private async assertMission(workspaceId: string, missionId: string): Promise<void> {
    const [row] = returnedRows<{ id: string }>(
      await this.repo.manager.query(`SELECT id FROM missions WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
        missionId,
        workspaceId,
      ]),
    )
    if (!row) throw new NotFoundException('Mission introuvable')
  }
}
