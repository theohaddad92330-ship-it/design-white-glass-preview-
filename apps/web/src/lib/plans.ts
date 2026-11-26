import {
  DEFAULT_CURRENCY,
  PLAN_FEATURE_KEYS,
  PUBLIC_PLAN_ORDER,
  SHIPPED_PLAN_GRID,
  type BillingCurrency,
  type CurrencyPriceTable,
  type PlanFeatureKey,
  priceInCurrency,
} from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * One plan template as served by `GET /credits/plans` — the operator-editable
 * catalog (`plan_definitions`). `price` is in CENTS, the Stripe convention.
 */
type PlanCatalogEntry = {
  label: string
  price: number
  accounts_limit: number
  enrichment_credits: number
  seats: number
  /** Monthly price in cents of ONE seat beyond `seats` — per-plan, editable. */
  extra_seat_price: number
  /** Ce que le palier OUVRE (gating par offre). Absent d'une API antérieure au
   *  champ : l'écran retombe alors sur ses puces écrites, jamais sur du vide. */
  features?: PlanFeatureKey[]
  /** Prix DÉCLARÉS dans les autres devises (l'euro reste `price`). Absent d'une
   *  API antérieure au champ : la carte reste alors en euros. */
  prices?: CurrencyPriceTable
}

/** The whole catalog, keyed by plan code (`starter` | `team` | `growth` | …). */
export type PlanCatalog = Record<string, PlanCatalogEntry>

/** Name / price / quotas actually rendered on a card, after the live catalog
 *  has been overlaid on the shipped baseline. */
type ResolvedPlan = {
  name: string
  priceEuros: number
  /** Devise réellement affichée sur la carte. */
  currency: BillingCurrency
  /** Montant affiché, en unités mineures de {@link currency}. */
  priceCents: number
  /** Prix du siège supplémentaire, dans la même devise. */
  extraSeatPriceCents: number
  /** La devise demandée n'avait pas de prix déclaré : la carte est en euros et
   *  doit le DIRE, plutôt que de laisser découvrir la devise au paiement. */
  currencyFellBack: boolean
  accounts: number
  enrichments: number
  seats: number
  /** Prix mensuel (€) d'UN siège au-delà de `seats` — varie par palier. */
  extraSeatPriceEuros: number
  /** Ce que le palier ouvre (gating par offre) — la carte en fait ses puces. */
  features: PlanFeatureKey[]
}

/**
 * Miroir embarqué de la grille SERVEUR (`PLAN_CATALOG_DEFAULTS`), utilisé tant
 * que le catalogue live n'a pas répondu. Une carte qui annoncerait des fonctions
 * que le palier n'ouvre pas serait la faute qu'on vient de corriger — donc ce
 * miroir suit la grille, il ne l'invente pas.
 */
const BASELINE_FEATURES: Record<string, PlanFeatureKey[]> = {
  starter: ['exports'],
  // `needs` est descendu de Growth à Team (Louis 31/07).
  team: ['exports', 'chat_ai', 'discover', 'watchlist', 'knowledge_base', 'team_workspace', 'needs'],
  growth: [...PLAN_FEATURE_KEYS],
  beta: [...PLAN_FEATURE_KEYS],
  decouverte: [...PLAN_FEATURE_KEYS],
}

/**
 * Shipped baseline per plan, used until (or instead of) the live catalog. Kept
 * so the billing screen still renders a sane grid while the catalog request is
 * in flight or if it fails — never a blank or zeroed price card.
 *
 * Les chiffres viennent de `SHIPPED_PLAN_GRID` (`@bellum/contracts`) — la même
 * grille que celle dont le serveur sème son catalogue. Ils étaient recopiés ici
 * à la main, donc l'app pouvait afficher 119 € pendant que le serveur en
 * facturait un autre. Ne reste propre à l'app que la liste des fonctions
 * annoncées par carte.
 *
 * `decouverte` : le palier posé au signup en self-service (6 crédits, 7 j).
 * Jamais dans la grille publique — il n'est là que pour LABELLISER un compte
 * Découverte (billing-view-model, CreditsBadge) au lieu de le confondre avec
 * Starter-Solo.
 */
