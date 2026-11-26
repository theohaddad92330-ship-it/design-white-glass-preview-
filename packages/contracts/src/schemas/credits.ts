import { z } from 'zod'

// Grille finale (agent_docs/billing/pricing-proposal.md §3 — VALIDÉ Louis 16/07).
// `team` replaced `pro` and `growth` replaced `business` (API migration
// 1785850000000 renames existing rows, same pattern as free→trial / scale→business).
// `trial` = the 7-day no-card trial granted at signup (never sold).
// `beta` = reserved onboarding plan (59€/mo), assigned from the admin backoffice
// only — it is intentionally absent from `checkoutSchema` (never publicly sold).
// Enterprise is quote-only (sur devis): no plan code, no self-serve checkout.
export const planSchema = z.enum(['trial', 'starter', 'team', 'growth', 'beta'])

export const userCreditsSchema = z.object({
  id: z.string().guid(),
  user_id: z.string().guid(),
  plan: planSchema,
  /** EFFECTIVE analyses cap for the cycle = plan quota + one-off top-up. */
  accounts_limit: z.number(),
  accounts_used: z.number(),
  /** The part of `accounts_limit` bought as a one-off pack. Unlike the plan
   *  quota it does NOT survive the monthly reset — a top-up buys capacity for
   *  the cycle it was bought in, not a permanent quota increase. Optional so
   *  older payloads stay valid. */
  topup_analyses: z.number().optional(),
  enrichment_credits: z.number(),
  stripe_customer_id: z.string().nullable(),
  stripe_subscription_id: z.string().nullable(),
  // Pricing v2 — the 7-day trial window. `trial_end` is null for paid plans;
  // `trial_expired` is true once a trial's window has closed (account locked).
  // Optional so older payloads / defaults stay valid.
  trial_end: z.string().nullable().optional(),
  // Prochain renouvellement du quota mensuel (plans payants) — la borne EXACTE du
  // cron de reset, jamais une date d'affichage. Absent/null sur un palier à
  // fenêtre (il expire, il ne se renouvelle pas) et sur une réponse antérieure au
  // champ : l'écran affiche alors « renouvellement automatique », sans date.
  next_reset: z.string().nullable().optional(),
  trial_expired: z.boolean().optional(),
  // Demo mode (C1) — true when the caller's active workspace is a demo space:
  // actions are free (no debit), real analyses replay the seeded dossiers, and
  // the web shows a permanent « Mode démo » banner. Optional for old payloads.
  is_demo: z.boolean().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})

/** Annual billing multiplier — 12 months charged once with -20%. Shared by the
 *  web (price display) and the API (Stripe unit_amount) so they never drift. */
export const ANNUAL_DISCOUNT = 0.8

export const checkoutSchema = z.object({
  // `trial` is never checkout-able (it's granted at signup, no card); only paid
  // plans can be purchased. `beta` is admin-assigned, never self-served.
  plan: z.enum(['starter', 'team', 'growth']),
  /** Bill yearly (12 months, -20%) instead of monthly. The server, not the
   *  client, computes the amount — this only picks the cycle. */
  annual: z.boolean().optional().default(false),
  /** Extra seats beyond the plan's included allowance (+29€/mo each; included
   *  seats vary per tier — Starter-Solo 1, Team 3, Growth 8). The server
   *  validates the count and owns the per-seat price; the client never sends an
   *  amount. */
  extra_seats: z.number().int().min(0).max(47).optional(),
  /**
   * Devise souhaitée. Le serveur reste maître : il ignore ce champ si l'espace a
   * DÉJÀ été facturé (Stripe ne change pas la devise d'un abonnement), et il
   * retombe sur l'euro si aucun prix n'est déclaré dans la devise demandée. Le
   * client ne transmet jamais un montant, seulement une préférence.
   */
  currency: z.enum(['eur', 'usd', 'gbp', 'chf', 'cad']).optional(),
  success_url: z.string().url().optional(),
  cancel_url: z.string().url().optional(),
})

export type UserCredits = z.infer<typeof userCreditsSchema>
export type Checkout = z.infer<typeof checkoutSchema>
export type Plan = z.infer<typeof planSchema>
