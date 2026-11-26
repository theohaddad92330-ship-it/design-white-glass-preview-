import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { buildConsumption, type ConsumptionReport } from './credit-consumption'

/** La fenêtre de consommation par défaut : les 30 derniers jours, celle de l'écran. */
const DEFAULT_WINDOW_DAYS = 30

/** Bornes de la fenêtre demandée : au-delà, la requête n'apprend plus rien de plus. */
const MAX_WINDOW_DAYS = 365

/** Combien d'espaces l'écran rend au plus (même borne que la santé des clients). */
const MAX_ROWS = 500

/**
 * #4467 — la consommation de crédits par espace ET par utilisateur, pour le
 * back-office Bellum. LECTURE SEULE. C'est le seul endroit où elle se voit : ni
 * l'utilisateur ni le manager de l'ESN cliente ne la lisent (épopée #4468).
 *
 * Le solde est celui du POOL de l'espace (l'abonnement du propriétaire) — il est
 * partagé, il n'existe pas de solde individuel. La consommation par membre vient
 * du grand livre (`credit_ledger.actor_user_id`), net des remboursements.
 */
@Injectable()
export class AdminCreditConsumptionService {
  constructor(
    @InjectRepository(WorkspaceEntity) private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity) private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(SubscriptionEntity) private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(CreditLedgerEntity) private readonly ledger: Repository<CreditLedgerEntity>,
  ) {}

  async report(query: { search?: string; days?: number; now: Date }): Promise<ConsumptionReport> {
    const windowDays = clampDays(query.days)
    const since = new Date(query.now.getTime() - windowDays * 86_400_000)

    const qb = this.workspaces.createQueryBuilder('w')
    if (query.search) qb.where('w.name ILIKE :s', { s: `%${query.search}%` })
    const rows = await qb.orderBy('w.created_at', 'DESC').limit(MAX_ROWS).getMany()
    if (rows.length === 0) return { windowDays, workspaces: [], users: [], exhausted: [] }

    const workspaceIds = rows.map(row => row.id)
    const ownerIds = [...new Set(rows.map(row => row.owner_user_id))]

    const [memberRows, subs, ledgerRows] = await Promise.all([
      this.members
        .createQueryBuilder('m')
        .select('m.workspace_id', 'workspaceId')
        .addSelect('m.user_id', 'userId')
        .where('m.workspace_id IN (:...ids)', { ids: workspaceIds })
        .getRawMany<{ workspaceId: string; userId: string }>(),
      this.subscriptions.find({ where: { user_id: In(ownerIds) } }),
      // Net des remboursements : un débit remboursé (c78) n'est pas une consommation.
      this.ledger
        .createQueryBuilder('l')
        .select('l.workspace_id', 'workspaceId')
        .addSelect('l.actor_user_id', 'actorUserId')
        .addSelect('COALESCE(SUM(-l.delta), 0)', 'consumed')
        .where('l.workspace_id IN (:...ids)', { ids: workspaceIds })
        .andWhere("l.kind IN ('consume_analysis', 'refund_analysis')")
        .andWhere('l.created_at >= :since', { since })
        .groupBy('l.workspace_id')
        .addGroupBy('l.actor_user_id')
        .getRawMany<{ workspaceId: string; actorUserId: string | null; consumed: string | number }>(),
    ])

    const memberIds = [...new Set(memberRows.map(row => row.userId))]
    const profileRows = memberIds.length > 0 ? await this.profiles.find({ where: { user_id: In(memberIds) } }) : []
    const emails = new Map(profileRows.map(profile => [profile.user_id, profile.email ?? null]))

    const membersByWorkspace = new Map<string, string[]>()
    for (const row of memberRows) {
      const list = membersByWorkspace.get(row.workspaceId) ?? []
      list.push(row.userId)
      membersByWorkspace.set(row.workspaceId, list)
    }
    const subByOwner = new Map(subs.map(sub => [sub.user_id, sub]))

    return buildConsumption({
      windowDays,
      workspaces: rows.map(row => ({
        id: row.id,
        name: row.name,
        ownerUserId: row.owner_user_id,
        memberIds: membersByWorkspace.get(row.id) ?? [],
        sub: subByOwner.get(row.owner_user_id) ?? null,
      })),
      ledger: ledgerRows.map(row => ({
        workspaceId: row.workspaceId,
        actorUserId: row.actorUserId,
        consumed: Math.max(0, Number(row.consumed)),
      })),
      emails,
    })
  }
}

function clampDays(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) return DEFAULT_WINDOW_DAYS
  return Math.min(MAX_WINDOW_DAYS, Math.max(1, Math.trunc(days)))
}