const BASELINE: Record<string, ResolvedPlan> = Object.fromEntries(
  (['starter', 'team', 'growth', 'beta', 'decouverte'] as const).map(code => {
    const row = SHIPPED_PLAN_GRID[code]
    return [
      code,
      {
        name: row.label,
        priceEuros: row.priceCents / 100,
        currency: DEFAULT_CURRENCY,
        priceCents: row.priceCents,
        extraSeatPriceCents: row.extraSeatPriceCents,
        currencyFellBack: false,
        accounts: row.creditsPerCycle,
        enrichments: 0,
        seats: row.seats,
        extraSeatPriceEuros: row.extraSeatPriceCents / 100,
        features: [...BASELINE_FEATURES[code]!],
      } satisfies ResolvedPlan,
    ]
  }),
)

/**
 * Overlay the live catalog on a plan's baseline. An operator editing a price, a
 * quota or a plan's name in the backoffice must reach these cards — otherwise
 * the screen quotes one amount and Stripe charges another.
 */
function resolve(id: string, catalog?: PlanCatalog, currency: BillingCurrency = DEFAULT_CURRENCY): ResolvedPlan {
  const baseline = BASELINE[id]!
  const live = catalog?.[id]
  if (!live) {
    // Pas de catalogue : la grille embarquée est en euros et rien ne permet
    // d'affirmer un prix ailleurs. On ne convertit pas — on le dit.
    const fellBack = currency !== DEFAULT_CURRENCY
    return { ...baseline, currencyFellBack: fellBack }
  }
  const extraSeatCents =
    typeof live.extra_seat_price === 'number' ? live.extra_seat_price : baseline.extraSeatPriceCents
  const priced = priceInCurrency({
    eur: { priceCents: live.price, extraSeatPriceCents: extraSeatCents },
    table: live.prices,
    currency,
  })
  return {
    name: live.label || baseline.name,
    priceEuros: live.price / 100,
    currency: priced.currency,
    priceCents: priced.price.priceCents,
    extraSeatPriceCents: priced.price.extraSeatPriceCents,
    currencyFellBack: priced.fellBack,
    accounts: live.accounts_limit,
    enrichments: live.enrichment_credits,
    seats: live.seats,
    // Le prix du siège est propre au palier (29 / 59 / 89 €) : un siège puise
    // dans le pool de crédits du plan, donc il coûte plus cher là où le pool est
    // plus riche. Non renseigné par le catalogue ⇒ on garde la baseline du
    // palier, jamais un prix emprunté à un autre.
    extraSeatPriceEuros:
      typeof live.extra_seat_price === 'number' ? live.extra_seat_price / 100 : baseline.extraSeatPriceEuros,
    // Le catalogue live fait foi : une grille déplacée dans le backoffice change
    // les puces des cartes sans redéploiement. Réponse antérieure au champ ⇒ le
    // miroir embarqué, jamais une liste vide (qui ferait une carte muette).
    features: Array.isArray(live.features) ? [...live.features] : [...baseline.features],
  }
}

/**
 * In-app billing cards, driven by the live plan catalog when one is supplied.
 *
 * `id` is the server plan code sent to `/credits/checkout` (never derived from
 * the display name — "Starter-Solo" is still plan `starter` server-side).
 * Enterprise is quote-only (contact sales) — no self-serve card here. No free
 * tier: new accounts get a 7-day trial. Included seats VARY per tier, et le prix
 * du siège en plus AUSSI (29 / 59 / 89 € — il puise dans le pool de crédits du
 * palier).
 *
 * A function rather than a constant so the translated feature labels resolve
 * against the CURRENT language at call time.
 */
