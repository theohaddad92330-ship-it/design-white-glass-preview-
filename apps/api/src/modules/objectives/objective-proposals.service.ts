import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CreateObjectiveProposal, ObjectiveProposal, ObjectiveProposalsResponse } from '@bellum/contracts'
import { can } from '@bellum/contracts'
import { MemberObjectiveEntity } from '../../database/entities/member-objective.entity'
import { ObjectiveProposalEntity } from '../../database/entities/objective-proposal.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

function firstOfMonth(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

const numOrNull = (v: string | number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v)
const strOrNull = (v: number | null | undefined): string | null => (v === null || v === undefined ? null : String(v))

function toWire(row: ObjectiveProposalEntity): ObjectiveProposal {
  return {
    id: row.id,
    user_id: row.user_id,
    proposed_by: row.proposed_by,
    period_month: typeof row.period_month === 'string' ? row.period_month.slice(0, 10) : firstOfMonth(),
    target_meetings: row.target_meetings ?? null,
    target_accounts: row.target_accounts ?? null,
    target_revenue: numOrNull(row.target_revenue),
    target_qualified_needs: row.target_qualified_needs ?? null,
    target_placements: row.target_placements ?? null,
    target_margin_percent: numOrNull(row.target_margin_percent),
    target_consultants_on_mission: row.target_consultants_on_mission ?? null,
    reason: row.reason ?? null,
    status: row.status,
    responded_at: row.responded_at ? new Date(row.responded_at).toISOString() : null,
    created_at: new Date(row.created_at).toISOString(),
  }
}

/**
 * Théo D team-business.N2 — « Un objectif choisi, pas imposé en silence ».
 *
 * La direction PROPOSE une cible ; la cible actuelle du membre ne change que
 * s'il ACCEPTE. Refuser ne change rien, et la proposition répondue reste
 * lisible (on archive, on ne supprime pas).
 */
@Injectable()
export class ObjectiveProposalsService {
  constructor(
    @InjectRepository(ObjectiveProposalEntity) private readonly proposals: Repository<ObjectiveProposalEntity>,
    @InjectRepository(MemberObjectiveEntity) private readonly objectives: Repository<MemberObjectiveEntity>,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  private async assertManager(userId: string): Promise<string> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    if (!can(role, extra, 'team:manage')) {
      throw new ForbiddenException('Proposer une cible est réservé à ceux qui encadrent une équipe.')
    }
    return workspaceId
  }

  async propose(managerId: string, body: CreateObjectiveProposal): Promise<ObjectiveProposal> {
    const workspaceId = await this.assertManager(managerId)
    if (body.user_id === managerId) {
      throw new BadRequestException('On déclare sa propre cible ; on ne se la propose pas.')
    }
    if (!(await this.workspaceContext.getMembership(body.user_id, workspaceId))) {
      throw new NotFoundException('Ce membre ne fait pas partie de cet espace.')
    }
    const targets = {
      target_meetings: body.target_meetings ?? null,
      target_accounts: body.target_accounts ?? null,
      target_revenue: strOrNull(body.target_revenue),
      target_qualified_needs: body.target_qualified_needs ?? null,
      target_placements: body.target_placements ?? null,
      target_margin_percent: strOrNull(body.target_margin_percent),
      target_consultants_on_mission: body.target_consultants_on_mission ?? null,
    }
    if (Object.values(targets).every(v => v === null)) {
      throw new BadRequestException('Propose au moins une cible.')
    }
    const period = body.period_month ?? firstOfMonth()
    // Une seule proposition en attente par membre et par mois : la nouvelle remplace l'ancienne.
    const pending = await this.proposals.findOne({
      where: { workspace_id: workspaceId, user_id: body.user_id, period_month: period, status: 'proposed' },
    })
    const entity =
      pending ??
      this.proposals.create({
        workspace_id: workspaceId,
        user_id: body.user_id,
        period_month: period,
        status: 'proposed',
        responded_at: null,
      })
    Object.assign(entity, targets, { proposed_by: managerId, reason: body.reason?.trim() || null })
    return toWire(await this.proposals.save(entity))
  }

  /** Les propositions d'un mois pour l'équipe (direction) — répondues comprises. */
  async listForTeam(managerId: string, month?: string): Promise<ObjectiveProposalsResponse> {
    const workspaceId = await this.assertManager(managerId)
    const period = month ?? firstOfMonth()
    const rows = await this.proposals.find({
      where: { workspace_id: workspaceId, period_month: period },
      order: { created_at: 'DESC' },
    })
    return { period_month: period, proposals: rows.map(toWire) }
  }

  /** Mes propositions EN ATTENTE de réponse. */
  async listMine(userId: string): Promise<ObjectiveProposal[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const rows = await this.proposals.find({
      where: { workspace_id: workspaceId, user_id: userId, status: 'proposed' },
      order: { created_at: 'DESC' },
    })
    return rows.map(toWire)
  }

  async respond(userId: string, id: string, decision: 'accepted' | 'refused'): Promise<ObjectiveProposal> {
    const row = await this.proposals.findOne({ where: { id } })
    if (!row) throw new NotFoundException('Proposition introuvable.')
    if (row.user_id !== userId) throw new ForbiddenException('Seul le membre concerné répond à une proposition.')
    if (row.status !== 'proposed') throw new ConflictException('Cette proposition a déjà reçu une réponse.')

    if (decision === 'accepted') {
      const existing = await this.objectives.findOne({
        where: { user_id: userId, workspace_id: row.workspace_id, period_month: row.period_month },
      })
      const objective =
        existing ??
        this.objectives.create({ user_id: userId, workspace_id: row.workspace_id, period_month: row.period_month })
      // Seuls les axes PROPOSÉS écrasent ; un axe non proposé garde la cible du membre.
      if (row.target_meetings !== null) objective.target_meetings = row.target_meetings
      if (row.target_accounts !== null) objective.target_accounts = row.target_accounts
      if (row.target_revenue !== null) objective.target_revenue = String(row.target_revenue)
      if (row.target_qualified_needs !== null) objective.target_qualified_needs = row.target_qualified_needs
      if (row.target_placements !== null) objective.target_placements = row.target_placements
      if (row.target_margin_percent !== null) objective.target_margin_percent = String(row.target_margin_percent)
      if (row.target_consultants_on_mission !== null) {
        objective.target_consultants_on_mission = row.target_consultants_on_mission
      }
      await this.objectives.save(objective)
    }
    row.status = decision
    row.responded_at = new Date()
    return toWire(await this.proposals.save(row))
  }
}
