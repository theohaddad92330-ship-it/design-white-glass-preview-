import {
  addDays,
  addMonths,
  billingHealth,
  covers,
  windowsUntil,
  type BillingHealth,
  type BillingTermsForSchedule,
  type InvoiceForSchedule,
} from './manual-billing-schedule'

/**
 * Le CALENDRIER de facturation — douze mois, une ligne par client sur facture,
 * une cellule par période (#1653).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ LA PRÉMISSE DE L'ISSUE ÉTAIT FAUSSE, ET C'EST L'ARBITRAGE QUI FONDE CE
 * FICHIER
 * ─────────────────────────────────────────────────────────────────────────────
 * #1653 écrivait : « Le plafond de 20 périodes du module est respecté », et son
 * test demandait « contrat mensuel de 2019 → 20 périodes maximum, pas 80 ».
 *
 * Le module dit `MAX_PERIODS = 240` (`manual-billing-schedule.ts:71`), et son
 * propre commentaire nomme le cas des « 80+ periods ». Tronquer 240 → 20
 * casserait l'affichage de TOUT contrat de plus d'environ un an et demi —
 * exactement la régression que l'issue s'interdit (« RIEN sur la logique »).
 *
 * Hypothèse retenue au triage du 07/09/2026 : « 20 » visait vingt LIGNES
 * lisibles sans défilement côté interface, pas le plafond de la dérivation. Ce
 * fichier code donc contre `MAX_PERIODS = 240` : **la dérivation rend toutes
 * les périodes, c'est l'AFFICHAGE qui est borné à douze colonnes**, et la
 * fenêtre se déplace (`anchorMonth`) pour atteindre le reste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - Il ne recalcule RIEN. `windowsUntil`, `billingHealth`, `covers` et
 *    `commitmentEndOf` (via `health.commitmentEnd`) restent les seules
 *    dérivations : deux chemins qui refont le même calcul finissent par
 *    raconter deux histoires du même client. Les quatre seuils
 *    (`INVOICE_GRACE_DAYS` 7, `INVOICE_LATE_DANGER_DAYS` 30,
 *    `PAYMENT_TERM_DAYS` 30, `COMMITMENT_ENDING_SOON_DAYS` 15) ne sont ni lus
 *    ni redéfinis ici — l'état d'une cellule se LIT dans les alertes.
 *  - Il ne marche jamais dans le futur. Une période qui n'a pas commencé n'a
 *    pas de cellule, donc elle ne peut pas être peinte « en retard » : la
 *    facture d'octobre n'est pas en retard en septembre.
 *  - Une cellule `no_period` dit « aucune période ne COMMENCE ce mois-ci »,
 *    jamais « rien à facturer ». Et quand le plafond de 240 a mordu, la ligne
 *    le déclare (`derivationCapped`) plutôt que de laisser douze tirets se lire
 *    comme un contrat au repos.
 *
 * Tout est pur : `today` est un paramètre, jamais `new Date()`.
 */

/** Le nombre de colonnes de la grille. Un réglage vit à un seul endroit. */
const CALENDAR_MONTHS = 12

/**
 * Ce qu'une cellule raconte. Les cinq états de la légende de #1653, et rien de
 * plus — un sixième état inventé ici serait un sixième symbole à expliquer.
 */
type BillingCalendarCellState =
  /** ✓ — une facture couvre la période et elle est encaissée. */
  | 'paid'
  /** ○ — une facture couvre la période, pas encore encaissée, dans son délai. */
  | 'issued'
  /** ⚠ — la période a commencé, rien ne la couvre, la grâce court encore. */
  | 'to_issue'
  /** ✗ — le module signale un retard : facture manquante, ou non encaissée. */
  | 'late'
  /** — — aucune période ne COMMENCE ce mois-ci. Ce n'est pas « rien à facturer ». */
  | 'no_period'

interface BillingCalendarCell {
  /** `YYYY-MM` de la PREMIÈRE colonne occupée. */
  month: string
  /** Colonnes occupées (≥ 1). Une période trimestrielle en occupe trois. */
  months: number
  state: BillingCalendarCellState
  /** La période, quand il y en a une. `null` pour `no_period`. */
  window: { start: string; end: string } | null
  /** La référence de la facture qui couvre la période, si elle existe. */
  reference: string | null
  /** Le montant RÉELLEMENT facturé. `null` tant qu'aucune facture ne couvre. */
  invoiceAmountCents: number | null
  /** La devise de cette facture. `null` sans facture — jamais celle du contrat. */
  invoiceCurrency: string | null
  /** Jours de retard, quand `state === 'late'`. `null` sinon — jamais `0`. */
  lateDays: number | null
}

