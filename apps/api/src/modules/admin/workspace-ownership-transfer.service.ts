import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import type { WorkspaceRole } from '@bellum/contracts'
import { DataSource, type EntityManager } from 'typeorm'
import {
  planOwnershipTransfer,
  type OwnershipTransferContext,
  type OwnershipTransferPlan,
} from './workspace-ownership-transfer-plan'

export type OwnershipTransferPreview = {
  plan: OwnershipTransferPlan
  workspaceName: string
  currentOwner: { userId: string; email: string | null }
  newOwner: { userId: string; email: string | null }
  /** Les administrateurs parmi lesquels l'opérateur choisit. */
  candidates: { userId: string; email: string | null }[]
}

export type OwnershipTransferResult = {
  workspaceId: string
  fromUserId: string
  toUserId: string
  movedSubscription: boolean
}

type SubscriptionRow = {
  billing_mode: 'stripe' | 'manual'
  plan: string
  accounts_limit: number
  accounts_used: number
  topup_analyses: number | null
  enrichment_credits: number
  extra_seats: number
}

/**
 * #4158.33 — TRANSFERT DE PROPRIÉTÉ d'un espace, depuis le back-office seulement
 * (décision Louis 14/10/2026). Le nouveau propriétaire est choisi PARMI LES
 * ADMINS de l'espace ; en UNE transaction il devient `owner`, l'ancien devient
 * `admin`, `workspaces.owner_user_id` bascule et la ligne d'abonnement (donc le
 * pool de crédits, conservé tel quel) suit. Facturation Stripe : refusée, la
 * règle est dans {@link planOwnershipTransfer}.
 *
 * Le pool est porté par `subscriptions.user_id` (CreditsService
 * `resolveBillingSubscription` : le propriétaire de l'espace actif) — d'où le
 * déplacement de cette ligne et l'historique du grand livre qui la suit.
 */