/**
 * Les puces d'une carte, DÉRIVÉES de la grille de features du palier.
 *
 * Elles étaient écrites à la main, et c'est précisément ce qui a permis à une
 * carte d'annoncer « Chat IA » sur un palier qui ne l'ouvrait pas. Ici, une
 * fonction déplacée dans le backoffice change la carte toute seule.
 *
 * Un palier supérieur ne réénumère pas ce qu'il hérite : « Tout Team, plus : … »
 * dit la marche, et la marche est exactement ce qu'on vend.
 */
function featureLines(plan: ResolvedPlan, previous?: ResolvedPlan): string[] {
  const inherited = new Set(previous?.features ?? [])
  const own = plan.features.filter(key => !inherited.has(key))
  // Pas de delta ⇒ pas de ligne « Tout Team, plus : » suivie de rien. Une
  // promesse sans suite se lit comme un écran cassé — ce qui était le cas en
  // prod quand les trois paliers portaient la même grille.
  if (own.length === 0) return []
  const head = previous ? [i18n.t('billing:planFeatures.everythingIn', { plan: previous.name })] : []
  return [...head, ...own.map(key => i18n.t(`common:planFeatures.short.${key}`))]
}

export function getPlans(catalog?: PlanCatalog, currency: BillingCurrency = DEFAULT_CURRENCY) {
  const starter = resolve('starter', catalog, currency)
  const team = resolve('team', catalog, currency)
  const growth = resolve('growth', catalog, currency)

  return [
    {
      id: 'starter',
      name: starter.name,
      priceEuros: starter.priceEuros,
      // La carte affiche un MONTANT et sa devise ; `priceEuros` survit pour les
      // écrans qui raisonnent encore en euros (comparateur d'offre, bandeaux).
      currency: starter.currency,
      priceCents: starter.priceCents,
      extraSeatPriceCents: starter.extraSeatPriceCents,
      // La devise demandée n'a pas de prix déclaré : la carte est en euros et
      // le dit, plutôt que de laisser le client le découvrir au paiement.
      currencyFellBack: starter.currencyFellBack,
      period: '/mois',
      accounts: starter.accounts,
      enrichments: starter.enrichments,
      seats: starter.seats,
      extraSeatPriceEuros: starter.extraSeatPriceEuros,
      recommended: false,
      features: [
        i18n.t('billing:planFeatures.usageIncluded'),
        i18n.t('billing:planFeatures.users', { count: starter.seats }),
        // Le socle commun à TOUS les paliers (dossier, comptes, contacts,
        // analyses) : il n'est dans aucune grille de features, donc il ne peut
        // pas venir de `featureLines` — mais un acheteur doit le lire.
        i18n.t('billing:planFeatures.coreIncluded'),
        ...featureLines(starter),
      ],
    },
    {
      id: 'team',
      name: team.name,
      priceEuros: team.priceEuros,
      // La carte affiche un MONTANT et sa devise ; `priceEuros` survit pour les
      // écrans qui raisonnent encore en euros (comparateur d'offre, bandeaux).
      currency: team.currency,
      priceCents: team.priceCents,
      extraSeatPriceCents: team.extraSeatPriceCents,
      // La devise demandée n'a pas de prix déclaré : la carte est en euros et
      // le dit, plutôt que de laisser le client le découvrir au paiement.
      currencyFellBack: team.currencyFellBack,
      period: '/mois',
      accounts: team.accounts,
      enrichments: team.enrichments,
      seats: team.seats,
      extraSeatPriceEuros: team.extraSeatPriceEuros,
      recommended: true,
      features: [
        i18n.t('billing:planFeatures.usageIncluded'),
        i18n.t('billing:planFeatures.users', { count: team.seats }),
        ...featureLines(team, starter),
      ],
    },
    {
      id: 'growth',
      name: growth.name,
      priceEuros: growth.priceEuros,
      // La carte affiche un MONTANT et sa devise ; `priceEuros` survit pour les
      // écrans qui raisonnent encore en euros (comparateur d'offre, bandeaux).
      currency: growth.currency,
      priceCents: growth.priceCents,
      extraSeatPriceCents: growth.extraSeatPriceCents,
      // La devise demandée n'a pas de prix déclaré : la carte est en euros et
      // le dit, plutôt que de laisser le client le découvrir au paiement.
      currencyFellBack: growth.currencyFellBack,
      period: '/mois',
      // Real fair-use cap, not "illimité" (Théo restitution §14/§7: chaque analyse
      // coûte des APIs — pas d'illimité technique, définir un fair use).
      accounts: growth.accounts,
      enrichments: growth.enrichments,
      seats: growth.seats,
      extraSeatPriceEuros: growth.extraSeatPriceEuros,
      recommended: false,
      features: [
        i18n.t('billing:planFeatures.usageIncludedFairUse'),
        i18n.t('billing:planFeatures.prioritySupport', { count: growth.seats }),
        ...featureLines(growth, team),
      ],
    },
  ]
}