interface BillingCalendarRow {
  workspaceId: string
  workspaceName: string
  period: BillingTermsForSchedule['period']
  /** Le montant du CONTRAT pour une période. Ce qui est attendu, pas ce qui est émis. */
  amountCents: number
  currency: string
  startDate: string
  /** `null` = aucun engagement enregistré. Jamais « 0 mois », jamais une date devinée. */
  commitmentEnd: string | null
  /** TOUTES les périodes dérivées depuis le début du contrat, pas les douze affichées. */
  periodsTotal: number
  /** `true` quand le plafond de 240 du module a arrêté la marche avant aujourd'hui. */
  derivationCapped: boolean
  /** Le pavage des douze colonnes. La somme des `months` vaut toujours 12. */
  cells: BillingCalendarCell[]
}

export interface BillingCalendarInput {
  workspaceId: string
  workspaceName: string
  terms: BillingTermsForSchedule
  amountCents: number
  currency: string
  invoices: ReadonlyArray<InvoiceForSchedule & { amountCents: number; currency: string }>
}

export interface BillingCalendar {
  /** Les douze `YYYY-MM` de la grille, du plus ancien au plus récent. */
  months: string[]
  /** Le dernier mois affiché. Jamais dans le futur. */
  anchorMonth: string
  /** Le mois d'aujourd'hui — la borne haute que la navigation ne franchit pas. */
  currentMonth: string
  /** Le mois de la plus ancienne période, toutes lignes confondues. `null` s'il n'y en a aucune. */
  earliestPeriodMonth: string | null
  rows: BillingCalendarRow[]
}

const MONTH_KEY = /^\d{4}-(?:0[1-9]|1[0-2])$/

/** `YYYY-MM-DD` ou `YYYY-MM` → `YYYY-MM`. */
function monthKey(day: string): string {
  return day.slice(0, 7)
}

/** Un `YYYY-MM` en nombre de mois absolus, pour comparer et soustraire. */
function monthNumber(month: string): number {
  const [year, index] = month.split('-').map(Number)
  return (year ?? 0) * 12 + ((index ?? 1) - 1)
}

/** Les douze mois qui se terminent sur `anchorMonth`, du plus ancien au plus récent. */
function monthsOfCalendar(anchorMonth: string): string[] {
  const firstDay = addMonths(`${anchorMonth}-01`, -(CALENDAR_MONTHS - 1))
  return Array.from({ length: CALENDAR_MONTHS }, (_, offset) => monthKey(addMonths(firstDay, offset)))
}

/**
 * Le mois d'ancrage réellement retenu.
 *
 * Une valeur illisible retombe sur le mois courant plutôt que de lever : une
 * URL retapée à la main ne doit pas casser un écran de suivi. Un mois DANS LE
 * FUTUR est ramené lui aussi — le calendrier ne montre pas ce qui n'a pas eu
 * lieu.
 */
function resolveAnchor(currentMonth: string, requested?: string | null): string {
  if (!requested || !MONTH_KEY.test(requested)) return currentMonth
  return monthNumber(requested) > monthNumber(currentMonth) ? currentMonth : requested
}

