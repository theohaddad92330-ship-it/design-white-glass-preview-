/**
 * La facturation en plusieurs devises.
 *
 * Une règle porte tout le reste : **Bellum ne convertit rien.** Chaque devise a
 * son PRIX DÉCLARÉ, posé par l'opérateur, et une devise sans prix déclaré n'est
 * pas vendue — le client est facturé en euros et l'écran le dit. Un taux de
 * change appliqué à la volée aurait trois défauts qu'aucun garde-fou ne rattrape :
 * il change entre l'affichage et le prélèvement, il produit des prix laids
 * (128,37 $) que personne n'assume commercialement, et il fait diverger la
 * comptabilité de ce que le client a vu.
 *
 * Deuxième règle, imposée par Stripe et non par nous : **la devise d'un
 * abonnement ne se change pas.** Modifier la devise d'un abonnement existant
 * demande de l'annuler et d'en créer un autre. Donc dès qu'un espace a payé une
 * fois, sa devise est FIGÉE, et l'écran l'affiche comme telle plutôt que de
 * proposer un choix qui échouerait.
 */

/**
 * Les devises vendables. Toutes ont **deux décimales**, ce qui est ce qui rend
 * la convention « montant en centimes » vraie partout dans le code.
 *
 * ⚠️ Ajouter une devise à zéro décimale (JPY, KRW) casserait cette convention
 * SILENCIEUSEMENT : Stripe attend alors un montant en unités entières, et
 * envoyer 11900 pour 119 ¥ prélèverait 11 900 ¥. Le test `currencies.test.ts`
 * refuse toute devise dont les décimales ne sont pas 2 — c'est délibérément un
 * mur, pas un avertissement.
 */
export const SUPPORTED_CURRENCIES = ['eur', 'usd', 'gbp', 'chf', 'cad'] as const
export type BillingCurrency = (typeof SUPPORTED_CURRENCIES)[number]

/** La devise par défaut, et le repli de toutes les décisions ci-dessous. */
export const DEFAULT_CURRENCY: BillingCurrency = 'eur'

/** Nombre de décimales de chaque devise vendable (toutes à 2 — voir ci-dessus). */
export const CURRENCY_MINOR_UNITS: Readonly<Record<BillingCurrency, number>> = {
  eur: 2,
  usd: 2,
  gbp: 2,
  chf: 2,
  cad: 2,
}