/**
 * Les cartes de la grille PUBLIQUE — celles qu'on peut acheter en ligne.
 *
 * Team / Enterprise est passé sur devis le 16/08 : il reste dans `getPlans()`
 * (l'écran Facturation doit encore savoir nommer le palier d'un espace qui y est
 * provisionné) mais il n'a plus rien à faire là où quelqu'un ACHÈTE.
 *
 * La marche est recalculée SUR TOUTES les cartes publiques : sinon la carte
 * Growth annonce « Tout Team / Enterprise, plus : » en désignant une carte que
 * l'écran ne montre pas — le lecteur cherche alors une offre qui n'est nulle
 * part.
 *
 * ⚠️ La première version ne recalculait que les cartes d'index ≥ 1 et rendait la
 * première TELLE QUELLE. Tant qu'il y avait deux paliers publics, la première
 * était Starter — dont `getPlans()` calcule déjà la marche sans prédécesseur, si
 * bien que le raccourci ne se voyait pas. La grille du 27/08 (#1152) laisse UN
 * seul palier public, Growth, dont `getPlans()` calcule la marche contre `team` :
 * la carte s'est mise à annoncer « Tout Team / Enterprise, plus : » sur un écran
 * qui ne montre aucun Team. Une carte sans prédécesseur PUBLIC énumère donc ses
 * fonctions, sans en-tête de marche.
 */
export function getPublicPlans(catalog?: PlanCatalog, currency: BillingCurrency = DEFAULT_CURRENCY) {
  const codes: readonly string[] = PUBLIC_PLAN_ORDER
  const cards = getPlans(catalog, currency).filter(plan => codes.includes(plan.id))

  return cards.map((card, index) => {
    const previousCard = cards[index - 1]
    return {
      ...card,
      features: [
        // Les deux premières puces sont les CHIFFRES de la carte (crédits,
        // sièges) : elles ne dépendent pas du palier d'en dessous. Seule la
        // marche en dépend.
        ...card.features.slice(0, 2),
        ...featureLines(
          resolve(card.id, catalog, currency),
          previousCard ? resolve(previousCard.id, catalog, currency) : undefined,
        ),
      ],
    }
  })
}

/**
 * Une entrée de la grille tarifaire d'onboarding — pas forcément un palier.
 *
 * C'est toute la différence avec `getPublicPlans()` : celui-ci répond « que
 * peut-on ACHETER ici », celle-ci répond « que peut-on faire de son argent
 * chez nous ». Les deux réponses n'ont pas la même longueur, et confondre les
 * deux est ce qui a laissé l'écran d'onboarding à une seule carte pendant que
 * le site en montrait trois.
 */
