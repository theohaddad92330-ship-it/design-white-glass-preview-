import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { EntityManager, Repository } from 'typeorm'
import {
  assignmentStatusMove,
  assignmentStatusSchema,
  missionStatusMove,
  missionStatusSchema,
  type StatusMove,
} from '@bellum/contracts'
import { returnedRows } from '../../database/returned-rows'
import { InvoiceReadinessEntity } from '../../database/entities/invoice-readiness.entity'
import { assertMissionStartGate } from './mission-start-readiness.service'

/** #2407.3 — d'où vient la valeur COURANTE d'un champ. `null` = jamais tracée. */
export interface MissionFieldSources {
  /** Le CLIENT — écrit une seule fois, à la création (aucune route ne le change ensuite). */
  accountId: { source: string; at: string } | null
  /** L'INTITULÉ — même régime que le client. */
  label: { source: string; at: string } | null
  startedOn: { source: string; at: string } | null
  endsOn: { source: string; at: string } | null
  dailyRate: { source: string; at: string } | null
}

/**
 * #2407.3 — RÉFUTÉ en prod le 23/09 : les champs que l'endpoint couvre, à UN
 * seul endroit (GA-26). `account_id`/`label` ne bougent qu'à la création
 * (`DeliveryService.create`) ; `started_on`/`ends_on`/`daily_rate` peuvent
 * aussi être corrigés ensuite (`DeliveryService.updateMission`). Les cinq
 * partagent la MÊME lecture — `lieu`/`remote` de l'issue #2407 appartiennent à
 * l'AFFECTATION (`mission_assignments`, #2407.4, déjà livré), pas à la
 * mission : les élargir ici confondrait deux objets distincts.
 */
export const MISSION_TRACKED_FIELDS = ['account_id', 'label', 'started_on', 'ends_on', 'daily_rate'] as const

export interface StatusChange {
  from: string
  to: string
  direction: 'forward' | 'backward' | 'same'
}

/**
 * Le verdict de la table stricte, traduit en réponse HTTP. Un seul endroit
 * pour la mission, l'affectation ET le tableau de bord (`moveBoardCard`).
 */
export function assertStatusMove(move: StatusMove, reason: string | undefined | null): void {
  if (move === 'refused') {
    throw new ConflictException(
      'Ce changement de statut saute une étape ou échange deux fins : la table des transitions le refuse.',
    )
  }
  if (move === 'backward' && !reason?.trim()) {
    throw new BadRequestException('Un retour arrière de statut se déclare avec son motif — il est journalisé.')
  }
}