export function isBillingCurrency(value: unknown): value is BillingCurrency {
  return typeof value === 'string' && (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
}

/**
 * Pays → devise proposée par DÉFAUT.
 *
 * Volontairement court et explicite : seuls les pays où l'on vend réellement y
 * figurent. Un pays absent n'est pas une erreur, c'est « on lui propose l'euro »
 * — ce qui est vrai pour toute la zone euro et honnête partout ailleurs, puisque
 * le client peut choisir avant de payer.
 *
 * Ce n'est PAS le pays de `workspaces.country` : celui-là décrit le MARCHÉ que
 * l'espace prospecte (il pilote les sources et les packs pays). Facturer en
 * dollars une ESN française parce qu'elle prospecte les États-Unis serait
 * exactement le genre d'erreur silencieuse qu'on cherche à éviter.
 */
const COUNTRY_CURRENCY: Readonly<Record<string, BillingCurrency>> = {
  US: 'usd',
  GB: 'gbp',
  UK: 'gbp',
  CH: 'chf',
  LI: 'chf',
  CA: 'cad',
}

/**
 * La devise à utiliser, dans l'ordre de priorité qui compte.
 *
 * 1. **Ce qui est déjà facturé gagne toujours.** Un abonnement en cours ne
 *    change pas de devise (contrainte Stripe) : ignorer ce verrou ferait
 *    proposer un choix qui échouerait au paiement.
 * 2. Ce que l'utilisateur a choisi, s'il est vendable.
 * 3. Le pays de facturation déclaré.
 * 4. L'euro.
 */
export function resolveBillingCurrency(input: {
  /** Devise déjà facturée pour cet espace — verrou. */
  locked?: string | null
  /** Devise choisie à l'écran. */
  requested?: string | null
  /** Pays de FACTURATION (jamais le marché prospecté). */
  billingCountry?: string | null
}): BillingCurrency {
  if (isBillingCurrency(input.locked)) return input.locked
  if (isBillingCurrency(input.requested)) return input.requested
  const country = input.billingCountry?.trim().toUpperCase()
  if (country && COUNTRY_CURRENCY[country]) return COUNTRY_CURRENCY[country]
  return DEFAULT_CURRENCY
}

/** Un prix déclaré dans une devise donnée. Les deux montants sont en unités
 *  mineures (centimes), comme partout ailleurs. */
export type CurrencyPrice = {
  priceCents: number
  extraSeatPriceCents: number
}

/** Prix déclarés par devise. Une devise ABSENTE n'est pas vendue dans cette
 *  devise — ce n'est pas un prix à zéro. */
export type CurrencyPriceTable = Partial<Record<BillingCurrency, CurrencyPrice>>

/**
 * Le prix à facturer, et la vérité sur ce qui s'est passé.
 *
 * `fellBack: true` dit que la devise demandée n'a pas de prix déclaré et qu'on
 * facture en euros. C'est cette information qui permet à l'écran d'écrire
 * « facturé en euros » AVANT le paiement, au lieu de laisser le client le
 * découvrir sur son relevé bancaire.
 */
export function priceInCurrency(input: {
  /** Prix euro de référence (les colonnes historiques `price_cents`). */
  eur: CurrencyPrice
  /** Prix déclarés dans les autres devises. */
  table?: CurrencyPriceTable | null
  currency: BillingCurrency
}): { currency: BillingCurrency; price: CurrencyPrice; fellBack: boolean } {
  if (input.currency === DEFAULT_CURRENCY) {
    return { currency: DEFAULT_CURRENCY, price: input.eur, fellBack: false }
  }
  const declared = input.table?.[input.currency]
  if (!declared) return { currency: DEFAULT_CURRENCY, price: input.eur, fellBack: true }
  return { currency: input.currency, price: declared, fellBack: false }
}

/**
 * Formate un montant pour l'affichage.
 *
 * L'`Intl` du navigateur place le symbole et le séparateur selon la LANGUE de
 * lecture, ce qui est le comportement voulu : un lecteur français lit
 * « 119,00 $ US », un lecteur anglais « US$119.00 ». Ce qui ne doit jamais
 * changer, c'est le MONTANT.
 */
export function formatCurrencyAmount(amountCents: number, currency: BillingCurrency, locale = 'fr-FR'): string {
  const minorUnits = CURRENCY_MINOR_UNITS[currency]
  const amount = amountCents / 10 ** minorUnits
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: amount % 1 === 0 ? 0 : minorUnits,
    maximumFractionDigits: minorUnits,
  }).format(amount)
}

/**
 * Relit une table de prix venue de la base ou d'un formulaire, et ne garde que
 * ce qui EST un prix.
 *
 * Même prudence que `normalizePlanFeatures` sur les fonctions de palier : la
 * colonne est du JSON libre, donc éditable à la main et faillible. Trois refus,
 * chacun pour une erreur qu'on a vue passer ailleurs :
 *
 * - une **devise inconnue** est jetée (une faute de frappe ne crée pas un
 *   tarif fantôme qui apparaîtrait sur la grille publique) ;
 * - un montant **non entier** est jeté : Stripe prélève des unités mineures
 *   entières, et `129.5` centimes n'existe pas ;
 * - un montant **négatif** est jeté — il produirait un avoir, pas une vente.
 *
 * Un prix de **zéro est accepté** : c'est ainsi qu'on offre un palier ou un
 * siège supplémentaire, et le refuser retirerait un geste commercial légitime.
 */
export function sanitizeCurrencyPrices(value: unknown): CurrencyPriceTable {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: CurrencyPriceTable = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isBillingCurrency(key)) continue
    if (key === DEFAULT_CURRENCY) continue // l'euro vit dans `price_cents`, pas ici
    if (!raw || typeof raw !== 'object') continue
    const candidate = raw as Record<string, unknown>
    const price = candidate.priceCents
    const seat = candidate.extraSeatPriceCents
    if (!Number.isInteger(price) || (price as number) < 0) continue
    if (!Number.isInteger(seat) || (seat as number) < 0) continue
    out[key] = { priceCents: price as number, extraSeatPriceCents: seat as number }
  }
  return out
}