type OnboardingPricingEntry = {
  /** Code de palier serveur pour ce qui s'achète ; sinon un identifiant d'entrée. */
  id: string
  /** Nom lu par le prospect — jamais le code serveur, jamais « Team / Enterprise ». */
  name: string
  /** Montant mensuel en unités mineures. `null` = cette entrée n'a pas de prix à publier. */
  priceCents: number | null
  /** Le même montant en euros, pour les écrans qui raisonnent encore en euros. `null` idem. */
  priceEuros: number | null
  /** Devise du montant affiché — sans objet quand il n'y a pas de montant. */
  currency: BillingCurrency
  /** La devise demandée n'avait pas de prix déclaré : la carte est en euros et le dit. */
  currencyFellBack: boolean
  /**
   * Crédits du cycle. `null` = NON APPLICABLE (démonstration), NÉGOCIÉ
   * (Entreprise) ou PAS LISIBLE (le catalogue n'a pas répondu ce champ) —
   * jamais 0. C'est `purchasable` qui distingue les trois : une entrée qu'on
   * VEND a toujours un volume, donc `null` y veut dire « pas lisible », et
   * l'écran le dit au lieu d'écrire un chiffre. #2003.17
   */
  credits: number | null
  /**
   * Utilisateurs inclus. `null` = sans objet (démonstration) ou négocié
   * (Entreprise) — jamais 0 : « zéro utilisateur » ne veut rien dire. #2003.17
   */
  seats: number | null
  /**
   * Prix mensuel d'UN utilisateur au-delà de `seats`, en unités mineures.
   *
   * ⚠️ `0` ne veut pas dire « gratuit » : il veut dire que ce palier n'en vend
   * AUCUN (c'est la note de `SHIPPED_PLAN_GRID`, et depuis le 27/08 c'est le
   * cas de Growth — la deuxième personne passe par un devis). L'écran doit donc
   * le DIRE plutôt qu'afficher « +0 € ». `null` = l'entrée ne vend rien du tout.
   */
  extraSeatPriceCents: number | null
  /** Ce qu'on lit à la place d'un montant : « Sans compte », « Sur devis ». */
  priceLabel: string
  /** Le palier mis en avant. */
  recommended: boolean
  /**
   * SEULE une entrée `purchasable` peut partir à la caisse.
   *
   * Ce drapeau n'est pas une commodité d'affichage : c'est la garde du chemin
   * de l'argent. L'écran a déjà envoyé deux fois quelqu'un payer un palier
   * qu'on ne vend plus (Team le 16/08, Starter le 27/08), les deux fois parce
   * qu'une carte affichée était devenue une carte sélectionnable.
   */
  purchasable: boolean
  features: string[]
}

/**
 * Les TROIS entrées de la grille tarifaire d'onboarding (#2002.1).
 *
 * « il n'y a qu'un seul forfait possible alors que je devrais pouvoir accéder à
 * la démo, ou payer 199 euros ou alors avoir sur devis le prix entreprise
 * workspace » — et c'est exactement ce que la grille du 27/08 avait tranché :
 * TROIS cartes, dont UN SEUL palier achetable. Le site les montre toutes les
 * trois depuis ce jour-là ; l'app, non, parce qu'elle lisait
 * `PUBLIC_PLAN_ORDER`, qui liste les paliers VENDABLES et non les entrées de la
 * grille. La liste n'était pas fausse, la question posée l'était.
 *
 * Ce que ces deux entrées supplémentaires ne font PAS :
 *
 *  · elles n'affichent aucun prix. Publier « 0 € » sur la démonstration
 *    rouvrirait la fenêtre gratuite que la décision du 24/07 a fermée ; publier
 *    les 25 900 c de `team` publierait une enveloppe qui se négocie.
 *  · elles n'affichent aucun volume de crédits, pour la même raison — et parce
 *    que « non applicable » n'est pas « 0 ».
 *  · elles ne sont pas achetables, donc leur identifiant ne peut pas atteindre
 *    la caisse.
 *
 * Les chiffres du seul palier vendu continuent de venir de `getPublicPlans()` :
 * une dérivation vit à un seul endroit, et c'est elle qui sait recalculer la
 * marche des fonctions entre cartes publiques.
 */
