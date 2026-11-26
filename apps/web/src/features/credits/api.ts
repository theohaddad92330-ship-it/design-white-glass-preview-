import type { BillingCurrency } from '@bellum/contracts'
import type { PlanFeatureKey } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import type { PlanCatalog } from '@/lib/plans'

export type UserCredits = {
  user_id: string
  plan: string
  /** MONNAIE UNIQUE (23/07) — plafond de crédits du cycle : quota du plan +
   *  recharge ponctuelle. Un crédit vaut UNE action, quelle qu'elle soit
   *  (analyse, enrichissement, besoin). Optionnel : une réponse d'avant la
   *  bascule ne le porte pas, les alias historiques ci-dessous prennent alors
   *  le relais. */
  credits_limit?: number
  /** Crédits consommés sur le cycle, tous gestes confondus. */
  credits_used?: number
  /** Crédits restants — la seule question que pose désormais la facturation. */
  credits_remaining?: number
  /** L'ANNONCE est due : la part consommée du cycle a atteint le seuil (D5,
   *  défaut 80 %, réglé par `CREDIT_LOW_THRESHOLD_PERCENT` côté serveur). C'est
   *  une décision, pas une donnée brute — l'écran ne recalcule jamais le seuil,
   *  sinon la bannière et la notification `credit_low` finiraient par dire deux
   *  choses différentes du même solde. Absent d'une réponse antérieure au champ. */
  credits_low?: boolean
  accounts_limit: number
  accounts_used: number
  /** Part of `accounts_limit` bought as a one-off pack. Unlike the plan quota it
   *  does NOT survive the monthly reset (it buys capacity for the current cycle
   *  only). Optional — older payloads omit it. Drives the plan-vs-pack breakdown
   *  (Théo restitution P0-07 : « ne pas mélanger plan, crédits inclus, achetés »). */
  topup_analyses?: number
  /** Crédits reportés du cycle précédent, déjà filtrés côté serveur : ce champ
   *  ne contient QUE du report encore valide (0 sinon). */
  rollover_credits?: number
  /** Échéance du report (ISO), `null` quand il n'y en a pas. */
  rollover_expires_at?: string | null
  /** @deprecated Alias de `credits_remaining` : il n'existe plus de seconde
   *  monnaie. Le serveur renvoie ici le VRAI solde, pour qu'une surface pas
   *  encore migrée n'affiche pas « 0 enrichissement ». */
  enrichment_credits: number
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  /**
   * Le plan + le quota sont partagés à l'échelle de l'espace de travail : ils
   * vivent sur l'abonnement du **propriétaire**. Ces champs décrivent le siège
   * de facturation du caller.
   */
  /** Vrai si le caller est le propriétaire de l'espace (peut éditer la facturation). */
  is_billing_owner?: boolean
  /** Nombre de sièges inclus dans le plan (membres autorisés). */
  seats_total?: number
  /** Nombre de sièges occupés aujourd'hui (membres de l'espace). */
  seats_used?: number
  /** Sièges payés au-delà des 3 inclus. */
  extra_seats?: number
  /** `manual` = contrat négocié, facturé sur facture (virement), sans abonnement
   *  Stripe. `stripe` = self-serve. Explicite : l'absence d'un identifiant
   *  Stripe ne suffit pas à distinguer les deux (elle décrit aussi un essai ou
   *  un paiement abandonné). */
  billing_mode?: 'stripe' | 'manual'
  /** Fin de l'essai gratuit 7 jours (ISO) — null pour les plans payants. */
  trial_end?: string | null
  /** Prochain renouvellement du quota mensuel (plans payants) — borne réelle du
   *  reset serveur. Absent sur un palier à fenêtre et sur les réponses d'avant le
   *  champ : l'écran reste alors sur « renouvellement automatique », sans date. */
  next_reset?: string | null
  /** Vrai quand la fenêtre d'essai est passée → compte verrouillé. */
  trial_expired?: boolean
  /** Mode démo (C1) : espace de démonstration — données fictives, aucun débit,
   *  bannière « Mode démo » affichée sur toutes les pages. */
  is_demo?: boolean
  /** Ce que l'offre OUVRE (copilote, exports, CRM, MCP, API publique). Absent
   *  d'une réponse antérieure au champ : l'app laisse alors tout ouvert et c'est
   *  le serveur qui refuse — voir `usePlanFeature`. */
  features?: PlanFeatureKey[]
}

/** Une facture Stripe réelle, aplatie par l'API pour l'affichage. */
export type StripeInvoice = {
  id: string
  number: string | null
  /** Montant en centimes. */
  amount: number
  currency: string
  /** `paid` | `open` | `draft` | `void` | `uncollectible`. */
  status: string
  /** Timestamp de création (secondes UNIX). */
  created: number
  hosted_invoice_url: string | null
  invoice_pdf: string | null
}

export const creditsApi = {
  getMine(): Promise<UserCredits> {
    return apiFetch<UserCredits>({ path: '/credits' })
  },
  invoices(): Promise<{ invoices: StripeInvoice[] }> {
    return apiFetch<{ invoices: StripeInvoice[] }>({ path: '/credits/invoices' })
  },
  /**
   * Operator-editable plan catalog. Public (no auth) and returned as a bare
   * object keyed by plan code — not wrapped in `{ plans }` like the packs above.
   */
  plans(): Promise<PlanCatalog> {
    return apiFetch<PlanCatalog>({ path: '/credits/plans' })
  },
  checkout(plan: string, annual = false, extraSeats = 0, currency?: BillingCurrency): Promise<{ url: string }> {
    return apiFetch<
      { url: string },
      { plan: string; annual: boolean; extra_seats: number; currency?: BillingCurrency }
    >({
      path: '/credits/checkout',
      method: 'POST',
      // La devise est une PRÉFÉRENCE : le serveur la refuse si l'espace est déjà
      // facturé, et retombe sur l'euro si le prix n'est pas déclaré. Le client
      // n'envoie jamais un montant.
      body: { plan, annual, extra_seats: extraSeats, ...(currency ? { currency } : {}) },
    })
  },
  /** La devise dans laquelle CET espace sera facturé, et si elle est figée. */
  billingCurrency(): Promise<{ currency: BillingCurrency; locked: boolean; supported: readonly string[] }> {
    return apiFetch<{ currency: BillingCurrency; locked: boolean; supported: readonly string[] }>({
      path: '/credits/currency',
    })
  },
  portal(): Promise<{ url: string }> {
    return apiFetch<{ url: string }>({ path: '/credits/portal', method: 'POST' })
  },
  /**
   * Lance une session Stripe Checkout en mode `setup` — collecte une
   * carte sans débit, l'attache au customer Stripe (créé à la volée si
   * absent), puis redirige sur l'URL retournée.
   */
  setupPaymentMethod(): Promise<{ url: string }> {
    return apiFetch<{ url: string }>({ path: '/credits/setup-payment-method', method: 'POST' })
  },
}