/** Le JOURNAL d'une transition (#2407.5/.6) — le motif d'un retour arrière y reste. */
export async function journalStatusTransition(
  manager: EntityManager,
  entry: {
    workspaceId: string
    missionId: string
    assignmentId: string | null
    from: string
    to: string
    direction: 'forward' | 'backward'
    reason: string | null
    actorId: string
  },
): Promise<void> {
  await manager.query(
    `INSERT INTO mission_status_transitions
       (workspace_id, mission_id, assignment_id, subject, from_status, to_status, direction, reason, actor_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      entry.workspaceId,
      entry.missionId,
      entry.assignmentId,
      entry.assignmentId ? 'assignment' : 'mission',
      entry.from,
      entry.to,
      entry.direction,
      entry.reason,
      entry.actorId,
    ],
  )
}

/**
 * #2407.5 / #2407.6 — changer le statut d'une mission ou d'une affectation.
 *
 * Tranché par Louis 22/09 soir (decisions §9) : table STRICTE
 * (`status-transitions.ts`), en avant par défaut, retour arrière permis AVEC
 * motif journalisé. L'affectation ne touche jamais le statut de la mission
 * (#2407.7) : un consultant qui sort ne termine pas la mission.
 */
@Injectable()
export class MissionStatusService {
  constructor(
    @InjectRepository(InvoiceReadinessEntity)
    private readonly repo: Repository<InvoiceReadinessEntity>,
  ) {}

  async changeMissionStatus(
    workspaceId: string,
    userId: string,
    missionId: string,
    input: { to: string; reason?: string },
  ): Promise<StatusChange> {
    const to = missionStatusSchema.safeParse(input.to)
    if (!to.success) throw new BadRequestException('Statut de mission inconnu.')
    const [row] = returnedRows<{ status: string }>(
      await this.repo.manager.query(`SELECT status FROM missions WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
        missionId,
        workspaceId,
      ]),
    )
    if (!row) throw new NotFoundException('Mission introuvable')
    const from = missionStatusSchema.safeParse(row.status)
    // Un statut hors vocabulaire en base ne se juge pas : on ne devine pas son rang.
    if (!from.success) throw new ConflictException('Le statut actuel de cette mission est hors du vocabulaire.')
    const move = missionStatusMove(from.data, to.data)
    if (move === 'same') return { from: from.data, to: to.data, direction: 'same' }
    assertStatusMove(move, input.reason)
    const direction = move === 'backward' ? 'backward' : 'forward'
    // #2338 / #2409 — le passage au démarrage exige les deux accords et la
    // checklist bloquante ; le refus (409) nomme chaque manque.
    if (move === 'forward') {
      await assertMissionStartGate(this.repo.manager, workspaceId, missionId, from.data, to.data)
    }

    await this.repo.manager.query(
      `UPDATE missions SET status = $3, stage_entered_at = now(), updated_at = now()
        WHERE id = $1 AND workspace_id = $2`,
      [missionId, workspaceId, to.data],
    )
    await journalStatusTransition(this.repo.manager, {
      workspaceId,
      missionId,
      assignmentId: null,
      from: from.data,
      to: to.data,
      direction,
      reason: input.reason?.trim() || null,
      actorId: userId,
    })

    // #2409.10 — annuler une mission AVANT son démarrage libère le consultant
    // SANS second geste : les affectations encore PLANIFIÉES/CONFIRMÉES (donc
    // jamais devenues actives) passent "terminée" dans la même transaction.
    // Une mission déjà démarrée (`at_risk`, `active`…) n'entre jamais ici —
    // ce n'est plus "avant démarrage", et une affectation active ne se libère
    // pas d'elle-même (#2407.7 : l'affectation reste un geste séparé).
    if (
      to.data === 'cancelled' &&
      (from.data === 'draft' || from.data === 'onboarding' || from.data === 'ready_to_start')
    ) {
      const assignments = returnedRows<{ id: string; status: string }>(
        await this.repo.manager.query(
          `SELECT a.id, a.status FROM mission_assignments a JOIN missions m ON m.id = a.mission_id
            WHERE a.mission_id = $1 AND m.workspace_id = $2 AND a.status IN ('planned','confirmed')`,
          [missionId, workspaceId],
        ),
      )
      for (const assignment of assignments) {
        await this.repo.manager.query(
          `UPDATE mission_assignments a SET status = 'terminated'
             FROM missions m
            WHERE a.id = $1 AND a.mission_id = $2 AND m.id = a.mission_id AND m.workspace_id = $3`,
          [assignment.id, missionId, workspaceId],
        )
        await journalStatusTransition(this.repo.manager, {
          workspaceId,
          missionId,
          assignmentId: assignment.id,
          from: assignment.status,
          to: 'terminated',
          direction: 'forward',
          reason: 'Mission annulée avant démarrage — consultant libéré automatiquement.',
          actorId: userId,
        })
      }
    }

    return { from: from.data, to: to.data, direction }
  }

  /**
   * #4196 — ce que le cycle de vie d'une mission a besoin de savoir : son
   * statut, son échéance, son TJM, et les consultants dont l'affectation n'est
   * pas finie (planifiée, confirmée, active… — ni terminée, ni remplacée).
   * `null` = mission introuvable dans l'espace.
   */
  async lifecycleFacts(
    workspaceId: string,
    missionId: string,
  ): Promise<{
    status: string
    endsOn: string | null
    dailyRate: number | null
    consultantIds: string[]
  } | null> {
    const [mission] = returnedRows<{ status: string; ends_on: string | null; daily_rate: string | number | null }>(
      await this.repo.manager.query(
        `SELECT status, ends_on::text AS ends_on, daily_rate FROM missions WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
        [missionId, workspaceId],
      ),
    )
    if (!mission) return null
    const assignees = returnedRows<{ consultant_id: string }>(
      await this.repo.manager.query(
        `SELECT DISTINCT a.consultant_id FROM mission_assignments a
           JOIN missions m ON m.id = a.mission_id
          WHERE a.mission_id = $1 AND m.workspace_id = $2
            AND a.status NOT IN ('completed', 'terminated', 'replaced')`,
        [missionId, workspaceId],
      ),
    )
    return {
      status: mission.status,
      endsOn: mission.ends_on,
      dailyRate: mission.daily_rate === null ? null : Number(mission.daily_rate),
      consultantIds: assignees.map(row => row.consultant_id),
    }
  }

  async changeAssignmentStatus(
    workspaceId: string,
    userId: string,
    missionId: string,
    assignmentId: string,
    input: { to: string; reason?: string },
  ): Promise<StatusChange> {
    const to = assignmentStatusSchema.safeParse(input.to)
    if (!to.success) throw new BadRequestException("Statut d'affectation inconnu.")
    const [row] = returnedRows<{ status: string }>(
      await this.repo.manager.query(
        `SELECT a.status FROM mission_assignments a JOIN missions m ON m.id = a.mission_id
          WHERE a.id = $1 AND a.mission_id = $3 AND m.workspace_id = $2 LIMIT 1`,
        [assignmentId, workspaceId, missionId],
      ),
    )
    if (!row) throw new NotFoundException('Affectation introuvable')
    const from = assignmentStatusSchema.safeParse(row.status)
    if (!from.success) throw new ConflictException('Le statut actuel de cette affectation est hors du vocabulaire.')
    const move = assignmentStatusMove(from.data, to.data)
    if (move === 'same') return { from: from.data, to: to.data, direction: 'same' }
    assertStatusMove(move, input.reason)
    const direction = move === 'backward' ? 'backward' : 'forward'

    // #2407.7 — SEULE l'affectation change : jamais le statut de la mission.
    await this.repo.manager.query(
      `UPDATE mission_assignments a SET status = $4
         FROM missions m
        WHERE a.id = $1 AND a.mission_id = $3 AND m.id = a.mission_id AND m.workspace_id = $2`,
      [assignmentId, workspaceId, missionId, to.data],
    )
    await journalStatusTransition(this.repo.manager, {
      workspaceId,
      missionId,
      assignmentId,
      from: from.data,
      to: to.data,
      direction,
      reason: input.reason?.trim() || null,
      actorId: userId,
    })
    return { from: from.data, to: to.data, direction }
  }

  /**
   * #2407.3 — RÉFUTÉ en prod le 23/09 (ne couvrait que dates + TJM). La
   * provenance des champs PRINCIPAUX de la mission (client, intitulé, dates,
   * TJM — `MISSION_TRACKED_FIELDS`), lue dans la trace écrite par `create` et
   * `updateMission` : la dernière écriture de chaque champ, sa source et sa
   * date. Aucune source devinée : un champ jamais tracé rend `null`.
   */
  async fieldSources(workspaceId: string, missionId: string): Promise<MissionFieldSources> {
    const [mission] = returnedRows<{ id: string }>(
      await this.repo.manager.query(`SELECT id FROM missions WHERE id = $1 AND workspace_id = $2 LIMIT 1`, [
        missionId,
        workspaceId,
      ]),
    )
    if (!mission) throw new NotFoundException('Mission introuvable')
    const rows = returnedRows<{ field: string; source: string; created_at: string | Date }>(
      await this.repo.manager.query(
        `SELECT DISTINCT ON (field) field, source, created_at
           FROM record_field_audit
          WHERE workspace_id = $1 AND entity_type = 'mission' AND entity_id = $2
            AND field = ANY($3::text[])
          ORDER BY field, created_at DESC`,
        [workspaceId, missionId, MISSION_TRACKED_FIELDS],
      ),
    )
    const of = (field: string) => {
      const row = rows.find(r => r.field === field)
      return row ? { source: row.source, at: new Date(row.created_at).toISOString() } : null
    }
    return {
      accountId: of('account_id'),
      label: of('label'),
      startedOn: of('started_on'),
      endsOn: of('ends_on'),
      dailyRate: of('daily_rate'),
    }
  }
}
