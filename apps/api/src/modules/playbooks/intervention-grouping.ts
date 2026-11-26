import { outstandingAmountCents, overdueDaysFromDueOn, type Intervention } from '@bellum/contracts'

/** Ce qu'on lit de la facture derrière une intervention `payment_overdue`. */
export type OverdueMeta = {
  clientLabel: string | null
  dueOn: string | null
  invoicedAmountCents: number | null
  paidAt: string | null
  paidAmountCents: number | null
}

const euros = (cents: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(cents / 100)

/**
 * Une ligne par CLIENT pour les factures en retard (recette 14/10 : 98 cartes
 * quasi identiques). Le groupe prend la place de son premier membre — la file est
 * déjà classée — et les autres natures passent telles quelles. Le montant dû
 * suit `outstandingAmountCents` (le reste dû se NOMME, jamais un cinquième
 * statut) ; un seul montant inconnu rend le total inconnu, pas 0.
 */
export function groupOverdueByClient(
  items: readonly Intervention[],
  metas: ReadonlyMap<string, OverdueMeta>,
  now: Date,
): Intervention[] {
  const groups = new Map<string, Intervention[]>()
  for (const item of items) {
    if (item.kind !== 'payment_overdue' || !metas.has(item.id)) continue
    const key = metas.get(item.id)?.clientLabel ?? ''
    groups.set(key, [...(groups.get(key) ?? []), item])
  }

  const out: Intervention[] = []
  for (const item of items) {
    const key = item.kind === 'payment_overdue' && metas.has(item.id) ? (metas.get(item.id)?.clientLabel ?? '') : null
    if (key === null) {
      out.push(item)
      continue
    }
    const members = groups.get(key) ?? []
    if (members[0]?.id !== item.id) continue
    // Une facture seule d'un client garde sa phrase vivante : rien à regrouper.
    if (members.length < 2) {
      out.push(item)
      continue
    }
    const rows = members.map(member => metas.get(member.id)).filter((m): m is OverdueMeta => m !== undefined)
    const outstanding = rows.map(row =>
      outstandingAmountCents({
        paidAt: row.paidAt,
        paidAmountCents: row.paidAmountCents,
        invoicedAmountCents: row.invoicedAmountCents,
      }),
    )
    const total = outstanding.some(value => value === null)
      ? null
      : outstanding.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    const days = rows.map(row => overdueDaysFromDueOn(row.dueOn, now)).filter((d): d is number => d !== null && d >= 0)
    const oldest = days.length > 0 ? Math.max(...days) : null
    const label = key === '' ? null : key
    const parts = [
      `${members.length} facture${members.length > 1 ? 's' : ''} en retard`,
      total === null ? 'reste dû non renseigné' : `${euros(total)} dus`,
      ...(oldest === null ? [] : [`plus ancien retard : ${oldest} jours`]),
    ]
    out.push({
      ...item,
      detail: `${label ?? 'Client non renseigné'} : ${parts.join(', ')}.`,
      group: {
        clientLabel: label,
        ids: members.map(member => member.id),
        invoiceCount: members.length,
        outstandingCents: total,
        oldestOverdueDays: oldest,
      },
    })
  }
  return out
}
