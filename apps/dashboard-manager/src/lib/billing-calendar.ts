// Client du calendrier de facturation sur facture (#1653) et de la relance
// préparée d'une période en retard (#1655).
// GET /internal/admin/clients/manual-calendar et /clients/manual-reminder,
// gardés par InternalSecretGuard.
// Appelé CÔTÉ SERVEUR uniquement — le secret interne ne doit jamais atteindre
// le navigateur. Même forme que src/lib/business-metrics.ts et src/lib/admin.ts.
//
// ⚠️ AUCUNE ÉCRITURE ICI, ET AUCUN ENVOI. Le calendrier LIT ce que le module de
// facturation dérive ; il n'émet aucun document et ne change ni un seuil, ni une
// facture, ni un contrat. La relance est PRÉPARÉE — ce fichier rend un texte,
// il ne connaît aucun fournisseur de messagerie et n'a aucun moyen d'en
// atteindre un.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/**
 * Ce qu'une cellule raconte — les cinq états de la légende de #1653.
 *
 * ⚠️ `no_period` dit « aucune période ne COMMENCE ce mois-ci ». Ce n'est ni
 * « rien à facturer », ni « à jour » : sur un contrat trimestriel, deux mois
 * sur trois n'ouvrent aucune période et le contrat court quand même.
 */
export type BillingCalendarCellState = 'paid' | 'issued' | 'to_issue' | 'late' | 'no_period'

export type BillingCalendarCell = {
  /** `YYYY-MM` de la PREMIÈRE colonne occupée. */
  month: string
  /** Colonnes occupées. Une période trimestrielle en occupe trois. */
  months: number
  state: BillingCalendarCellState
  /** La période elle-même. `null` pour `no_period` — jamais une date devinée. */
  window: { start: string; end: string } | null
  /** La référence de la facture qui couvre la période, telle que la compta l'a numérotée. */
  reference: string | null
  /** Le montant RÉELLEMENT facturé. `null` tant qu'aucune facture ne couvre la période. */
  invoiceAmountCents: number | null
  invoiceCurrency: string | null
  /** Jours de retard mesurés. `null` quand il n'y a pas de retard — jamais `0`. */
  lateDays: number | null
}

export type BillingCalendarRow = {
  workspaceId: string
  workspaceName: string
  period: 'monthly' | 'quarterly' | 'yearly' | 'one_off'
  /** Le montant du CONTRAT par période — ce qui est attendu, pas ce qui est émis. */
  amountCents: number
  currency: string
  startDate: string
  /** `null` = aucun engagement enregistré. Ne JAMAIS afficher « 0 mois ». */
  commitmentEnd: string | null
  /**
   * TOUTES les périodes dérivées depuis le début du contrat — pas les douze
   * affichées. C'est le chiffre que #1653 croyait plafonné à 20 : le module
   * dit 240, et un contrat de 2019 en a plus de quatre-vingt-dix.
   */
  periodsTotal: number
  /** `true` quand le plafond de 240 du module a arrêté la marche avant aujourd'hui. */
  derivationCapped: boolean
  /** Le pavage des douze colonnes : la somme des `months` vaut toujours 12. */
  cells: BillingCalendarCell[]
}

export type BillingCalendar = {
  /** Les douze `YYYY-MM` de la grille, du plus ancien au plus récent. */
  months: string[]
  /** Le dernier mois affiché. Jamais dans le futur. */
  anchorMonth: string
  /** Le mois d'aujourd'hui, mesuré par l'API — la borne que la navigation ne franchit pas. */
  currentMonth: string
  /** Le mois de la plus ancienne période, toutes lignes confondues. `null` s'il n'y en a aucune. */
  earliestPeriodMonth: string | null
  rows: BillingCalendarRow[]
}

/**
 * Le calendrier des douze mois qui se terminent sur `month` (`YYYY-MM`).
 *
 * Un mois absent, illisible ou dans le futur : l'API retombe sur le mois
 * courant. Une URL retapée à la main ne casse pas l'écran, et n'invente rien
 * non plus — la réponse porte le mois RÉELLEMENT retenu.
 */
export async function fetchBillingCalendar(month?: string): Promise<BillingCalendar> {
  const query = month ? `?month=${encodeURIComponent(month)}` : ''
  const res = await fetch(`${REAL_BASE}/internal/admin/clients/manual-calendar${query}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`clients/manual-calendar a répondu ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as BillingCalendar
}

/* ───────────────────────────── LA RELANCE (#1655) ───────────────────────── */

/** Les trois tons du produit. Le vocabulaire vient de l'API, jamais réinventé ici. */
export type ReminderTone = 'neutral' | 'firm' | 'escalate'

/** Une relance déjà CONSIGNÉE : quand, par qui, sur quel ton. */
export type LoggedReminder = { at: string; by: string; tone: ReminderTone; index: number }

/**
 * Ce que l'API rend quand on ouvre une période en retard : la relance prête à
 * copier, ou le refus qui dit pourquoi il n'y en a pas.
 *
 * ⚠️ `prepared: false` n'est PAS une panne, et l'écran ne doit pas se taire
 * dessus : « la cadence est suspendue » et « il n'y a rien à faire » sont deux
 * phrases différentes, et c'est la confusion des deux que le produit client a
 * déjà payée le 28/08 sur une facture en litige.
 */
// Non exporté : il n'est consommé qu'à travers `BillingReminderView`, et le
// panneau y accède par `BillingReminderView['reminder']`. Un type exporté que
// personne n'importe est ce que `pnpm lint:exports:types` refuse.
type BillingReminder =
  | {
      prepared: true
      invoiceId: string
      index: number
      tone: ReminderTone
      toneSuggested: ReminderTone
      toneOverridden: boolean
      dueOn: string
      overdueDays: number
      dueSince: string
      recipientEmail: string
      subject: string
      body: string
      /** La mention légale du 3ᵉ rang, CITÉE des CGV. `null` aux autres tons. */
      legalNotice: string | null
      history: LoggedReminder[]
    }
  | {
      prepared: false
      reason: 'no_invoice' | 'already_paid' | 'dispute_open' | 'cadence_exhausted' | 'not_overdue_yet' | 'incomplete'
      /** La facture concernée — `null` quand il n'y en a aucune. C'est elle que
       *  le geste inverse du litige (« lever le litige ») désigne. */
      invoiceId: string | null
      /** Ce qui manque, NOMMÉ, quand `reason === 'incomplete'`. */
      missing: string[]
      dueOn: string | null
      /** Ce que le client reproche, quand c'est un litige qui refuse. */
      disputeReason: string | null
    }

export type BillingReminderView = {
  workspaceId: string
  workspaceName: string
  window: { start: string; end: string }
  reminder: BillingReminder
}

/**
 * La relance préparée pour une période — LECTURE SEULE.
 *
 * `tone` force le ton (règle 3 de #1655) ; absent, c'est la cadence qui décide.
 * La réponse porte toujours les deux, pour que l'écran puisse dire « ton forcé »
 * plutôt que de laisser croire que la cadence a changé d'avis.
 */
export async function fetchBillingReminder(
  workspaceId: string,
  periodStart: string,
  tone?: string | null,
): Promise<BillingReminderView> {
  const params = new URLSearchParams({ workspaceId, periodStart })
  if (tone) params.set('tone', tone)
  const res = await fetch(`${REAL_BASE}/internal/admin/clients/manual-reminder?${params.toString()}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`clients/manual-reminder a répondu ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as BillingReminderView
}
