/**
 * The billing schedule of an invoice-billed client — THE single place where a
 * commitment, an expected invoice and a late payment are derived.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT IT CORRECTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Until now the whole commercial side of a sales-led client lived in
 * `manual_billing_terms.notes`, as free text: « engagement 3 mois », « à
 * suspendre fin novembre ». Free text is not read by anything. The consequence
 * is not that the operator forgets — it is that NOTHING CAN TELL HIM: a
 * commitment that ends without a renewal invoice looks exactly like a client
 * who is perfectly up to date. A screen cannot warn about a sentence.
 *
 * So the commitment becomes a NUMBER OF MONTHS on the terms, the invoices
 * become ROWS in `manual_billing_invoices`, and this module turns the two into
 * the only thing an operator actually wants: what is late, and by how long.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES TO SAY
 * ─────────────────────────────────────────────────────────────────────────────
 *  - A client with NO commitment has `commitmentEnd: null` — never a computed
 *    date, never `0` months. « Non mesuré n'est pas mesuré à zéro » applies to
 *    a contract exactly as it applies to a score.
 *  - A period that has not started yet is never « missing an invoice ». The
 *    invoice for October is not late in September.
 *  - Nothing here sends anything, cancels anything or suspends anybody. It
 *    reports. Suspension stays a human decision — the app has never had a
 *    contract-end gate and this does not add one.
 *
 * The whole module is PURE: `today` is a parameter, not `new Date()`. A test
 * that reads the clock passes in Paris and fails in a CI that runs in UTC.
 */

/** How often the negotiated amount is invoiced. */
type ManualBillingPeriod = 'monthly' | 'quarterly' | 'yearly' | 'one_off'

/**
 * Days after a period starts before its missing invoice is called out.
 *
 * Seven, because an invoice is emitted by a human in an accounting tool, on a
 * working day. A window of zero would paint every client red on the 1st of the
 * month and teach the operator to ignore the column — a warning that is always
 * on is not a warning.
 */
export const INVOICE_GRACE_DAYS = 7

/**
 * Days a missing invoice stays a `warning` before it becomes a `danger`.
 * A full extra period would be too late for a monthly contract; thirty days is
 * « we have skipped a cycle ».
 */
export const INVOICE_LATE_DANGER_DAYS = 30

/**
 * Days an emitted invoice may stay unpaid before it is called out. Thirty is
 * the usual French payment term for a B2B invoice — below it, nothing is wrong.
 */
export const PAYMENT_TERM_DAYS = 30

/** Days before the end of a commitment where the renewal becomes the operator's
 *  problem. Fifteen leaves time to send an invoice before the period lapses. */
export const COMMITMENT_ENDING_SOON_DAYS = 15

/**
 * Hard ceiling on the number of periods derived for one client. A monthly
 * contract started in 2019 would otherwise walk 80+ periods on every render of
 * the backoffice list. Twenty years of yearly, six of monthly: past that the
 * list is not the tool for the job.
 */
const MAX_PERIODS = 240

export interface BillingTermsForSchedule {
  period: ManualBillingPeriod
  /** `YYYY-MM-DD` — first day of the contract. */
  startDate: string
  /** Contract length in months. `null` = no commitment agreed, NOT zero. */
  commitmentMonths: number | null
}

export interface InvoiceForSchedule {
  reference: string
  /** `YYYY-MM-DD` — first day of the period the invoice covers. */
  periodStart: string
  /** `YYYY-MM-DD` — last day of the period the invoice covers. */
  periodEnd: string
  /**
   * Whether the money arrived. Deliberately a BOOLEAN and not the payment date:
   * the seventeen rows migrated from the old single-line terms are known to be
   * paid, and the date they were cashed in was never recorded. Deriving one
   * would be inventing a fact; keeping the date OUT of the derivation lets
   * `paid_on` stay honestly `NULL` next to `payment_status = 'paid'`.
   */
  paid: boolean
}

/** One calendar window the contract is invoiced for. */
interface BillingWindow {
  start: string
  end: string
}

type BillingAlertKind =
  /** A period has started, the grace window has passed, and no invoice covers it. */
  | 'invoice_missing'
  /** An invoice was emitted, its payment term has passed, and it is not cashed in. */
  | 'invoice_unpaid'
  /** The commitment has ended and nothing covers any period after it. */
  | 'commitment_ended_unrenewed'
  /** The commitment ends soon — decide renewal or suspension. */
  | 'commitment_ending_soon'

type BillingSeverity = 'ok' | 'info' | 'warning' | 'danger'

interface BillingAlert {
  kind: BillingAlertKind
  severity: Exclude<BillingSeverity, 'ok'>
  /** Whole days between the triggering fact and `today`. Always ≥ 0. */
  days: number
  /** The period concerned, when the alert is about one. */
  window: BillingWindow | null
  /** The invoice concerned, when the alert is about one. */
  reference: string | null
}

export interface BillingHealth {
  /** Last day covered by the commitment. `null` = no commitment agreed. */
  commitmentEnd: string | null
  /** The period `today` falls into. `null` when the contract has not started. */
  currentWindow: BillingWindow | null
  /** Periods that have started (grace window included) — the denominator. */
  windowsDue: number
  /** Of those, the ones an invoice covers — the numerator. */
  windowsInvoiced: number
  /** Started periods with no invoice, oldest first. */
  windowsMissing: BillingWindow[]
  alerts: BillingAlert[]
  /** The worst alert's severity, `ok` when there is none. */
  severity: BillingSeverity
}

const SEVERITY_ORDER: Record<BillingSeverity, number> = { ok: 0, info: 1, warning: 2, danger: 3 }

