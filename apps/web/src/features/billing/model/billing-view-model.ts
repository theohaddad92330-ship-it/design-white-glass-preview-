import type { StripeInvoice, UserCredits } from '@/features/credits/api'
import { i18n } from '@/i18n'
import { getBetaPlan, getDiscoveryPlan, getPlans, type PlanCatalog } from '@/lib/plans'
import { isWindowedPlan } from '../lib/windowedPlan'

export type BillingInvoice = {
  id: string
  label: string
  date: string
  amount: string
  status: 'paid' | 'pending'
  /** Lien Stripe hébergé (facture / PDF) — null si Stripe n'en fournit pas. */
  url: string | null
}

export type BillingViewModel = {
  planLabel: string
  planStatus: 'active' | 'trial'
  benefits: string[]
  renewalLabel: string
  invoices: BillingInvoice[]
  /** Vrai si l'utilisateur a un abonnement Stripe actif (→ portail). */
  hasSubscription: boolean
  /** Plan courant (`free` | `starter` | `pro` | `scale`) pour le sélecteur. */
  currentPlanId: string
  /**
   * Vrai si le caller est le propriétaire de l'espace de travail. Le plan est
   * partagé par toute l'équipe : seul le propriétaire édite la facturation ; les
   * membres voient les contrôles en lecture seule.
   */
  isBillingOwner: boolean
  /** Nombre de sièges occupés (membres de l'espace). */
  seatsUsed: number
  /** Nombre de sièges inclus dans le plan. */
  seatsTotal: number
  /** Libellé prêt à afficher, ex. « 2 / 5 » ; au-delà du forfait, le seul nombre d'occupés (jamais « 2 / 1 »). */
  seatsLabel: string
  /** #4669.1 — sièges occupés au-delà de ceux payés (0 si le rapport tombe juste) : l'écran le NOMME. */
  seatsOverBy: number
}

// #4466 — le modèle de /billing ne porte ni solde, ni consommation, ni report :
// forfait, renouvellement, sièges et factures. La consommation vit au back-office.
export function buildBillingViewModel(
  credits: UserCredits,
  invoices: StripeInvoice[],
  /** Live operator-editable catalog; omitted → the shipped baseline labels. */
  catalog?: PlanCatalog,
): BillingViewModel {
  const plan = findPlan(credits.plan, catalog)
  const hasSubscription = Boolean(credits.stripe_subscription_id)
  // Invoice-billed (sales-led) workspace: there is no Stripe subscription by
  // design, so « aucun renouvellement actif » would read as a problem rather
  // than as their normal, paid state.
  const isManuallyBilled = credits.billing_mode === 'manual'
  // Workspace-shared plan: seats come from the API (owner's plan). Fall back to
  // the static catalog only for the brief placeholder/skeleton state.
  const isBillingOwner = credits.is_billing_owner ?? true
  const seatsTotal = credits.seats_total ?? plan.seats
  const seatsUsed = Math.max(0, credits.seats_used ?? 1)
  // #4669.1 — plus d'occupés que de payés : une fraction impossible. On dit le nombre d'occupés et l'écart est nommé
  // par l'écran (`plan.seatsOver`), jamais deviné ni écrasé.
  const seatsOverBy = Math.max(0, seatsUsed - seatsTotal)

  // On a trial, "renouvellement" is really the trial expiry — show the date.
  const isTrialWithEnd = isWindowedPlan(credits.plan) && Boolean(credits.trial_end)

  return {
    planLabel: i18n.t('billing:viewModel.planLabel', { plan: plan.name }),
    planStatus: isWindowedPlan(credits.plan) ? 'trial' : 'active',
    benefits: [...plan.features],
    renewalLabel: isTrialWithEnd
      ? i18n.t('billing:viewModel.trialExpiry', { date: formatDay(credits.trial_end as string) })
      : isManuallyBilled
        ? i18n.t('billing:viewModel.renewalManual')
        : // TF1 P0-07 : « quand mes analyses repartent-elles à zéro ? ». La date vient
          // du serveur (période de quota réelle) ; sans elle, on garde la formule
          // vague plutôt que d'en inventer une.
          credits.next_reset
          ? i18n.t('billing:viewModel.renewalOn', { date: formatDay(credits.next_reset) })
          : hasSubscription
            ? i18n.t('billing:viewModel.renewalAvailable')
            : i18n.t('billing:viewModel.renewalNone'),
    invoices: invoices.map(toBillingInvoice),
    hasSubscription,
    currentPlanId: credits.plan,
    isBillingOwner,
    seatsUsed,
    seatsTotal,
    seatsLabel: seatsOverBy > 0 ? String(seatsUsed) : `${seatsUsed} / ${seatsTotal}`,
    seatsOverBy,
  }
}

function findPlan(planId: string, catalog?: PlanCatalog) {
  // Beta is reserved (not in the public plans grid) but a beta user must still
  // see their real plan label — resolve it through the beta mirror too. Match
  // on the server plan code (`id`), not the display name ("Starter-Solo" is
  // plan `starter`).
  const plans = getPlans(catalog)
  // Beta AND Découverte are reserved (neither is in the public grid) but a user
  // on either must still see their real plan label — resolve them through their
  // mirrors too, rather than falling through to `plans[0]` (Starter-Solo).
  return [...plans, getBetaPlan(catalog), getDiscoveryPlan(catalog)].find(plan => plan.id === planId) ?? plans[0]
}

// Resolved per call (not module-level) so the date locale follows the current language.
function formatInvoiceDate(createdSeconds: number): string {
  return new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(createdSeconds * 1000))
}

/** ISO date string → localized « 28 juil. 2026 » (trial expiry). */
function formatDay(iso: string): string {
  return new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

function toBillingInvoice(invoice: StripeInvoice): BillingInvoice {
  return {
    id: invoice.id,
    label: invoice.number
      ? i18n.t('billing:invoices.labelWithNumber', { number: invoice.number })
      : i18n.t('billing:invoices.labelFallback'),
    date: formatInvoiceDate(invoice.created),
    amount: formatCurrency(invoice.amount, invoice.currency),
    status: invoice.status === 'paid' ? 'paid' : 'pending',
    url: invoice.hosted_invoice_url ?? invoice.invoice_pdf ?? null,
  }
}

function formatCurrency(amountInCents: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(amountInCents / 100)
}
