import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { EntityManager, Repository } from 'typeorm'
import {
  computeMissionStartReadiness,
  startGateApplies,
  type MissionStartCheckInput,
  type MissionStartDeclared,
  type MissionStartDeclaredKey,
  type MissionStartItemKey,
  type MissionStartReadiness,
  type MissionStatus,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'

/**
 * Les noms FR d'un manque, pour le message d'un refus (l'écran lit l'i18n).
 *
 * #2338.8 — EXPORTÉ : le pont du copilote (`CopilotBridgeController`) les
 * reprend tels quels pour que Laura nomme un manque avec le MÊME mot que le
 * refus HTTP et que `MissionStartReadinessPanel` (GA-26, un seul endroit).
 */
export const MISSION_START_ITEM_LABEL_FR: Readonly<Record<MissionStartItemKey, string>> = {
  client_agreement: 'accord du client',
  consultant_agreement: 'accord du consultant',
  contract_signed: 'contrat ou bon de commande signé',
  consultant_assigned: 'consultant affecté',
  start_date: 'date de début',
  daily_rate: 'TJM',
  site_access: 'lieu et accès du premier jour',
}

/**
 * #2338 / #2409 — l'état de démarrage d'une mission : les gestes humains
 * encore en vigueur (`mission_start_checks`, non archivés) + ce que la mission
 * porte elle-même (date de début, TJM, une affectation vivante). `null` =
 * mission hors de l'espace.
 */
export async function loadMissionStartReadiness(
  manager: EntityManager,
  workspaceId: string,
  missionId: string,
  now: Date = new Date(),
): Promise<MissionStartReadiness | null> {
  const [data] = returnedRows<{
    started_on: string | Date | null
    daily_rate: string | number | null
    consultant_assigned: boolean
  }>(
    await manager.query(
      `SELECT m.started_on, m.daily_rate,
              EXISTS (SELECT 1 FROM mission_assignments a
                       WHERE a.mission_id = m.id AND a.status IN ('planned','confirmed','active')) AS consultant_assigned
         FROM missions m WHERE m.id = $1 AND m.workspace_id = $2 LIMIT 1`,
      [missionId, workspaceId],
    ),
  )
  if (!data) return null
  const checks = returnedRows<{ item_key: string; proof: string; confirmed_by: string; confirmed_at: string | Date }>(
    await manager.query(
      `SELECT item_key, proof, confirmed_by, confirmed_at FROM mission_start_checks
        WHERE mission_id = $1 AND workspace_id = $2 AND archived_at IS NULL`,
      [missionId, workspaceId],
    ),
  )
  const declared: MissionStartDeclared[] = checks.map(c => ({
    key: c.item_key as MissionStartDeclaredKey,
    proof: c.proof,
    confirmedBy: c.confirmed_by,
    confirmedAt: new Date(c.confirmed_at).toISOString(),
  }))
  const rate = data.daily_rate === null || data.daily_rate === undefined ? null : Number(data.daily_rate)
  return computeMissionStartReadiness({
    declared,
    data: {
      consultantAssigned: Boolean(data.consultant_assigned),
      startDate: data.started_on ? String(data.started_on) : null,
      dailyRate: rate === null || Number.isNaN(rate) ? null : rate,
    },
    now,
  })
}

/**
 * #2338 — LA PORTE. Ne lit rien hors du passage au démarrage ; sinon refuse
 * (409) en nommant chaque prérequis bloquant qui manque. Appelée par les DEUX
 * écrivains de `missions.status` : `MissionStatusService.changeMissionStatus`
 * et `DeliveryService.moveBoardCard`. La création n'y passe jamais.
 */
export async function assertMissionStartGate(
  manager: EntityManager,
  workspaceId: string,
  missionId: string,
  from: MissionStatus,
  to: MissionStatus,
  now: Date = new Date(),
): Promise<void> {
  if (!startGateApplies(from, to)) return
  const readiness = await loadMissionStartReadiness(manager, workspaceId, missionId, now)
  if (!readiness) throw new NotFoundException('Mission introuvable')
  if (readiness.missing.length === 0) return
  throw new ConflictException({
    code: 'mission_start_gate',
    missing: readiness.missing,
    message: `Cette mission ne peut pas démarrer : il manque ${readiness.missing.map(k => MISSION_START_ITEM_LABEL_FR[k]).join(', ')}.`,
  })
}

@Injectable()
export class MissionStartReadinessService {
  constructor(
    @InjectRepository(InvoiceReadinessEntity)
    private readonly repo: Repository<InvoiceReadinessEntity>,
  ) {}

  async readiness(workspaceId: string, missionId: string): Promise<MissionStartReadiness> {
    const readiness = await loadMissionStartReadiness(this.repo.manager, workspaceId, missionId)
    if (!readiness) throw new NotFoundException('Mission introuvable')
    return readiness
  }

  /**
   * Enregistrer un geste (accord, contrat, accès) — daté, avec auteur et
   * preuve. Une re-confirmation ARCHIVE le geste précédent : la dernière
   * main humaine gagne, l'historique reste (on archive, on ne supprime pas).
   */
  async confirm(
    workspaceId: string,
    userId: string,
    missionId: string,
    input: MissionStartCheckInput,
  ): Promise<MissionStartReadiness> {
    await this.assertMission(workspaceId, missionId)
    await this.archive(workspaceId, userId, missionId, input.item)
    await this.repo.manager.query(
      `INSERT INTO mission_start_checks (workspace_id, mission_id, item_key, proof, confirmed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [workspaceId, missionId, input.item, input.proof.trim(), userId],
    )
    return this.readiness(workspaceId, missionId)
  }

  /** Retirer un geste (accord retiré, contrat caduc) : il est ARCHIVÉ. */
  async withdraw(
    workspaceId: string,
    userId: string,
    missionId: string,
    item: MissionStartDeclaredKey,
  ): Promise<MissionStartReadiness> {
    await this.assertMission(workspaceId, missionId)
    await this.archive(workspaceId, userId, missionId, item)
    return this.readiness(workspaceId, missionId)
  }

  private async archive(workspaceId: string, userId: string, missionId: string, item: string): Promise<void> {
    await this.repo.manager.query(
      `UPDATE mission_start_checks SET archived_at = now(), archived_by = $4
        WHERE mission_id = $1 AND workspace_id = $2 AND item_key = $3 AND archived_at IS NULL`,
      [missionId, workspaceId, item, userId],
    )
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
