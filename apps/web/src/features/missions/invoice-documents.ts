import {
  isDisputeOpen,
  isInvoicedState,
  isSettled,
  outstandingAmountCents,
  type InvoiceReadiness,
} from '@bellum/contracts'
import { collectionStatus, overdueDaysAt } from './collections'

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LES DÉRIVATIONS DES ÉCRANS « FACTURES » ET « ENCAISSEMENTS » (Théo V22)
 * ─────────────────────────────────────────────────────────────────────────────
 * Elles vivent ICI, à côté de `collections.ts` dont elles réutilisent le statut
 * et le retard : l'écran ne recalcule rien (GA-26).
 *
 * ⚠️ Renversement DATÉ du 22/10/2026 (Louis, QCM C/D) — `c72` côté LIBELLÉ
 * seulement : l'écran dit « Partielle · en retard ». Le STATUT d'encaissement
 * reste l'un des quatre (`collectionStatus`) et n'est jamais stocké ; le libellé
 * composé est DÉRIVÉ ici, d'un règlement partiel ET d'un retard. Rien n'est
 * perdu : le reste dû se nomme toujours (`outstandingAmountCents`).
 */

// Théo C missions-factures.R2 — les états d'affichage d'un document de facture.
export type InvoiceDocumentState = 'draft' | 'to_receive' | 'overdue' | 'partial_overdue' | 'disputed' | 'settled'

/** Les documents : les mois ÉMIS (prouvés ou déclarés) et les brouillons préparés. */
export function invoiceDocuments(items: readonly InvoiceReadiness[]): InvoiceReadiness[] {
  // Un mois « prêt » est une facture PRÉPARÉE (#2564) : jamais émise, jamais
  // comptabilisée — l'écran l'appelle brouillon et ne lui donne pas de numéro.
  return items.filter(item => isInvoicedState(item.state) || item.state === 'ready')
}

function isIssued(item: InvoiceReadiness): boolean {
  return isInvoicedState(item.state)
}

// Théo C missions-factures.N7 — « Partielle · en retard », libellé dérivé.
export function invoiceDocumentState(item: InvoiceReadiness, now: Date): InvoiceDocumentState {
  if (!isIssued(item)) return 'draft'
  const status = collectionStatus(item, now)
  if (status === 'disputed') return 'disputed'
  if (status === 'paid') return 'settled'
  const partial = Boolean(item.paidAt)
  if (status === 'overdue') return partial ? 'partial_overdue' : 'overdue'
  return 'to_receive'
}

/** Le montant restant dû d'un document ÉMIS non soldé ; `undefined` = hors encours. */
function openAmount(item: InvoiceReadiness): number | null | undefined {
  if (!isIssued(item) || isSettled(item)) return undefined
  return outstandingAmountCents(item)
}

type Sum = { cents: number | null; count: number }

/** Somme qui refuse de transformer une absence en zéro : aucun montant lisible ⇒ null. */
function sumKnown(values: readonly (number | null)[]): Sum {
  const known = values.filter((value): value is number => value !== null && Number.isFinite(value))
  return {
    count: values.length,
    cents: values.length > 0 && known.length === 0 ? null : known.reduce((total, value) => total + value, 0),
  }
}

// Théo C missions-factures.N4 — les quatre tuiles.
export function invoiceDocumentTiles(items: readonly InvoiceReadiness[]) {
  const documents = invoiceDocuments(items)
  const issued = documents.filter(isIssued)
  const open = issued.map(openAmount).filter((value): value is number | null => value !== undefined)
  return {
    drafts: documents.length - issued.length,
    issuedCents: sumKnown(issued.map(item => item.invoicedAmountCents)).cents,
    outstandingCents: sumKnown(open).cents,
    disputed: issued.filter(item => isDisputeOpen(item)).length,
  }
}

// Théo C missions-factures.R2 — les filtres d'état (« Avoirs » absent : aucun avoir
// n'existe dans Bellum, #2564 — il se lit dans l'outil branché).
// `declared` (Théo 23/10) : les mois DÉCLARÉS facturés, sans preuve de l'outil (c80).
export type InvoiceDocumentFilter =
  | 'all'
  | 'drafts'
  | 'issued'
  | 'declared'
  | 'with_balance'
  | 'overdue'
  | 'disputed'
  | 'settled'

function matchesFilter(item: InvoiceReadiness, filter: InvoiceDocumentFilter, now: Date): boolean {
  const state = invoiceDocumentState(item, now)
  switch (filter) {
    case 'all':
      return true
    case 'drafts':
      return state === 'draft'
    case 'issued':
      return state !== 'draft'
    case 'declared':
      return item.state === 'invoiced_declared'
    case 'with_balance':
      return state !== 'draft' && state !== 'settled'
    case 'overdue': {
      const days = overdueDaysAt(item.dueOn, now)
      return openAmount(item) !== undefined && days !== null && days > 0
    }
    case 'disputed':
      return state === 'disputed'
    case 'settled':
      return state === 'settled'
  }
}

/**
 * Multi-sélection (Louis 23/10) : plusieurs états se cumulent en OU, une sélection
 * vide — ou `'all'` — montre tout. Un seul état reste accepté (les appelants d'avant).
 */
export function filterInvoiceDocuments(
  items: readonly InvoiceReadiness[],
  filter: InvoiceDocumentFilter | readonly InvoiceDocumentFilter[],
  now: Date,
): InvoiceReadiness[] {
  const documents = invoiceDocuments(items)
  const filters = typeof filter === 'string' ? [filter] : filter
  if (filters.length === 0 || filters.includes('all')) return documents
  return documents.filter(item => filters.some(one => matchesFilter(item, one, now)))
}