function buildRow(input: BillingCalendarInput, today: string, months: string[]): BillingCalendarRow {
  const firstMonth = months[0] ?? monthKey(today)
  const lastMonth = months[months.length - 1] ?? monthKey(today)
  // Dernier jour du mois d'ancrage : `+1 mois, -1 jour`, la forme déjà utilisée
  // par le module pour la fin d'une période.
  const calendarEnd = addDays(addMonths(`${lastMonth}-01`, 1), -1)
  const walkUntil = calendarEnd < today ? calendarEnd : today

  // UNE marche, celle du module, jusqu'à aujourd'hui. La grille se contente
  // ensuite d'en prendre la part visible : refaire la marche sur une borne
  // différente donnerait deux comptes de périodes pour le même contrat.
  const allWindows = windowsUntil(input.terms, today)
  const health = billingHealth(input.terms, input.invoices, today)

  const lastWindow = allWindows[allWindows.length - 1]
  // Le plafond a mordu quand la dernière période dérivée s'achève AVANT
  // aujourd'hui : une marche complète s'arrête forcément sur la période en
  // cours. `one_off` est exclu — une affaire ponctuelle n'a qu'une période, par
  // décision du module, pas par troncature.
  const derivationCapped = input.terms.period !== 'one_off' && lastWindow !== undefined && lastWindow.end < today

  const cells: BillingCalendarCell[] = []
  let column = 0

  allWindows.forEach((window, index) => {
    if (window.start > walkUntil) return

    const from = monthNumber(monthKey(window.start)) - monthNumber(firstMonth)
    const next = allWindows[index + 1]
    // La période s'arrête où la suivante commence — et non à sa propre fin de
    // fenêtre : un mensuel démarré le 15 finit le 14 du mois suivant, et le
    // faire déborder d'une colonne ferait se chevaucher deux périodes.
    const lastColumn = next
      ? monthNumber(monthKey(next.start)) - monthNumber(firstMonth) - 1
      : monthNumber(monthKey(window.end < walkUntil ? window.end : walkUntil)) - monthNumber(firstMonth)

    const start = Math.max(from, 0)
    const end = Math.min(lastColumn, CALENDAR_MONTHS - 1)
    if (end < start || end < 0 || start > CALENDAR_MONTHS - 1) return

    // Les colonnes laissées entre deux périodes : une par mois, pour que la
    // grille reste lisible comme un calendrier.
    while (column < start) {
      cells.push(emptyCell(months[column] ?? firstMonth))
      column += 1
    }
    if (column > start) return

    cells.push(fillCell(input, window, health, months[start] ?? firstMonth, end - start + 1))
    column = end + 1
  })

  while (column < CALENDAR_MONTHS) {
    cells.push(emptyCell(months[column] ?? firstMonth))
    column += 1
  }

  return {
    workspaceId: input.workspaceId,
    workspaceName: input.workspaceName,
    period: input.terms.period,
    amountCents: input.amountCents,
    currency: input.currency,
    startDate: input.terms.startDate,
    // La fin d'engagement vient de `billingHealth`, donc de `commitmentEndOf` —
    // une seconde dérivation ici finirait par contredire la colonne « État ».
    commitmentEnd: health.commitmentEnd,
    periodsTotal: allWindows.length,
    derivationCapped,
    cells,
  }
}

function emptyCell(month: string): BillingCalendarCell {
  return {
    month,
    months: 1,
    state: 'no_period',
    window: null,
    reference: null,
    invoiceAmountCents: null,
    invoiceCurrency: null,
    lateDays: null,
  }
}

function fillCell(
  input: BillingCalendarInput,
  window: { start: string; end: string },
  health: BillingHealth,
  month: string,
  months: number,
): BillingCalendarCell {
  const covering = input.invoices.find(invoice => covers(invoice, window)) ?? null

  if (covering) {
    // Le retard d'encaissement n'est pas recalculé : c'est l'alerte du module
    // qui le déclare, avec les mêmes trente jours que la colonne « État ».
    const unpaid = health.alerts.find(
      alert => alert.kind === 'invoice_unpaid' && alert.reference === covering.reference,
    )
    return {
      month,
      months,
      state: covering.paid ? 'paid' : unpaid ? 'late' : 'issued',
      window,
      reference: covering.reference,
      invoiceAmountCents: covering.amountCents,
      invoiceCurrency: covering.currency,
      lateDays: unpaid?.days ?? null,
    }
  }

  // Rien ne couvre la période : elle est « à émettre » tant que le module ne
  // la signale pas, et « en retard » dès qu'il le fait. La fenêtre de grâce de
  // sept jours vit là-bas, jamais ici.
  const missing = health.alerts.find(alert => alert.kind === 'invoice_missing' && alert.window?.start === window.start)
  return {
    month,
    months,
    state: missing ? 'late' : 'to_issue',
    window,
    reference: null,
    invoiceAmountCents: null,
    invoiceCurrency: null,
    lateDays: missing?.days ?? null,
  }
}

/**
 * La grille complète : douze colonnes, une ligne par client sur facture.
 *
 * `anchorMonth` est le dernier mois affiché — absent, illisible ou dans le
 * futur, c'est le mois d'aujourd'hui.
 */
export function buildBillingCalendar(
  inputs: readonly BillingCalendarInput[],
  today: string,
  anchorMonth?: string | null,
): BillingCalendar {
  const currentMonth = monthKey(today)
  const anchor = resolveAnchor(currentMonth, anchorMonth)
  const months = monthsOfCalendar(anchor)
  const rows = inputs.map(input => buildRow(input, today, months))

  // La borne de la navigation « douze mois précédents » se MESURE sur les
  // contrats réels — un bouton qui remonte dans le vide ferait croire à un trou
  // de données là où il n'y a qu'une absence de contrat.
  const earliest = inputs
    .map(input => windowsUntil(input.terms, today)[0]?.start)
    .filter((start): start is string => start !== undefined)
    .sort()[0]

  return {
    months,
    anchorMonth: anchor,
    currentMonth,
    earliestPeriodMonth: earliest ? monthKey(earliest) : null,
    rows,
  }
}
