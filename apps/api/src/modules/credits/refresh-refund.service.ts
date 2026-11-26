import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { refreshRefundReason, type RefreshDimension } from '@bellum/contracts'
import { DataSource, In, Like, type EntityManager } from 'typeorm'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { selectUndueRefreshDebits, type UndueRefreshDebit } from './refresh-refund'

/** Un débit indu, tel que l'opérateur le lit avant et après le geste. */
type RefreshRefundLine = {
  debitId: string
  accountId: string
  dimension: RefreshDimension
  credits: number
  debitedAt: string
  /** Le débit payé à bon droit qui avait ouvert la fenêtre de 6 h. */
  windowOpenedBy: string
  windowOpenedAt: string
  /** La ligne de crédit écrite au registre — `null` en `dryRun`. */
  refundLedgerId: string | null
}

export type RefreshRefundOutcome = {
  workspaceId: string
  dryRun: boolean
  /** Ce qui est remboursé (ou le SERAIT, en `dryRun`). */
  refunds: RefreshRefundLine[]
  totalCredits: number
  /** Débits indus déjà remboursés par un geste précédent — jamais deux fois. */
  alreadyRefunded: string[]
  /** Débits indus qu'on n'a pas pu rendre : aucun abonnement à créditer. */
  skipped: Array<{ debitId: string; reason: 'no_subscription' }>
}

/**
 * #2650.2 (19/09/2026) — REMBOURSER les rafraîchissements d'axe déjà payés
 * dans les 6 h, pris avant le correctif #2650.1.
 *
 * Doctrine « un correctif RATTRAPE l'existant » (décision Louis 18/09, étendue
 * à la facturation le 19/09) :
 *  - CIBLÉ : un `workspaceId` explicite, jamais tout le parc ;
 *  - ne part PAS seul : aucun `onApplicationBootstrap`, aucune routine — la
 *    seule porte est `POST internal/admin/credits/refresh-refunds`
 *    ({@link RefreshRefundController}, secret interne) ;
 *  - `dryRun` d'abord : la liste de ce qui SERAIT remboursé, sans écrire.
 *
 * IDEMPOTENT par la RÉFÉRENCE : chaque ligne de crédit porte l'id du débit
 * qu'elle rembourse (`refreshRefundReason`). Un débit dont la ligne existe
 * déjà n'est jamais recrédité. Deux gestes concurrents sur le même espace sont
 * sérialisés par un verrou consultatif pris DANS la transaction, et l'index
 * unique partiel `credit_ledger_refresh_refund_once_idx` (migration
 * `1789810829875`) refuse en base une seconde ligne pour le même débit.
 *
 * Écriture TRANSACTIONNELLE, contrairement à `CreditsService.recordLedger`
 * (best-effort) : ici la ligne de registre EST la preuve d'idempotence — un
 * solde crédité sans elle serait recrédité au geste suivant.
 */
@Injectable()
export class RefreshRefundService {
  private readonly logger = new Logger(RefreshRefundService.name)

  constructor(private readonly dataSource: DataSource) {}

  async run(workspaceId: string, options: { dryRun: boolean; actor: string }): Promise<RefreshRefundOutcome> {
    const workspace = await this.dataSource.manager
      .getRepository(WorkspaceEntity)
      .findOne({ where: { id: workspaceId }, select: ['id'] })
    if (!workspace) throw new NotFoundException(`Espace ${workspaceId} introuvable.`)

    const outcome = options.dryRun
      ? await this.preview(this.dataSource.manager, workspaceId)
      : await this.dataSource.transaction(manager => this.refund(manager, workspaceId))

    this.logger.log('Remboursement des rafraîchissements déjà payés dans les 6 h', {
      workspaceId,
      actor: options.actor,
      dryRun: options.dryRun,
      refunds: outcome.refunds.length,
      credits: outcome.totalCredits,
      alreadyRefunded: outcome.alreadyRefunded.length,
      skipped: outcome.skipped.length,
    })
    return outcome
  }

  private async preview(manager: EntityManager, workspaceId: string): Promise<RefreshRefundOutcome> {
    const { pending, alreadyRefunded } = await this.pending(manager, workspaceId)
    const refunds = pending.map(undue => toLine(undue, null))
    return { workspaceId, dryRun: true, refunds, totalCredits: sumCredits(refunds), alreadyRefunded, skipped: [] }
  }

