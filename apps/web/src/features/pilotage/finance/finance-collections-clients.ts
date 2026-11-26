import { outstandingAmountCents, type InvoiceReadiness } from '@bellum/contracts'
import { collectionStatus, isCollectible, overdueDaysAt } from '@/features/missions/collections'

type ClientGroup = {
  client: string
  count: number
  overdue: number
  /** Le reste dû, `null` dès qu'AUCUNE ligne du groupe n'a de montant lisible. */
  amountCents: number | null
  /** Ancienneté du plus vieux retard, en jours — `null` sans retard : jamais « 0 jour ». */
  oldestOverdueDays: number | null
}

/**
 * Les lignes À TRAITER (en retard ou en attente), regroupées par CLIENT — la
 * même dérivation de statut que `/missions/encaissements` (`collectionStatus`),
 * jamais un statut de plus (quatre, c72).
 *
 * Une ligne sans client ne fait aucune ligne de liste (doctrine : une absence
 * ne fait aucune ligne) : elle est comptée à part et l'écran le dit une fois.
 */
export function collectionsToTreatByClient(
  items: readonly InvoiceReadiness[],
  now: Date,
): { groups: ClientGroup[]; withoutClient: number } {
  const byClient = new Map<
    string,
    { count: number; overdue: number; known: number; readable: number; oldest: number | null }
  >()
  let withoutClient = 0
  for (const item of items) {
    if (!isCollectible(item)) continue
    const status = collectionStatus(item, now)
    if (status !== 'overdue' && status !== 'pending') continue
    if (!item.accountName) {
      withoutClient += 1
      continue
    }
    const entry = byClient.get(item.accountName) ?? { count: 0, overdue: 0, known: 0, readable: 0, oldest: null }
    entry.count += 1
    const amount = outstandingAmountCents(item)
    if (amount !== null && Number.isFinite(amount)) {
      entry.known += amount
      entry.readable += 1
    }
    if (status === 'overdue') {
      entry.overdue += 1
      const days = overdueDaysAt(item.dueOn, now)
      if (days !== null && (entry.oldest === null || days > entry.oldest)) entry.oldest = days
    }
    byClient.set(item.accountName, entry)
  }
  const groups = [...byClient.entries()]
    .map(
      ([client, entry]): ClientGroup => ({
        client,
        count: entry.count,
        overdue: entry.overdue,
        amountCents: entry.readable > 0 ? entry.known : null,
        oldestOverdueDays: entry.oldest,
      }),
    )
    .sort((a, b) => (b.oldestOverdueDays ?? -1) - (a.oldestOverdueDays ?? -1) || a.client.localeCompare(b.client))
  return { groups, withoutClient }
}
