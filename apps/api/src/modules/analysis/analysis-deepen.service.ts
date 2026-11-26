import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { buildDeepenQuote } from '@bellum/contracts'
import type { DeepenAccountState, DeepenQuote, DeepenTarget } from '@bellum/contracts'
import type { AccountEntity } from '../../database/entities/account.entity'
import { CreditLedgerEntity, type CreditLedgerKind } from '../../database/entities/credit-ledger.entity'
import type { AnalysisAccountScope } from './analysis.service'

/** Les mouvements qui disent ce qu'un compte a RÉELLEMENT coûté : consommé, moins remboursé. */
const SPEND_KINDS: readonly CreditLedgerKind[] = [
  'consume_analysis',
  'refund_analysis',
  'consume_enrichment',
  'refund_enrichment',
]

const iso = (value: Date | string | null | undefined): string | null =>
  value ? (value instanceof Date ? value.toISOString() : String(value)) : null

/**
 * #2452.2 / #2452.4 / #2452.5 — le DEVIS d'un approfondissement lancé depuis
 * une réponse de /chat.
 *
 * Lecture seule : ne lance rien, ne débite rien. L'exécution reste le moteur
 * existant (`POST /analysis/:id/refresh`, `AnalysisRefreshService`), axe par
 * axe — verrou par phase, fenêtre de fraîcheur de 6 h, débit après succès. Ce
 * service ne fait que dire AVANT le clic ce que ce moteur réutilisera et ce
 * qu'il facturera, avec la même règle (`buildDeepenQuote`, `@bellum/contracts`).
 *
 * ⚠️ Ce service ne dépend d'AUCUN service voisin (GA-07, au plafond) : le
 * CONTRÔLEUR résout les comptes visibles de l'appelant et son solde, puis les
 * passe ici. Un compte que l'appelant ne voit pas n'arrive donc jamais.
 */
@Injectable()
export class AnalysisDeepenService {
  constructor(
    @InjectRepository(CreditLedgerEntity)
    private readonly ledger: Repository<CreditLedgerEntity>,
  ) {}

  async quote(input: {
    scope: AnalysisAccountScope
    targets: readonly DeepenTarget[]
    /** Les comptes que l'appelant VOIT, déjà résolus par le contrôleur. */
    accounts: readonly AccountEntity[]
    remaining: number
    now?: Date
  }): Promise<DeepenQuote> {
    const { scope, accounts } = input
    // Le grand livre de l'ESPACE de l'appelant seulement : un coût ne
    // s'agrège jamais entre espaces (GA-43).
    const rows = accounts.length
      ? await this.ledger.find({
          where: {
            workspace_id: scope.workspaceId,
            account_id: In(accounts.map(account => account.id)),
            kind: In([...SPEND_KINDS]),
          },
          select: ['account_id', 'kind', 'delta'],
        })
      : []
    const invested = new Map<string, number>()
    for (const row of rows) {
      if (!row.account_id) continue
      invested.set(row.account_id, (invested.get(row.account_id) ?? 0) - row.delta)
    }

    const states: DeepenAccountState[] = accounts.map(account => ({
      accountId: account.id,
      name: account.company_name,
      hasDossier: account.status === 'completed',
      invested: Math.max(0, invested.get(account.id) ?? 0),
      freshness: {
        signals: iso(account.signals_refreshed_at),
        contacts: iso(account.contacts_refreshed_at),
        entities: iso(account.entities_refreshed_at),
        strategy: iso(account.strategy_refreshed_at),
      },
    }))

    return buildDeepenQuote({
      targets: input.targets,
      accounts: states,
      remaining: input.remaining,
      now: input.now ?? new Date(),
    })
  }
}
