// Client de « ce que chaque offre rapporte » (GET /internal/admin/offer-economics,
// gardé par InternalSecretGuard). Appelé CÔTÉ SERVEUR uniquement — le secret
// interne ne doit jamais atteindre le navigateur. Même forme que
// src/lib/business-metrics.ts et src/lib/admin.ts.
//
// ⚠️ AUCUNE ÉCRITURE ICI. Cet écran LIT le catalogue enrichi ; le modifier passe
// toujours par PATCH /api/admin/plans/[key], avec sa confirmation.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

// Les trois raisons ci-dessous ne sortent pas de ce fichier : `OfferEconomics`
// les porte, et l'écran les lit à travers lui (knip refuse un type exporté
// consommé nulle part ailleurs).

/** Pourquoi la consommation médiane n'est pas un chiffre. */
type OfferMedianUnavailable = 'no_customers' | 'too_few_customers'

/** Pourquoi le taux de dépassement n'est pas un chiffre. */
type OfferOverrunUnavailable = 'no_customers' | 'no_cap'

/** Pourquoi la marge n'est pas un chiffre. Elle ne l'est JAMAIS — voir l'écran. */
type OfferMarginBlockedReason = 'no_customers' | 'currency_mismatch'

/**
 * Ce qu'une offre rapporte, tel que l'API le mesure.
 *
 * ⚠️ Toutes les dérivées sont `number | null` et le RESTENT jusqu'à l'écran.
 * Une offre à 0 client rend `null` partout ; un `?? 0` ici annulerait tout le
 * travail fait côté API et afficherait « 0 % de marge » sur une offre que
 * personne n'a jamais prise.
 */
export type OfferEconomics = {
  key: string
  label: string
  priceCents: number
  creditsPerCycle: number
  customers: number
  manualCustomers: number
  mrrCents: number | null
  medianCreditsUsed: number | null
  medianUnavailable: OfferMedianUnavailable | null
  overrunRate: number | null
  overrunObserved: number | null
  overrunEligible: number | null
  overrunUnavailable: OfferOverrunUnavailable | null
  /** Vrai tant qu'un cycle en cours peut encore basculer : le taux dit « au
   *  moins X % », jamais un verdict. */
  overrunIsFloor: boolean
  margin: {
    measurable: false
    rate: null
    blockedReason: OfferMarginBlockedReason
    excludedCostFamilies: readonly string[]
  }
}

export async function fetchOfferEconomics(): Promise<OfferEconomics[]> {
  const res = await fetch(`${REAL_BASE}/internal/admin/offer-economics`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`offer-economics a répondu ${res.status} ${res.statusText}`)
  }
  const data = (await res.json()) as { offers?: OfferEconomics[] }
  return data.offers ?? []
}
