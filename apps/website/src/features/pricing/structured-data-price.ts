import { PLAN_ORDER, type LiveCatalogCopy } from './live-prices'

/**
 * Le prix d'entrée publié dans la donnée structurée (`Offer.price`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE CHIFFRE EST LE PLUS DANGEREUX DE LA PAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il ne s'affiche NULLE PART. Il ne part que dans le JSON-LD, c'est-à-dire vers
 * Google, qui l'indexe et peut l'afficher dans ses résultats — souvent avant que
 * le visiteur n'ouvre la page. Un prix faux ici ne se corrige pas en rechargeant
 * la page : il reste dans l'index, et c'est lui que le prospect a lu.
 *
 * La page d'accueil écrivait `live.entryPriceDigits ?? '119'`. Quand la requête
 * catalogue échouait, le site annonçait donc **119 €** au monde entier — le prix
 * de `starter`, RETIRÉ DE LA VENTE le 27/08 (`selfServe: false`). Le seul palier
 * achetable est Growth, à 199 €. Rien ne cassait, une page s'affichait, et le
 * moteur de recherche publiait un tarif qu'aucun bouton ne pouvait acheter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS SOURCES, DANS CET ORDRE, ET AUCUN CHIFFRE ÉCRIT EN DUR
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. **Le catalogue live** — le prix que l'opérateur a posé au back-office.
 *      C'est celui que Stripe prélèvera ; il gagne toujours.
 *   2. **La carte que le visiteur a sous les yeux** — la même chaîne du
 *      catalogue de messages que la section Tarifs affiche. Le prix embarqué
 *      vit là, à un seul endroit, et `shipped-price-parity.test.ts` le tient
 *      aligné sur `SHIPPED_PLAN_GRID.growth` du contrat. La donnée structurée
 *      ne peut donc plus contredire la page qui la porte.
 *   3. **Rien.** Le nœud `offers` disparaît du JSON-LD.
 *
 * Le troisième cas est le seul honnête, et c'est la décision de fond de ce
 * correctif. Un prix qu'on ne sait plus lire n'a pas de valeur de repli :
 * « absent » est vrai, « 0 » serait faux (le produit n'est pas gratuit), et un
 * montant deviné serait une promesse commerciale que Stripe ne tiendrait pas.
 * `SoftwareApplication` n'exige pas `offers` ; un `Offer`, lui, exige un prix.
 * Retirer le nœud est donc à la fois valide au sens de schema.org et vrai.
 *
 * `no-hardcoded-price.test.ts` interdit qu'un montant revienne s'écrire dans
 * `apps/website/src` — sans quoi cette réparation durerait trois semaines.
 */

/** Le palier d'entrée : le seul achetable en self-service. */
const ENTRY_PLAN = PLAN_ORDER[0]

/**
 * Les espaces qui groupent les milliers. `\s` couvre l'insécable (U+00A0) et la
 * fine insécable (U+202F) — les deux que le site emploie, et les deux qu'on ne
 * distingue pas à l'oeil dans un fichier de traduction.
 *
 * Le drapeau `g` rend un `RegExp` STATEFUL pour `.test()`. Celui-ci ne sert qu'à
 * `.replace()`, qui repart de zéro à chaque appel ; les deux autres, lus par
 * `.test()` et `.match()`, n'ont volontairement PAS de `g`.
 */
const GROUPING = /\s/g

/** Un séparateur DÉCIMAL possible : une virgule ou un point entre deux chiffres. */
const AMBIGUOUS_SEPARATOR = /\d[.,]\d/

/** Le premier nombre d'une chaîne, groupes de milliers compris. */
const FIRST_NUMBER = /\d[\d\s]*/

/**
 * Les chiffres d'un libellé de prix, ou `null` s'il n'y en a pas d'utilisable.
 *
 * Le site écrit le même montant de quatre façons — « 199 € » (fr, de),
 * « €199 » (en), « € 199 » (nl) —, donc le rang du signe ne dit rien et seul le
 * nombre compte.
 *
 * Deux refus, tous deux volontaires :
 *
 *   · **Un séparateur non espacé entre deux chiffres.** « 1.199 € » groupe les
 *     milliers en allemand et vaut un euro et des poussières en anglais ;
 *     « 199,00 € » est un montant rond partout sauf là où la virgule groupe.
 *     Les quatre langues du site ne s'accordent pas, donc la seule lecture sûre
 *     est de ne pas lire. Ne rien publier est vrai ; publier « 19 900 » serait
 *     faux d'un facteur cent.
 *   · **Zéro.** Un `Offer.price: "0"` annoncerait le produit gratuit à un moteur
 *     de recherche. C'est la doctrine du dépôt, appliquée là où elle se voit le
 *     moins : une valeur absente ne s'affiche JAMAIS « 0 ».
 */
function priceDigits(label: unknown): string | null {
  if (typeof label !== 'string') return null
  if (AMBIGUOUS_SEPARATOR.test(label)) return null

  const match = label.match(FIRST_NUMBER)
  if (!match) return null

  const amount = Number(match[0].replace(GROUPING, ''))
  if (!Number.isFinite(amount) || amount <= 0) return null
  return String(amount)
}

/** Le nom d'une carte, tel que le catalogue de messages le porte. */
function cardName(card: unknown): string | null {
  if (!card || typeof card !== 'object') return null
  const name = (card as { name?: unknown }).name
  return typeof name === 'string' ? name.trim().toLowerCase() : null
}

/**
 * Le prix à publier dans `Offer.price`, ou `null` pour n'en publier aucun.
 *
 * `cards` est le catalogue de messages tel quel (`t.raw('pricing.plans')`) : du
 * JSON édité à la main, donc traité comme inconnu. Une forme inattendue coûte
 * une offre en moins, jamais une page d'accueil en erreur.
 *
 * La jointure se fait par NOM de palier, jamais par rang. C'est le défaut vu en
 * production — quatre cartes jointes par position à deux prix, « Free » à
 * 119 € — et il serait pire aujourd'hui : la carte Free est en PREMIÈRE
 * position et vaut « 0 € », donc un décalage publierait « gratuit ».
 */
export function structuredDataEntryPrice(live: LiveCatalogCopy, cards: unknown): string | null {
  const fromLive = priceDigits(live.entryPriceDigits)
  if (fromLive) return fromLive

  if (!Array.isArray(cards)) return null
  const card = cards.find(candidate => cardName(candidate) === ENTRY_PLAN)
  return priceDigits((card as { price?: unknown } | undefined)?.price)
}