  private async refund(manager: EntityManager, workspaceId: string): Promise<RefreshRefundOutcome> {
    // Sérialise deux gestes sur le même espace : le second relit, APRÈS le
    // commit du premier, les références que celui-ci vient d'écrire.
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`refresh-refund:${workspaceId}`])
    const { pending, alreadyRefunded } = await this.pending(manager, workspaceId)

    const ledger = manager.getRepository(CreditLedgerEntity)
    const refunds: RefreshRefundLine[] = []
    const skipped: RefreshRefundOutcome['skipped'] = []
    for (const undue of pending) {
      const amount = Math.max(1, Math.trunc(undue.amount))
      // Le solde bouge d'EXACTEMENT `amount` — jamais moins, sinon le relevé
      // annoncerait un crédit que le solde n'a pas reçu. Rendre la
      // consommation du cycle d'abord ; ce qui dépasse (débit d'un cycle
      // antérieur, déjà remis à zéro) part en recharge ponctuelle. Toutes les
      // expressions d'un UPDATE lisent l'ANCIENNE ligne : le calcul est exact.
      const updated = await manager
        .getRepository(SubscriptionEntity)
        .createQueryBuilder()
        .update()
        .set({
          accounts_used: () => 'GREATEST(accounts_used - :amount, 0)',
          topup_analyses: () => 'topup_analyses + GREATEST(:amount - accounts_used, 0)',
        })
        .where('user_id = :userId', { userId: undue.debit.owner_user_id, amount })
        .execute()
      if (!updated.affected) {
        skipped.push({ debitId: undue.debit.id, reason: 'no_subscription' })
        continue
      }
      const inserted = await ledger.insert({
        owner_user_id: undue.debit.owner_user_id,
        workspace_id: undue.debit.workspace_id,
        // Geste d'opérateur : aucun MEMBRE ne l'a déclenché (l'opérateur est
        // tracé au journal ci-dessus, pas déguisé en membre de l'espace).
        actor_user_id: null,
        kind: 'refund_enrichment',
        resource: 'enrichment_credit',
        delta: amount,
        reason: refreshRefundReason(undue.dimension, undue.debit.id),
        account_id: undue.debit.account_id,
      })
      const id = inserted?.identifiers?.[0]?.['id']
      refunds.push(toLine({ ...undue, amount }, typeof id === 'string' ? id : null))
    }
    return { workspaceId, dryRun: false, refunds, totalCredits: sumCredits(refunds), alreadyRefunded, skipped }
  }

  /** Les débits indus de l'espace, séparés entre « à rembourser » et « déjà remboursés ». */
  private async pending(
    manager: EntityManager,
    workspaceId: string,
  ): Promise<{ pending: UndueRefreshDebit[]; alreadyRefunded: string[] }> {
    const ledger = manager.getRepository(CreditLedgerEntity)
    const debits = await ledger.find({
      where: { workspace_id: workspaceId, kind: 'consume_enrichment', reason: Like('refresh:%') },
      order: { created_at: 'ASC' },
    })
    const undue = selectUndueRefreshDebits(debits)
    if (undue.length === 0) return { pending: [], alreadyRefunded: [] }

    // La RÉFÉRENCE prouve le remboursement — lue sur le motif exact, sans
    // filtrer par espace : une ligne de remboursement existe ou n'existe pas.
    const reasons = undue.map(u => refreshRefundReason(u.dimension, u.debit.id))
    const existing = await ledger.find({
      where: { kind: 'refund_enrichment', reason: In(reasons) },
      select: ['id', 'reason'],
    })
    const refunded = new Set(existing.map(row => row.reason))
    const pending: UndueRefreshDebit[] = []
    const alreadyRefunded: string[] = []
    for (const [index, item] of undue.entries()) {
      if (refunded.has(reasons[index] ?? null)) alreadyRefunded.push(item.debit.id)
      else pending.push(item)
    }
    return { pending, alreadyRefunded }
  }
}

function toLine(undue: UndueRefreshDebit, refundLedgerId: string | null): RefreshRefundLine {
  return {
    debitId: undue.debit.id,
    accountId: undue.debit.account_id ?? '',
    dimension: undue.dimension,
    credits: undue.amount,
    debitedAt: new Date(undue.debit.created_at).toISOString(),
    windowOpenedBy: undue.windowOpenedBy.id,
    windowOpenedAt: undue.windowOpenedBy.at.toISOString(),
    refundLedgerId,
  }
}

function sumCredits(lines: readonly RefreshRefundLine[]): number {
  return lines.reduce((total, line) => total + line.credits, 0)
}
