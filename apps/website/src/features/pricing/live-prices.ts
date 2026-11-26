// Server-only: the marketing pages read the live, operator-editable plan
// catalog so a price changed in the backoffice reaches the site. `API_URL`
// carries no NEXT_PUBLIC_ prefix — the browser never calls the API directly, so
// there is no CORS dependency. Mirrors the WebsiteBanners fetch.
const API_URL = process.env.API_URL ?? 'https://api.bellum-ai.com'

/**
 * Les paliers ACHETABLES, dans l'ordre du catalogue live. C'est l'ordre des
 * tableaux `prices` / `seats` — jamais celui des cartes affichées.
 *
 * La distinction a coûté une page de tarifs fausse en production : la page
 * d'accueil montrait QUATRE cartes (Free, Starter, Growth, Team / Enterprise) et
 * ce catalogue n'en connaissait que DEUX. Les joindre par position décalait tout
 * d'un cran — « Free » affichait 119 €, « Starter » 249 €, et le prix par siège
 * de Growth ne trouvait rien, donc la carte imprimait `{seatPrice}` tel quel.
 *
 * Depuis la grille du 27/08, le déséquilibre est PIRE : trois cartes (Free,
 * Growth, Entreprise) pour UN seul palier achetable. Une jointure par position
 * mettrait le prix de Growth sur la carte Free.
 *
 * La jointure passe donc par {@link livePlan}, qui prend un CODE. Une carte qui
 * n'est pas un palier (la démonstration gratuite, le devis) passe `null` et
 * garde le texte de son catalogue.
 */
export const PLAN_ORDER = ['growth'] as const

/** Le code d'un palier achetable. */
export type PlanKey = (typeof PLAN_ORDER)[number]

/**
 * Annual = 12 months at −20 %. Mirrors `ANNUAL_DISCOUNT` in
 * `packages/contracts` (the website does not depend on that package) and the
 * server-authoritative charge computed in the API's `cycleUnitAmountCents`.
 *
 * ⚠️ Le mot « mirrors » ne gardait rien. Si la remise change dans le contrat,
 * l'API facture la nouvelle et cette page affiche l'ancienne — le prix annoncé
 * au client avant qu'il paie ne serait pas celui qu'on lui prélève, et rien ne
 * casserait. `annual-discount-parity.test.ts` lit désormais le contrat sur le
 * disque et refuse l'écart ; c'est pour lui que la constante est exportée.
 */
export const ANNUAL_DISCOUNT_MIRROR = 0.8
const ANNUAL_DISCOUNT = ANNUAL_DISCOUNT_MIRROR

/**
 * Le prix par siège livré avec le produit, PAR PALIER — le repli quand le
 * catalogue ne répond pas, ou répond depuis une API déployée avant que le champ
 * n'existe.
 *
 * Ce repli n'est pas décoratif : les catalogues de messages portent un
 * `{seatPrice}` et non un montant écrit, donc un jeton non résolu s'imprime tel
 * quel sur la page. Tous les chemins doivent finir sur un vrai chiffre.
 *
 * Il reste PAR PALIER, et non unique : c'est ce qui avait fait afficher le
 * siège de Starter sur la carte Growth — un prix faux, pas un repli.
 */
const SHIPPED_SEAT_LABEL: Readonly<Record<PlanKey, string>> = {
  // Growth est mono-utilisateur depuis le 27/08 : il ne vend AUCUN siège. Le
  // repli reste défini parce que le type l'exige et parce qu'un `{seatPrice}`
  // oublié quelque part doit s'imprimer en français plutôt qu'en jeton — mais
  // plus aucune carte ne porte ce jeton.
  growth: '—',
}

/** Le repli de la prose qui ne peut nommer aucun palier (la FAQ). */
const BASELINE_SEAT_LABEL = SHIPPED_SEAT_LABEL.growth

/** Monthly and annual amounts for one card, pre-formatted for display. */
type LivePrice = { monthly: string; annual: string }

/**
 * Everything the marketing copy needs from the catalog, pre-formatted.
 *
 * `prices` and `seats` are index-aligned with {@link PLAN_ORDER}. `seatLabel`
 * is the figure the prose uses where it cannot name a tier (the FAQ): the shared
 * price when every tier agrees, otherwise the cheapest — and `seatUniform` says
 * which, so the copy can switch to "from X" instead of quoting one tier's price
 * as if it were universal.
 */