/** Months in one billing period. `one_off` has no recurrence — see {@link windowsUntil}. */
const MONTHS_PER_PERIOD: Record<Exclude<ManualBillingPeriod, 'one_off'>, number> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
}

/**
 * `YYYY-MM-DD` + n months, clamped to the end of the target month.
 *
 * Built on `Date.UTC` on purpose: a local `new Date('2026-03-01')` is midnight
 * in the reader's zone, and adding months to it drifts by a day twice a year.
 * The 31st of a month + 1 month is the LAST day of the next one (31/01 → 28/02),
 * which is what every French invoicing tool does.
 */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  const target = new Date(Date.UTC(y, m - 1 + months, 1))
  const lastOfTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  const dayOfMonth = Math.min(d, lastOfTarget)
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(dayOfMonth)}`
}

/** `YYYY-MM-DD` + n days. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  const shifted = new Date(Date.UTC(y, m - 1, d + days))
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`
}

/** Whole days from `from` to `to` (negative when `to` precedes `from`). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Last day covered by the commitment, or `null` when none was agreed.
 *
 * THE derivation — nowhere else recomputes it. Two places computing a contract
 * end is how a screen and an alert end up disagreeing about the same client.
 */
export function commitmentEndOf(terms: BillingTermsForSchedule): string | null {
  if (terms.commitmentMonths === null || terms.commitmentMonths <= 0) return null
  return addDays(addMonths(terms.startDate, terms.commitmentMonths), -1)
}

/**
 * Every period whose first day is on or before `today`.
 *
 * `one_off` yields exactly ONE window: a one-shot contract is invoiced once,
 * and walking it monthly would report eleven missing invoices for a deal that
 * was closed and paid.
 */
export function windowsUntil(terms: BillingTermsForSchedule, today: string): BillingWindow[] {
  if (terms.startDate > today) return []

  if (terms.period === 'one_off') {
    const end = commitmentEndOf(terms) ?? terms.startDate
    return [{ start: terms.startDate, end }]
  }

  const months = MONTHS_PER_PERIOD[terms.period]
  const windows: BillingWindow[] = []
  for (let i = 0; i < MAX_PERIODS; i += 1) {
    const start = addMonths(terms.startDate, i * months)
    if (start > today) break
    windows.push({ start, end: addDays(addMonths(terms.startDate, (i + 1) * months), -1) })
  }
  return windows
}

/**
 * An invoice covers a window when it spans that window's first day.
 *
 * Exported for the calendar view (#1653) and for that reason ONLY: painting a
 * cell « émise » asks the very question this function answers, and a second
 * copy of the rule would eventually disagree with the « État » column about the
 * same client. The rule itself is unchanged.
 */
export function covers(invoice: InvoiceForSchedule, window: BillingWindow): boolean {
  return invoice.periodStart <= window.start && invoice.periodEnd >= window.start
}

/**
 * What is late on one invoice-billed client, and by how long.
 *
 * Reads the terms and the invoice ledger; writes nothing, decides nothing. The
 * caller (backoffice column, daily sweep) renders or logs — the two share this
 * function so they can never tell the operator two different stories.
 */
export function billingHealth(
  terms: BillingTermsForSchedule,
  invoices: readonly InvoiceForSchedule[],
  today: string,
): BillingHealth {
  const commitmentEnd = commitmentEndOf(terms)
  const windows = windowsUntil(terms, today)
  const currentWindow = windows.find(w => w.start <= today && w.end >= today) ?? null

  // Only periods past their grace window count as due. Invoicing the period
  // that started this morning is not late.
  const due = windows.filter(w => daysBetween(w.start, today) >= INVOICE_GRACE_DAYS)
  const missing = due.filter(w => !invoices.some(inv => covers(inv, w)))

  const alerts: BillingAlert[] = []

  for (const window of missing) {
    const days = daysBetween(window.start, today)
    alerts.push({
      kind: 'invoice_missing',
      severity: days >= INVOICE_LATE_DANGER_DAYS ? 'danger' : 'warning',
      days,
      window,
      reference: null,
    })
  }

  for (const invoice of invoices) {
    if (invoice.paid) continue
    const days = daysBetween(invoice.periodStart, today)
    if (days < PAYMENT_TERM_DAYS) continue
    alerts.push({
      kind: 'invoice_unpaid',
      severity: 'warning',
      days,
      window: { start: invoice.periodStart, end: invoice.periodEnd },
      reference: invoice.reference,
    })
  }

  if (commitmentEnd !== null) {
    const renewed = invoices.some(inv => inv.periodStart > commitmentEnd)
    if (today > commitmentEnd && !renewed) {
      // THE case this whole chantier exists for: the three months are over and
      // no invoice covers anything after them. Nothing suspends the account —
      // the operator decides — but nobody can say « I did not know » any more.
      alerts.push({
        kind: 'commitment_ended_unrenewed',
        severity: 'danger',
        days: daysBetween(commitmentEnd, today),
        window: null,
        reference: null,
      })
    } else if (today <= commitmentEnd && daysBetween(today, commitmentEnd) <= COMMITMENT_ENDING_SOON_DAYS) {
      alerts.push({
        kind: 'commitment_ending_soon',
        severity: 'info',
        days: daysBetween(today, commitmentEnd),
        window: null,
        reference: null,
      })
    }
  }

  const severity = alerts.reduce<BillingSeverity>(
    (worst, alert) => (SEVERITY_ORDER[alert.severity] > SEVERITY_ORDER[worst] ? alert.severity : worst),
    'ok',
  )

  return {
    commitmentEnd,
    currentWindow,
    windowsDue: due.length,
    windowsInvoiced: due.length - missing.length,
    windowsMissing: missing,
    alerts,
    severity,
  }
}
