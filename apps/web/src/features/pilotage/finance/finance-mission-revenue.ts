import type { InvoiceReadiness } from '@bellum/contracts'

/**
 * #2564.1 — LE CA PAR MISSION du tableau de bord Finance.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER NE RECALCULE RIEN
 * ─────────────────────────────────────────────────────────────────────────
 * `GET /delivery/invoice-readiness` porte déjà, PAR MISSION et PAR MOIS, ce
 * qui a été LIVRÉ et FACTURABLE (`preparedAmountCents` — jours réellement
 * travaillés × TJM) et ce qui a été réellement FACTURÉ (`invoicedAmountCents`).
 * `FinanceScreen` appelait déjà cette route pour sa bande de bloqueurs
 * (`finance-alerts.ts`) sans jamais montrer les lignes elles-mêmes — le défaut
 * n°1 du dépôt (« du code juste que personne n'appelle »), pour cette
 * question précise.
 *
 * Ce module ne fait qu'UNE chose : mettre les lignes déjà reçues dans l'ordre
 * où les lire (le plus gros montant livré d'abord). `preparedAmountCents` et
 * `invoicedAmountCents` restent `null` quand la source ne peut pas les
 * chiffrer — jamais `0`, qui se lirait « rien à facturer ».
 *
 * BellumAI SUIT ce chiffre, il ne le COMPTABILISE pas : aucune facture
 * n'est ni émise ni marquée « facturée » ici (doctrine #2564, 18/09/2026) —
 * `invoicedAmountCents` est une LECTURE de ce que `invoice-readiness` porte
 * déjà, jamais une écriture.
 */
export type MissionRevenueRow = {
  missionId: string
  missionLabel: string | null
  accountName: string | null
  periodMonth: string
  /** Ce qui a été livré et facturable — jours × TJM. `null` = non mesurable. */
  preparedAmountCents: number | null
  /** Ce qui a été réellement facturé, dans l'outil comptable du client.
   *  `null` = pas encore facturé, jamais confondu avec 0 € facturé. */
  invoicedAmountCents: number | null
}

export function financeMissionRevenue(items: readonly InvoiceReadiness[]): {
  rows: MissionRevenueRow[]
  withoutAmount: number
} {
  const rows = items
    .map(
      (item): MissionRevenueRow => ({
        missionId: item.missionId,
        missionLabel: item.missionLabel,
        accountName: item.accountName,
        periodMonth: item.periodMonth,
        preparedAmountCents: item.preparedAmountCents,
        invoicedAmountCents: item.invoicedAmountCents,
      }),
    )
    // Le plus gros montant livré d'abord — c'est ce qu'on vient lire ici. Une
    // ligne SANS montant connu part en dernier : `null` n'est jamais comparé à
    // 0, il est juste écarté du tri numérique.
    .sort((a, b) => {
      if (a.preparedAmountCents === null && b.preparedAmountCents === null) return 0
      if (a.preparedAmountCents === null) return 1
      if (b.preparedAmountCents === null) return -1
      return b.preparedAmountCents - a.preparedAmountCents
    })

  return { rows, withoutAmount: rows.filter(row => row.preparedAmountCents === null).length }
}

/**
 * Le CA PRÉPARATOIRE par CLIENT — la même lecture que le CA par mission, juste
 * sommée. Un client dont AUCUNE mission n'a de montant reste `null` (jamais 0) ;
 * une mission sans client est comptée à part, elle ne fait pas de ligne.
 */
export function financeRevenueByClient(rows: readonly MissionRevenueRow[]): {
  groups: Array<{ client: string; missions: number; amountCents: number | null; withoutAmount: number }>
  withoutClient: number
} {
  const byClient = new Map<string, { missions: number; known: number; readable: number }>()
  let withoutClient = 0
  for (const row of rows) {
    if (!row.accountName) {
      withoutClient += 1
      continue
    }
    const entry = byClient.get(row.accountName) ?? { missions: 0, known: 0, readable: 0 }
    entry.missions += 1
    if (row.preparedAmountCents !== null) {
      entry.known += row.preparedAmountCents
      entry.readable += 1
    }
    byClient.set(row.accountName, entry)
  }
  const groups = [...byClient.entries()]
    .map(([client, entry]) => ({
      client,
      missions: entry.missions,
      amountCents: entry.readable > 0 ? entry.known : null,
      withoutAmount: entry.missions - entry.readable,
    }))
    .sort((a, b) => (b.amountCents ?? -1) - (a.amountCents ?? -1) || a.client.localeCompare(b.client))
  return { groups, withoutClient }
}

/**
 * Le TJM MOYEN — moyenne simple des TJM connus, une mission comptée UNE fois
 * (une mission a plusieurs lignes de facturation sur plusieurs mois). Le
 * dénominateur voyage avec le chiffre : « sur N missions dont le TJM est connu,
 * M au total ». `null` sans aucun TJM : non mesuré, jamais 0.
 */
export function averageDailyRate(items: ReadonlyArray<{ missionId: string; dailyRateCents?: number | null }>): {
  averageCents: number | null
  measured: number
  missions: number
} {
  const rates = new Map<string, number | null>()
  for (const item of items) {
    const rate = item.dailyRateCents ?? null
    if (!rates.has(item.missionId) || rates.get(item.missionId) === null) rates.set(item.missionId, rate)
  }
  const known = [...rates.values()].filter((rate): rate is number => rate !== null)
  return {
    averageCents: known.length > 0 ? Math.round(known.reduce((total, rate) => total + rate, 0) / known.length) : null,
    measured: known.length,
    missions: rates.size,
  }
}
