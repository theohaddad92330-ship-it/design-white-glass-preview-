import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import {
  placementGuarantee,
  prorateRetainerCents,
  type MissionBillingDeclarationInput,
  type MissionBillingRead,
  type MissionMilestoneInput,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'
import { asDay } from '../../common/day'

// #2415.9 — `MissionBillingRead` (contrat partagé, GA-26) décrit désormais ce
// que cette méthode rend ; le web (`MissionBillingSection`) importe le MÊME
// type au lieu d'en recopier un second. Ré-exporté ici pour que le
// contrôleur (`import { MissionBillingService, type MissionBillingRead } from
// './mission-billing.service'`) n'ait rien à changer.
export type { MissionBillingRead }

const cents = (value: string | number | null | undefined): number | null =>
  value === null || value === undefined ? null : Number(value)

/**
 * #2417.3 / .4 / .5 — jalon, retainer, placement : DÉCLARATIFS.
 *
 * Tranché par Louis 22/09 soir (decisions §8) : rien de calculé qui ne vienne
 * d'une saisie, source nommée (`manual`, c80). Les calculs vivent à UN seul
 * endroit (`billing-declarations.ts`, GA-26) ; ce service lit, écrit, et les
 * appelle. `InvoiceReadinessService.list` s'en sert pour préparer le montant
 * du mois.
 */
@Injectable()
export class MissionBillingService {
  constructor(
    @InjectRepository(InvoiceReadinessEntity)
    private readonly readiness: Repository<InvoiceReadinessEntity>,
  ) {}

  private async mission(
    workspaceId: string,
    missionId: string,
  ): Promise<{ started_on: string | Date | null; ends_on: string | Date | null }> {
    const [row] = returnedRows<{ started_on: string | Date | null; ends_on: string | Date | null }>(
      await this.readiness.manager.query(
        `SELECT id, started_on, ends_on FROM missions WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [missionId, workspaceId],
      ),
    )
    if (!row) throw new NotFoundException('Mission introuvable')
    return row
  }

  async read(workspaceId: string, missionId: string, today: string): Promise<MissionBillingRead> {
    const mission = await this.mission(workspaceId, missionId)
    const [declared] = returnedRows<{
      retainer_monthly_cents: string | number | null
      placement_fee_cents: string | number | null
      placement_guarantee_days: number | null
    }>(
      await this.readiness.manager.query(
        `SELECT retainer_monthly_cents, placement_fee_cents, placement_guarantee_days
           FROM mission_billing_declarations WHERE mission_id = $1 AND workspace_id = $2`,
        [missionId, workspaceId],
      ),
    )
    const milestones = returnedRows<{
      id: string
      label: string
      due_on: string | Date
      amount_cents: string | number
    }>(
      await this.readiness.manager.query(
        `SELECT id, label, due_on, amount_cents FROM mission_milestones
          WHERE mission_id = $1 AND workspace_id = $2 AND archived_at IS NULL
          ORDER BY due_on ASC`,
        [missionId, workspaceId],
      ),
    )
    const retainerMonthlyCents = cents(declared?.retainer_monthly_cents)
    const guaranteeDays = declared?.placement_guarantee_days ?? null
    const startedOn = asDay(mission.started_on)
    return {
      milestones: milestones.map(m => ({
        id: m.id,
        label: m.label,
        dueOn: asDay(m.due_on) ?? String(m.due_on),
        amountCents: Number(m.amount_cents),
        source: 'manual' as const,
      })),
      retainerMonthlyCents,
      retainerThisMonthCents: prorateRetainerCents(
        retainerMonthlyCents,
        `${today.slice(0, 7)}-01`,
        startedOn,
        asDay(mission.ends_on),
      ),
      placementFeeCents: cents(declared?.placement_fee_cents),
      placementGuaranteeDays: guaranteeDays,
      placementGuarantee: placementGuarantee(startedOn, guaranteeDays, today),
      source: 'manual',
    }
  }

  /** #2417.3 — un jalon DÉCLARÉ : libellé, date, montant. */
  async addMilestone(
    workspaceId: string,
    userId: string,
    missionId: string,
    input: MissionMilestoneInput,
  ): Promise<void> {
    await this.mission(workspaceId, missionId)
    await this.readiness.manager.query(
      `INSERT INTO mission_milestones (mission_id, workspace_id, label, due_on, amount_cents, source, created_by)
       VALUES ($1, $2, $3, $4::date, $5, 'manual', $6)`,
      [missionId, workspaceId, input.label, input.dueOn, input.amountCents, userId],
    )
  }

  /** Un jalon s'ARCHIVE — on archive, on ne supprime pas. */
  async archiveMilestone(workspaceId: string, missionId: string, milestoneId: string): Promise<void> {
    const updated = returnedRows(
      await this.readiness.manager.query(
        `UPDATE mission_milestones SET archived_at = now()
          WHERE id = $1 AND mission_id = $2 AND workspace_id = $3 AND archived_at IS NULL
        RETURNING id`,
        [milestoneId, missionId, workspaceId],
      ),
    )
    if (updated.length === 0) throw new NotFoundException('Jalon introuvable')
  }

  /**
   * #2417.4 / .5 — retainer mensuel, fee et garantie de placement.
   *
   * En FUSION : un champ absent de la charge utile n'est pas touché ; `null`
   * l'efface. Même régime que les conditions commerciales.
   */
  async writeDeclarations(
    workspaceId: string,
    userId: string,
    missionId: string,
    input: MissionBillingDeclarationInput,
  ): Promise<void> {
    await this.mission(workspaceId, missionId)
    await this.readiness.manager.query(
      `INSERT INTO mission_billing_declarations
         (mission_id, workspace_id, retainer_monthly_cents, placement_fee_cents, placement_guarantee_days, source, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'manual', $9, now())
       ON CONFLICT (mission_id) DO UPDATE SET
         retainer_monthly_cents = CASE WHEN $6::boolean
           THEN EXCLUDED.retainer_monthly_cents ELSE mission_billing_declarations.retainer_monthly_cents END,
         placement_fee_cents = CASE WHEN $7::boolean
           THEN EXCLUDED.placement_fee_cents ELSE mission_billing_declarations.placement_fee_cents END,
         placement_guarantee_days = CASE WHEN $8::boolean
           THEN EXCLUDED.placement_guarantee_days ELSE mission_billing_declarations.placement_guarantee_days END,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
       WHERE mission_billing_declarations.workspace_id = $2`,
      [
        missionId,
        workspaceId,
        input.retainerMonthlyCents ?? null,
        input.placementFeeCents ?? null,
        input.placementGuaranteeDays ?? null,
        input.retainerMonthlyCents !== undefined,
        input.placementFeeCents !== undefined,
        input.placementGuaranteeDays !== undefined,
        userId,
      ],
    )
  }
}
