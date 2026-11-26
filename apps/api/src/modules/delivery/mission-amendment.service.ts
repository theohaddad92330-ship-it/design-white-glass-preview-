import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import {
  missionAmendmentStatusMove,
  missionAmendmentStatusSchema,
  type MissionAmendmentView,
  type ProposeMissionAmendmentInput,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'

interface AmendmentRow {
  id: string
  mission_id: string
  event_type: string
  status: string
  effective_from: string
  proof: string
  previous_term: Record<string, unknown> | null
  new_term: Record<string, unknown> | null
  pause_cause: string | null
  note: string | null
  requested_by: string
  requested_at: string | Date
  approved_by: string | null
  approved_at: string | Date | null
}

function toView(row: AmendmentRow): MissionAmendmentView {
  return {
    id: row.id,
    missionId: row.mission_id,
    eventType: row.event_type as MissionAmendmentView['eventType'],
    status: row.status as MissionAmendmentView['status'],
    effectiveFrom: row.effective_from,
    proof: row.proof,
    previousTerm: row.previous_term,
    newTerm: row.new_term,
    pauseCause: row.pause_cause as MissionAmendmentView['pauseCause'],
    note: row.note,
    requestedBy: row.requested_by,
    requestedAt: new Date(row.requested_at).toISOString(),
    approvedBy: row.approved_by,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
  }
}

/**
 * #2423 — LAU-FINAL-137 : les CHANGEMENTS d'une mission.
 *
 * Le seul écrivain de `mission_amendments`. `propose()` insère une ligne
 * IMMUABLE (#2423.1) : `event_type`/`effective_from`/`proof`/`previous_term`/
 * `new_term` ne sont jamais réécrits ensuite — `changeStatus()` ne touche QUE
 * `status`, `approved_by`, `approved_at`, `updated_at`.
 *
 * ⚠️ NO-GO (#2423.10) : ce service n'écrit AUCUNE autre table — ni `missions`,
 * ni `mission_timesheets`, ni `mission_rate_history`. Aucun avenant, même
 * `active`, ne recalcule ici une période déjà facturée : l'APPLICATION d'un
 * avenant accepté aux champs vivants de la mission est une tranche distincte,
 * non livrée par ce fichier (voir le registre #2423).
 */
@Injectable()
export class MissionAmendmentService {
  constructor(
    @InjectRepository(InvoiceReadinessEntity)
    private readonly repo: Repository<InvoiceReadinessEntity>,
  ) {}

  private async assertMissionInWorkspace(workspaceId: string, missionId: string): Promise<void> {
    const [row] = returnedRows<{ id: string }>(
      await this.repo.manager.query(`SELECT id FROM missions WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
        missionId,
        workspaceId,
      ]),
    )
    if (!row) throw new NotFoundException('Mission introuvable')
  }

  async propose(
    workspaceId: string,
    userId: string,
    missionId: string,
    input: ProposeMissionAmendmentInput,
  ): Promise<MissionAmendmentView> {
    await this.assertMissionInWorkspace(workspaceId, missionId)

    // #2423.7 — une pause qui commence NOMME sa cause, jamais devinée.
    if (input.eventType === 'pause_start' && !input.pauseCause) {
      throw new BadRequestException('Une pause qui commence doit nommer sa cause.')
    }

    const [row] = returnedRows<AmendmentRow>(
      await this.repo.manager.query(
        `INSERT INTO mission_amendments
           (workspace_id, mission_id, event_type, effective_from, proof, previous_term, new_term, pause_cause, note, requested_by)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10)
         RETURNING id, mission_id, event_type, status, effective_from, proof, previous_term, new_term, pause_cause, note,
                   requested_by, requested_at, approved_by, approved_at`,
        [
          workspaceId,
          missionId,
          input.eventType,
          input.effectiveFrom,
          input.proof,
          input.previousTerm ? JSON.stringify(input.previousTerm) : null,
          input.newTerm ? JSON.stringify(input.newTerm) : null,
          input.pauseCause ?? null,
          input.note ?? null,
          userId,
        ],
      ),
    )
    return toView(row)
  }

  async list(workspaceId: string, missionId: string): Promise<MissionAmendmentView[]> {
    await this.assertMissionInWorkspace(workspaceId, missionId)
    const rows = returnedRows<AmendmentRow>(
      await this.repo.manager.query(
        `SELECT id, mission_id, event_type, status, effective_from, proof, previous_term, new_term, pause_cause, note,
                requested_by, requested_at, approved_by, approved_at
           FROM mission_amendments
          WHERE mission_id = $1 AND workspace_id = $2
          ORDER BY requested_at DESC`,
        [missionId, workspaceId],
      ),
    )
    return rows.map(toView)
  }

  async changeStatus(
    workspaceId: string,
    userId: string,
    missionId: string,
    amendmentId: string,
    input: { to: string; reason?: string },
  ): Promise<MissionAmendmentView> {
    const to = missionAmendmentStatusSchema.safeParse(input.to)
    if (!to.success) throw new BadRequestException('Statut d’avenant inconnu.')
    const [row] = returnedRows<{ status: string }>(
      await this.repo.manager.query(
        `SELECT status FROM mission_amendments WHERE id = $1 AND mission_id = $2 AND workspace_id = $3 LIMIT 1`,
        [amendmentId, missionId, workspaceId],
      ),
    )
    if (!row) throw new NotFoundException('Avenant introuvable')
    const from = missionAmendmentStatusSchema.safeParse(row.status)
    if (!from.success) throw new ConflictException('Le statut actuel de cet avenant est hors du vocabulaire.')
    const move = missionAmendmentStatusMove(from.data, to.data)
    if (move === 'refused') {
      throw new ConflictException('Ce changement de statut d’avenant saute une étape — la table le refuse.')
    }

    const SELECT_COLUMNS = `id, mission_id, event_type, status, effective_from, proof, previous_term, new_term, pause_cause, note,
                    requested_by, requested_at, approved_by, approved_at`

    if (move === 'same') {
      const [current] = returnedRows<AmendmentRow>(
        await this.repo.manager.query(
          `SELECT ${SELECT_COLUMNS} FROM mission_amendments WHERE id = $1 AND mission_id = $2 AND workspace_id = $3`,
          [amendmentId, missionId, workspaceId],
        ),
      )
      return toView(current)
    }

    // #2423.5 — passer "accepté" pose l'approbation (qui, quand) dans la
    // même écriture ; tout autre passage EN AVANT (rejeté, annulé, actif
    // depuis accepté) ne touche que le statut.
    const setApproval = to.data === 'accepted'
    const [updated] = returnedRows<AmendmentRow>(
      await this.repo.manager.query(
        `UPDATE mission_amendments SET status = $4, updated_at = now()${
          setApproval ? ', approved_by = $5, approved_at = now()' : ''
        }
          WHERE id = $1 AND mission_id = $2 AND workspace_id = $3
        RETURNING ${SELECT_COLUMNS}`,
        setApproval
          ? [amendmentId, missionId, workspaceId, to.data, userId]
          : [amendmentId, missionId, workspaceId, to.data],
      ),
    )
    return toView(updated)
  }
}
