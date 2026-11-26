import { billingAlertOf } from '@bellum/contracts'

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

type Row = {
  mission_id: string
  invoiced_amount_cents: string | number | null
  paid_at: Date | string | null
  paid_amount_cents: string | number | null
  due_on: Date | string | null
  disputed_at: Date | string | null
  dispute_resolved_at: Date | string | null
}

const iso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : value
const num = (value: string | number | null): number | null => (value === null ? null : Number(value))

/**
 * #2408 — les factures ÉMISES en retard, par mission (une requête pour toute la liste, pas une par ligne).
 *
 * La requête ne filtre PAS sur l'échéance : « échue », « soldée » et « litige ouvert » se jugent par
 * `billingAlertOf` (`@bellum/contracts`), la même dérivation que l'écran Encaissements (GA-26) — jamais une
 * seconde règle en SQL. Une facture annulée n'est pas une créance.
 */
export async function receivableAlertsByMission(
  manager: Queryable,
  workspaceId: string,
  now: Date,
): Promise<Map<string, ('invoice_overdue' | 'payment_late')[]>> {
  const rows = (await manager.query(
    `SELECT mission_id, invoiced_amount_cents, paid_at, paid_amount_cents, to_char(due_on, 'YYYY-MM-DD') AS due_on, disputed_at, dispute_resolved_at
       FROM invoice_readiness
      WHERE workspace_id = $1
        AND state IN ('invoiced', 'invoiced_declared')
        AND invoice_cancelled_at IS NULL
        AND due_on IS NOT NULL`,
    [workspaceId],
  )) as Row[]
  const byMission = new Map<string, ('invoice_overdue' | 'payment_late')[]>()
  for (const row of rows) {
    const alert = billingAlertOf(
      {
        invoicedAmountCents: num(row.invoiced_amount_cents),
        paidAt: iso(row.paid_at),
        paidAmountCents: num(row.paid_amount_cents),
        dueOn: iso(row.due_on)?.slice(0, 10) ?? null,
        disputedAt: iso(row.disputed_at),
        disputeResolvedAt: iso(row.dispute_resolved_at),
      },
      now,
    )
    if (alert) byMission.set(row.mission_id, [...(byMission.get(row.mission_id) ?? []), alert])
  }
  return byMission
}