@Injectable()
export class WorkspaceOwnershipTransferService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async preview(workspaceId: string, newOwnerUserId: string): Promise<OwnershipTransferPreview> {
    return this.dataSource.transaction(async manager => {
      const { context, workspaceName } = await this.loadContext(manager, workspaceId, newOwnerUserId, false)
      const admins = (await manager.query(
        `SELECT user_id FROM workspace_members WHERE workspace_id = $1 AND role = 'admin' ORDER BY created_at`,
        [workspaceId],
      )) as { user_id: string }[]
      const ids = [...new Set([context.workspace.ownerUserId, newOwnerUserId, ...admins.map(a => a.user_id)])]
      const emails = await this.emailsOf(manager, ids)
      const who = (userId: string) => ({ userId, email: emails.get(userId) ?? null })
      return {
        plan: planOwnershipTransfer(context),
        workspaceName,
        currentOwner: who(context.workspace.ownerUserId),
        newOwner: who(newOwnerUserId),
        candidates: admins.map(a => who(a.user_id)),
      }
    })
  }

  async transfer(workspaceId: string, newOwnerUserId: string): Promise<OwnershipTransferResult> {
    return this.dataSource.transaction(async manager => {
      // Verrou sur la ligne de l'espace : deux transferts simultanés se suivent.
      const { context } = await this.loadContext(manager, workspaceId, newOwnerUserId, true)
      const plan = planOwnershipTransfer(context)
      if (!plan.ok) throw new ConflictException({ code: plan.code, message: plan.message })

      // Ancien propriétaire d'abord : à aucun instant l'espace n'a deux `owner`.
      await manager.query(`UPDATE workspace_members SET role = 'admin' WHERE workspace_id = $1 AND user_id = $2`, [
        workspaceId,
        plan.fromUserId,
      ])
      await manager.query(`UPDATE workspace_members SET role = 'owner' WHERE workspace_id = $1 AND user_id = $2`, [
        workspaceId,
        plan.toUserId,
      ])
      await manager.query(`UPDATE workspaces SET owner_user_id = $2 WHERE id = $1`, [workspaceId, plan.toUserId])

      if (plan.movesSubscription && plan.pool) {
        await manager.query(`UPDATE subscriptions SET user_id = $2 WHERE user_id = $1`, [
          plan.fromUserId,
          plan.toUserId,
        ])
        // L'historique de CET espace suit son pool ; les lignes sans espace restent à leur porteur.
        await manager.query(
          `UPDATE credit_ledger SET owner_user_id = $3 WHERE workspace_id = $1 AND owner_user_id = $2`,
          [workspaceId, plan.fromUserId, plan.toUserId],
        )
        await manager.query(
          `INSERT INTO credit_ledger (owner_user_id, workspace_id, actor_user_id, kind, resource, delta, reason)
           VALUES ($1, $2, NULL, 'ownership_transfer', 'analysis_slot', 0, $3)`,
          [
            plan.toUserId,
            workspaceId,
            `ownership_transfer ${plan.fromUserId} -> ${plan.toUserId} (plan ${plan.pool.plan}: ${plan.pool.accountsUsed}/${plan.pool.accountsLimit} analyses, ${plan.pool.enrichmentCredits} enrichissements, ${plan.pool.extraSeats} sièges supplémentaires — conservés)`,
          ],
        )
      }
      return {
        workspaceId,
        fromUserId: plan.fromUserId,
        toUserId: plan.toUserId,
        movedSubscription: plan.movesSubscription,
      }
    })
  }

  private async loadContext(
    manager: EntityManager,
    workspaceId: string,
    newOwnerUserId: string,
    lock: boolean,
  ): Promise<{ context: OwnershipTransferContext; workspaceName: string }> {
    const workspaces = (await manager.query(
      `SELECT id, name, owner_user_id, is_demo FROM workspaces WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
      [workspaceId],
    )) as { id: string; name: string; owner_user_id: string; is_demo: boolean }[]
    const workspace = workspaces[0]
    if (!workspace) throw new NotFoundException(`Workspace ${workspaceId} not found`)

    const roleRows = (await manager.query(
      `SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
      [workspaceId, newOwnerUserId],
    )) as { role: WorkspaceRole }[]
    const currentSubs = (await manager.query(
      `SELECT billing_mode, plan, accounts_limit, accounts_used, topup_analyses, enrichment_credits, extra_seats
         FROM subscriptions WHERE user_id = $1`,
      [workspace.owner_user_id],
    )) as SubscriptionRow[]
    const newSubs = (await manager.query(`SELECT 1 FROM subscriptions WHERE user_id = $1`, [
      newOwnerUserId,
    ])) as unknown[]
    const others = async (userId: string): Promise<number> => {
      const rows = (await manager.query(
        `SELECT COUNT(*)::int AS n FROM workspaces WHERE owner_user_id = $1 AND id <> $2 AND is_demo = false`,
        [userId, workspaceId],
      )) as { n: number }[]
      return rows[0]?.n ?? 0
    }
    const sub = currentSubs[0]
    return {
      workspaceName: workspace.name,
      context: {
        workspace: { id: workspace.id, ownerUserId: workspace.owner_user_id, isDemo: workspace.is_demo === true },
        newOwnerUserId,
        newOwnerRole: roleRows[0]?.role ?? null,
        currentOwnerSubscription: sub
          ? {
              billingMode: sub.billing_mode,
              plan: sub.plan,
              accountsLimit: sub.accounts_limit,
              accountsUsed: sub.accounts_used,
              enrichmentCredits: sub.enrichment_credits,
              extraSeats: sub.extra_seats,
            }
          : null,
        newOwnerHasSubscription: newSubs.length > 0,
        currentOwnerOtherWorkspaces: await others(workspace.owner_user_id),
        newOwnerOtherWorkspaces: await others(newOwnerUserId),
      },
    }
  }

  private async emailsOf(manager: EntityManager, ids: string[]): Promise<Map<string, string | null>> {
    const rows = (await manager.query(`SELECT user_id, email FROM profiles WHERE user_id = ANY($1::uuid[])`, [
      ids,
    ])) as { user_id: string; email: string | null }[]
    return new Map(rows.map(r => [r.user_id, r.email]))
  }
}