/**
 * Un nombre RÉELLEMENT lu, ou `null` — jamais un zéro de remplissage.
 *
 * Le catalogue arrive du réseau : son type TypeScript décrit ce qu'on attend,
 * pas ce qui est arrivé. Un champ manquant vaut donc `null` ici, et l'écran en
 * tire « pas lisible » plutôt qu'un chiffre. Un zéro RÉELLEMENT répondu, lui,
 * reste zéro : c'est une information (« ce palier ne vend aucun utilisateur en
 * plus »), pas une absence.
 */
function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * L'identifiant de l'entrée « démonstration » de la grille.
 *
 * Il est lu par l'écran d'onboarding, qui est le seul à savoir que cette
 * entrée-là mène quelque part DANS l'app (`/demo`) plutôt qu'à une caisse.
 * Exporté plutôt que recopié : deux littéraux `'demonstration'` dans deux
 * fichiers, c'est une entrée qui perd son bouton le jour où l'un des deux
 * change. #2002.4
 */
export const DEMONSTRATION_ENTRY_ID = 'demonstration'

export function getOnboardingPricingEntries(
  catalog?: PlanCatalog,
  currency: BillingCurrency = DEFAULT_CURRENCY,
): OnboardingPricingEntry[] {
  const demonstration: OnboardingPricingEntry = {
    id: DEMONSTRATION_ENTRY_ID,
    name: i18n.t('billing:pricingEntries.demo.name'),
    priceCents: null,
    priceEuros: null,
    currency,
    currencyFellBack: false,
    credits: null,
    seats: null,
    extraSeatPriceCents: null,
    priceLabel: i18n.t('billing:pricingEntries.demo.priceLabel'),
    recommended: false,
    purchasable: false,
    features: (['guided', 'simulated', 'laura', 'readOnly'] as const).map(key =>
      i18n.t(`billing:pricingEntries.demo.features.${key}`),
    ),
  }

  const enterprise: OnboardingPricingEntry = {
    id: 'enterprise',
    name: i18n.t('billing:pricingEntries.enterprise.name'),
    priceCents: null,
    priceEuros: null,
    currency,
    currencyFellBack: false,
    credits: null,
    seats: null,
    extraSeatPriceCents: null,
    priceLabel: i18n.t('billing:pricingEntries.enterprise.priceLabel'),
    recommended: false,
    purchasable: false,
    features: (['fromTwo', 'pooledCredits', 'manager', 'rollout'] as const).map(key =>
      i18n.t(`billing:pricingEntries.enterprise.features.${key}`),
    ),
  }

  const sold: OnboardingPricingEntry[] = getPublicPlans(catalog, currency).map(plan => ({
    id: plan.id,
    name: plan.name,
    // ⚠️ `priceCents` arrive DÉJÀ en centimes du catalogue (19 900 = 199 €) et
    // `priceEuros` est déjà divisé. On recopie, on ne reconvertit pas : la
    // seconde conversion est l'accident qui a affiché 18 M€ pour 180 k€.
    priceCents: plan.priceCents,
    priceEuros: plan.priceEuros,
    currency: plan.currency,
    currencyFellBack: plan.currencyFellBack,
    // #2003.17 — un champ que le catalogue n'a pas répondu vaut `null`, jamais
    // le nombre qu'il n'a pas envoyé. `accounts_limit` est typé requis, mais il
    // arrive du réseau : une ligne de catalogue incomplète faisait afficher
    // « undefined crédits par mois », et `analysesAffordable(undefined)` rend 0
    // — soit « 0 dossier complet » sur la carte qu'on VEND.
    credits: readNumber(plan.accounts),
    seats: readNumber(plan.seats),
    extraSeatPriceCents: readNumber(plan.extraSeatPriceCents),
    priceLabel: '',
    recommended: plan.recommended,
    purchasable: true,
    features: plan.features,
  }))

  // La démonstration d'abord, le devis en dernier : ce qu'on VEND est au centre,
  // dans le même ordre que la page tarifs du site.
  return [demonstration, ...sold, enterprise]
}