/**
 * La part du « facturé » DÉCLARÉE sans preuve de l'outil (c80 — la source se nomme).
 * `null` = rien à nommer : aucune déclaration, ou aucun montant lisible — jamais
 * « 0 € déclarés ».
 */
export function declaredIssuedCents(items: readonly InvoiceReadiness[]): number | null {
  const declared = invoiceDocuments(items)
    .filter(item => item.state === 'invoiced_declared')
    .map(item => item.invoicedAmountCents)
  const sum = sumKnown(declared)
  return sum.cents === null || sum.cents === 0 ? null : sum.cents
}

// Théo V22 (23/10) — « Les quatre prochaines semaines » de la vue financière.
type ExpectedWeek = { startsOn: string; endsOn: string; count: number; cents: number | null }

const DAY_MS = 86_400_000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/**
 * Le reste dû attendu, rangé par semaine d'ÉCHÉANCE (lundi → dimanche), à partir de la semaine
 * courante. Une PRÉVISION d'échéances, jamais un solde bancaire.
 *
 * ⚠️ Ce qui n'a pas de semaine honnête n'y est PAS placé : l'échu, le litige et le sans-échéance
 * sont comptés à part (`unplaced`) — les ranger dans une semaine inventerait une date de règlement.
 * Une échéance au-delà de la quatrième semaine n'est ni placée ni « à replanifier » : elle viendra.
 * Une semaine sans échéance a `count: 0` ; un reste dû inconnu donne `cents: null`, jamais 0 €.
 */
export function expectedCollectionsByWeek(
  items: readonly InvoiceReadiness[],
  now: Date,
  weeks = 4,
): { weeks: ExpectedWeek[]; unplaced: { count: number; cents: number | null } } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY_MS
  const slots = Array.from({ length: weeks }, (_, index) => ({
    startsOn: isoDay(monday + index * 7 * DAY_MS),
    endsOn: isoDay(monday + (index * 7 + 6) * DAY_MS),
    amounts: [] as (number | null)[],
  }))
  const unplaced: (number | null)[] = []
  for (const item of items) {
    const amount = openAmount(item)
    if (amount === undefined) continue
    const due = item.dueOn?.slice(0, 10) ?? null
    const overdue = due !== null && due < slots[0]!.startsOn
    if (due === null || overdue || isDisputeOpen(item)) {
      unplaced.push(amount)
      continue
    }
    const slot = slots.find(candidate => due >= candidate.startsOn && due <= candidate.endsOn)
    slot?.amounts.push(amount)
  }
  return {
    weeks: slots.map(slot => ({
      startsOn: slot.startsOn,
      endsOn: slot.endsOn,
      count: slot.amounts.length,
      cents: sumKnown(slot.amounts).cents,
    })),
    unplaced: { count: unplaced.length, cents: sumKnown(unplaced).cents },
  }
}

// Théo C missions-encaissements.N3 — l'ancienneté de l'encours, six tranches.
type AgingBucketKey = 'not_due' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90_plus' | 'no_due_date'
type AgingBucket = { key: AgingBucketKey; count: number; amountCents: number | null }

const AGING_ORDER: readonly AgingBucketKey[] = ['not_due', 'd1_30', 'd31_60', 'd61_90', 'd90_plus', 'no_due_date']

function agingKey(dueOn: string | null, now: Date): AgingBucketKey {
  const days = overdueDaysAt(dueOn, now)
  if (days === null) return 'no_due_date'
  if (days <= 0) return 'not_due'
  if (days <= 30) return 'd1_30'
  if (days <= 60) return 'd31_60'
  if (days <= 90) return 'd61_90'
  return 'd90_plus'
}

/**
 * Le restant dû TTC par ancienneté de l'ÉCHÉANCE — litiges compris, jamais
 * réinitialisée par une relance. Une tranche mesurée à 0 € reste affichée : « rien
 * à cette ancienneté » est un fait ; « sans échéance » est nommé, jamais rangé en
 * « non échu ». Mesure de ce que le CLIENT doit, jamais de la personne.
 */
export function agingBuckets(items: readonly InvoiceReadiness[], now: Date): AgingBucket[] {
  const grouped = new Map<AgingBucketKey, (number | null)[]>(AGING_ORDER.map(key => [key, []]))
  for (const item of items) {
    const amount = openAmount(item)
    if (amount === undefined) continue
    grouped.get(agingKey(item.dueOn, now))?.push(amount)
  }
  return AGING_ORDER.map(key => {
    const sum = sumKnown(grouped.get(key) ?? [])
    return { key, count: sum.count, amountCents: sum.cents }
  })
}

// Théo C missions-encaissements.R1/N7 — les tuiles d'encours.
export function receivablesKpis(items: readonly InvoiceReadiness[], now: Date) {
  const open = items.flatMap(item => {
    const amount = openAmount(item)
    return amount === undefined ? [] : [{ item, amount }]
  })
  const cents = (rows: typeof open) => sumKnown(rows.map(row => row.amount)).cents
  return {
    remainingCents: cents(open),
    overdueCents: cents(
      open.filter(({ item }) => {
        const days = overdueDaysAt(item.dueOn, now)
        return days !== null && days > 0
      }),
    ),
    // Le montant litigieux est INCLUS dans l'encours, jamais ajouté (N7).
    disputedCents: cents(open.filter(({ item }) => isDisputeOpen(item))),
  }
}