export type LiveCatalogCopy = {
  prices: LivePrice[]
  /** Per-plan seat price. Always a real figure — never an empty placeholder. */
  seats: string[]
  seatLabel: string
  seatUniform: boolean
  /** Entry price, digits only — for the JSON-LD `Offer`. */
  entryPriceDigits: string | null
}

/** Nothing live: every consumer falls back to the message-catalog strings. */
const EMPTY: LiveCatalogCopy = {
  prices: [],
  seats: [],
  seatLabel: BASELINE_SEAT_LABEL,
  seatUniform: true,
  entryPriceDigits: null,
}

/** `"119 €"` — the format the message catalogs use (space before the sign). */
function formatEuros(amount: number): string {
  return `${amount} €`
}

/** Ce qu'une carte peut afficher pour son palier. */
type LivePlanCopy = {
  /** Le prix live, ou `undefined` : la carte garde alors le sien. */
  price?: LivePrice
  /**
   * Le prix par siège — TOUJOURS renseigné pour un palier achetable, live ou
   * livré, parce qu'un `{seatPrice}` non résolu s'imprime tel quel.
   * `undefined` seulement pour une carte qui n'est pas un palier.
   */
  seat?: string
}

/**
 * Ce que le catalogue live dit d'UN palier, désigné par son code.
 *
 * C'est la seule jointure autorisée entre une carte et un prix. Passer `null`
 * (démonstration gratuite, devis) rend un objet vide : ces cartes n'ont pas de
 * palier, donc rien à surcharger — et surtout, elles ne doivent JAMAIS
 * récupérer le prix du palier voisin.
 */
export function livePlan(live: LiveCatalogCopy, key: PlanKey | null): LivePlanCopy {
  if (!key) return {}
  const index = PLAN_ORDER.indexOf(key)
  return { price: live.prices[index], seat: live.seats[index] ?? SHIPPED_SEAT_LABEL[key] }
}

/**
 * Fetch the plan catalog and format every figure the marketing pages display.
 *
 * Returns an all-empty result on any failure (unreachable API, non-OK response,
 * missing plan) so callers fall back to the prices in the message catalogs — a
 * marketing page must never render a blank or invented price.
 */
export async function fetchLiveCatalogCopy(): Promise<LiveCatalogCopy> {
  try {
    const res = await fetch(new URL('/credits/plans', API_URL), { next: { revalidate: 300 } })
    if (!res.ok) return EMPTY
    const catalog = (await res.json()) as Record<string, { price?: number; extra_seat_price?: number } | undefined>

    const prices: LivePrice[] = []
    const seats: string[] = []
    const seatCents: number[] = []
    for (const key of PLAN_ORDER) {
      // Both are in cents (Stripe convention).
      const cents = catalog[key]?.price
      const seat = catalog[key]?.extra_seat_price
      if (typeof cents !== 'number' || cents <= 0) return EMPTY
      const monthly = Math.round(cents / 100)
      prices.push({
        monthly: formatEuros(monthly),
        annual: formatEuros(Math.round(monthly * ANNUAL_DISCOUNT)),
      })
      // A tier without a seat price still gets its card; only the seat copy
      // falls back, so one missing field can't blank the whole page.
      if (typeof seat === 'number' && seat > 0) {
        seatCents.push(seat)
        seats.push(formatEuros(Math.round(seat / 100)))
      } else {
        // An API deployed before the field existed still yields a real figure —
        // celui de CE palier, jamais celui d'un autre.
        seats.push(SHIPPED_SEAT_LABEL[key])
      }
    }

    return {
      prices,
      seats,
      seatLabel: seatCents.length > 0 ? formatEuros(Math.round(Math.min(...seatCents) / 100)) : BASELINE_SEAT_LABEL,
      seatUniform: new Set(seatCents).size <= 1,
      entryPriceDigits: String(Math.round((catalog[PLAN_ORDER[0]]!.price as number) / 100)),
    }
  } catch {
    return EMPTY
  }
}

/**
 * Substitute the live figures into a message-catalog string.
 *
 * The bullets and FAQ answers are read with `t.raw()` (arrays/objects bypass ICU
 * formatting), so their placeholders are replaced here instead. A token with no
 * live value is left exactly as the catalog wrote it — never blanked.
 */
export function fillLiveTokens(text: string, values: Record<string, string | null | undefined>): string {
  return text.replace(/\{(\w+)\}/g, (whole, token: string) => values[token] || whole)
}
