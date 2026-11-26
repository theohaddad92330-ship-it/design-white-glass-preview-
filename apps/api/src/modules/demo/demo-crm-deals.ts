import type { CrmDealSignalKind, CrmDealSignalRow } from '@bellum/contracts'
import { detectDealsForRenewal, detectDormantDeals, detectLostDeals } from '../crm/crm-deal-signal-rules'
import { DEMO_CRM_DEALS } from './demo-dataset'

const DAY = 86_400_000

type DemoDealFact = {
  deal_id: string
  provider: 'demo'
  name: string
  stage_label: string
  amount: string
  deal_created_at: Date
  closed_at: Date | null
  last_activity_at: Date
  is_closed: boolean
  is_won: boolean | null
}

type DemoDealSignal = { dealId: string; kind: CrmDealSignalKind; evidence: string; occurredAt: string }

/**
 * #3918.b (lot M01) — les affaires CRM de la salle et leurs signaux.
 *
 * Les signaux ne sont pas écrits à la main : les MÊMES règles pures que le
 * balayage de production (`crm-deal-signal-rules.ts`) tournent sur ces
 * affaires, à des dates relatives à l'ouverture de la salle. Le fournisseur
 * est `demo` : le rapport pipeline (lu sur `hubspot`) et la reprise de mission
 * (espace déjà peuplé de missions) ne les lisent jamais.
 */
export function buildDemoCrmDeals(now: Date): { facts: DemoDealFact[]; signals: DemoDealSignal[] } {
  const at = (daysAgo: number): Date => new Date(now.getTime() - daysAgo * DAY)
  const facts: DemoDealFact[] = DEMO_CRM_DEALS.deals.map(deal => ({
    deal_id: deal.deal_id,
    provider: 'demo',
    name: deal.name,
    stage_label: deal.stage_label,
    amount: String(deal.amount),
    deal_created_at: at(deal.created_days_ago),
    closed_at: deal.closed_days_ago == null ? null : at(deal.closed_days_ago),
    last_activity_at: at(deal.last_activity_days_ago),
    is_closed: deal.is_closed,
    is_won: deal.is_won,
  }))
  const rows: CrmDealSignalRow[] = facts.map(fact => ({ ...fact, id: fact.deal_id }))
  const signals = [detectLostDeals, detectDormantDeals, detectDealsForRenewal].flatMap(rule =>
    rule(rows, now).map(draft => ({
      dealId: draft.dealFactId,
      kind: draft.kind,
      evidence: draft.evidence,
      occurredAt: draft.occurredAt,
    })),
  )
  return { facts, signals }
}