/** The self-serve tiers whose seat price the picker summarises. */
const SELF_SERVE_KEYS = ['starter', 'team', 'growth'] as const

/**
 * Summarise the extra-seat price across the self-serve tiers, for the picker —
 * which has to name a price BEFORE the user has chosen a plan.
 *
 * `uniform` is true when every tier charges the same, so the UI can state one
 * figure. Depuis la grille 29 / 59 / 89 € (Louis 26/07) les paliers DIVERGENT :
 * l'UI dit « à partir de X » plutôt que de présenter le prix d'un palier comme
 * s'il valait pour tous. Sans catalogue, on résume la baseline embarquée — pas
 * un chiffre unique inventé.
 */
export function seatPriceSummary(catalog?: PlanCatalog): { fromCents: number; uniform: boolean; sellable: boolean } {
  const prices = SELF_SERVE_KEYS.map(key => {
    const live = catalog?.[key]?.extra_seat_price
    return typeof live === 'number' ? live : BASELINE[key]!.extraSeatPriceEuros * 100
  })
  return {
    // En unités MINEURES — c'est la forme que `formatCurrencyAmount` attend.
    // Le résumé rendait des euros, que l'écran collait à un `€` écrit dans la
    // traduction ; diviser ici pour remultiplier là-bas n'apportait qu'un
    // arrondi de plus et un symbole en dur.
    fromCents: Math.min(...prices),
    uniform: new Set(prices).size === 1,
    // Un prix de siège à ZÉRO ne veut pas dire « siège gratuit » : il veut dire
    // que ce palier n'en vend pas. Depuis la grille du 27/08, Growth est
    // mono-utilisateur et c'est le seul palier achetable — le sélecteur de
    // sièges n'a donc plus rien à proposer, et il doit se taire plutôt
    // qu'annoncer « à partir de +0 € ».
    sellable: prices.some(cents => cents > 0),
  }
}

/**
 * Reserved beta plan — DELIBERATELY NOT part of the public `getPlans()` grid:
 * the beta plan is never self-served, only assigned from the admin backoffice.
 * It lives here solely so the billing screen can label a beta user's current
 * plan (see billing-view-model) instead of falling back to "Starter-Solo".
 */
export function getBetaPlan(catalog?: PlanCatalog) {
  const beta = resolve('beta', catalog)
  return {
    id: 'beta',
    name: beta.name,
    priceEuros: beta.priceEuros,
    period: '/mois',
    accounts: beta.accounts,
    enrichments: beta.enrichments,
    seats: beta.seats,
    extraSeatPriceEuros: beta.extraSeatPriceEuros,
    recommended: false,
    features: [
      i18n.t('billing:planFeatures.usageIncluded'),
      i18n.t('billing:planFeatures.betaProgram'),
      i18n.t('billing:planFeatures.users', { count: beta.seats }),
    ],
  }
}

/**
 * Le palier de départ (`decouverte`) — comme {@link getBetaPlan}, DÉLIBÉRÉMENT
 * hors de la grille publique `getPlans()` : on ne le vend jamais, c'est le point
 * d'entrée posé au signup. Il existe uniquement pour que l'écran de facturation
 * et le badge crédits NOMMENT un compte Découverte au lieu de le rabattre sur
 * « Starter-Solo » (le `plans[0]` du fallback `findPlan`).
 */
export function getDiscoveryPlan(catalog?: PlanCatalog) {
  const discovery = resolve('decouverte', catalog)
  return {
    id: 'decouverte',
    name: discovery.name,
    priceEuros: discovery.priceEuros,
    period: '/mois',
    accounts: discovery.accounts,
    enrichments: discovery.enrichments,
    seats: discovery.seats,
    extraSeatPriceEuros: discovery.extraSeatPriceEuros,
    recommended: false,
    features: [
      // #4466 — l'usage inclus se décrit, il ne se compte pas en crédits.
      i18n.t('billing:planFeatures.usageIncluded'),
    ],
  }
}
