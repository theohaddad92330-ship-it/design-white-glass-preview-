/**
 * Factory baseline for the billing plan catalog.
 *
 * These values are the SHIPPED defaults — byte-identical to the former hardcoded
 * `PLAN_CONFIG` const that lived in `credits.service.ts` (enforcement fields:
 * `price`, `accounts_limit`, `enrichment_credits`, `seats`). The golden parity
 * test (`plan-catalog.golden.spec.ts`) freezes them against a snapshot of the old
 * `PLAN_CONFIG`, so this object cannot silently drift.
 *
 * They serve three roles:
 *  1. The seed inserted by the `PlanDefinitions` migration (imported there).
 *  2. The typed fallback in {@link PlanCatalogService} — so a fresh / un-migrated
 *     / empty-table environment never crashes billing enforcement.
 *  3. The reference the golden test compares against.
 *
 * LIVE edits happen in the DB (`plan_definitions`, via the admin backoffice), not
 * here. This constant stays the immutable factory baseline.
 */

import {
  ALL_PLAN_FEATURES,
  SHIPPED_PLAN_GRID,
  normalizePlanFeatures,
  type CurrencyPriceTable,
  type PlanFeatureKey,
  type ShippedPlanCode,
} from '@bellum/contracts'

/**
 * Recopie une ligne de la grille embarquée dans la forme attendue par le
 * catalogue serveur. `enrichment_credits` reste à 0 : depuis la monnaie unique,
 * la colonne ne décide plus rien (voir plus bas).
 */
function fromShippedGrid(code: ShippedPlanCode) {
  const row = SHIPPED_PLAN_GRID[code]
  return {
    label: row.label,
    price: row.priceCents,
    accounts_limit: row.creditsPerCycle,
    enrichment_credits: 0,
    seats: row.seats,
    extra_seat_price: row.extraSeatPriceCents,
    self_serve: row.selfServe,
    // Aucun prix étranger EMBARQUÉ : déclarer un montant en dollars est une
    // décision commerciale, pas une valeur par défaut. Tant que l'opérateur ne
    // l'a pas posée dans le backoffice, la vente se fait en euros et l'écran le
    // dit — ce qui vaut mieux qu'un prix converti qui aurait bougé entre
    // l'affichage et le prélèvement.
    prices: {} as CurrencyPriceTable,
  }
}

/**
 * LA GRILLE COMMERCIALE (Louis 26/07) — ce que chaque palier payant ouvre.
 *
 * Cumulative : un palier porte tout ce que porte le précédent, plus le sien. Une
 * grille non cumulative obligerait un client à DESCENDRE pour garder une
 * fonction, ce qui n'a pas de sens à la vente.
 *
 *  · Starter-Solo — le dossier complet et ses exports. C'est l'outil d'un
 *    commercial seul : il analyse, il produit, il emporte. Comptes, contacts,
 *    analyses et historique ne sont dans AUCUNE grille — c'est le produit, et
 *    son levier de volume est le nombre de crédits, pas une porte fermée.
 *  · Team — la prospection et le collectif : le copilote (la fonction qui
 *    appelle Claude à chaque clic, donc celle qui doit être portée par un palier
 *    qui la finance), Découvrir, la Veille, la base de connaissance et l'espace
 *    partagé. C'est la marche « je ne suis plus seul et je ne saisis plus mes
 *    cibles à la main ».
 *  · Growth — l'ESN outillée : les Besoins et le Vivier (le staffing bout en
 *    bout), le Pilotage d'équipe, et les branchements (CRM, assistant IA
 *    externe, API publique).
 *
 * Les paliers NON VENDUS (essai, beta, découverte) reçoivent TOUT : leur rôle
 * est de montrer le produit, et un essai qui cache le copilote ne convertit
 * personne. Ils sont bornés par leur quota et leur fenêtre, pas par leurs
 * fonctions.
 *
 * `normalizePlanFeatures` remet chaque liste dans l'ordre du contrat : une grille
 * lue en base et la même grille lue dans le code sortent alors IDENTIQUES, y
 * compris à la comparaison (le backoffice compare ce qu'il envoie à ce que le
 * serveur renvoie).
 */
const STARTER_FEATURES: readonly PlanFeatureKey[] = normalizePlanFeatures([
  'exports',
  // CRM + ATS natifs (Louis 16/08) : OUVERTS PAR DÉFAUT sur tous les paliers
  // vendus. Ce sont les objets de base du travail — un compte, un projet, une
  // activité, une tâche, un profil — et fermer la porte au palier d'entrée
  // reviendrait à vendre un CRM sans fiches. La clé existe pour que la grille
  // puisse se resserrer depuis le backoffice, sans redéploiement, le jour où le
  // positionnement l'exige.
  'crm_native',
  'ats_native',
  // #2957 (#2179.1) — ouvert partout par défaut : la porte existe pour que la
  // grille puisse se resserrer depuis le back-office, pas pour fermer /rfp à
  // qui s'en sert déjà (tranché sans Louis).
  'rfp',
])
const TEAM_FEATURES: readonly PlanFeatureKey[] = normalizePlanFeatures([
  ...STARTER_FEATURES,
  'chat_ai',
  'discover',
  'watchlist',
  'knowledge_base',
  'team_workspace',
  // Descendu de Growth (Louis 31/07) : un commercial à 259 € qui ne voit AUCUN
  // besoin de ses comptes n'a pas de raison de rester. Le Vivier (staffing bout
  // en bout) reste, lui, la marche Growth.
  'needs',
])
const GROWTH_FEATURES: readonly PlanFeatureKey[] = normalizePlanFeatures([
  ...TEAM_FEATURES,
  'talent_pool',
  'manager_cockpit',
  'crm_sync',
  'mcp_assistant',
  'public_api',
])

/** The billing plan keys (canonical). */
export type PlanKey = 'trial' | 'starter' | 'team' | 'growth' | 'beta' | 'decouverte'

/**
 * The canonical plan keys, in display order.
 *
 * The first five are FROZEN against the former `PLAN_CONFIG` const (see
 * `plan-catalog.golden.spec.ts`); a plan added afterwards is appended so that
 * freeze keeps holding on the legacy grid.
 */
export const PLAN_KEYS = ['trial', 'starter', 'team', 'growth', 'beta', 'decouverte'] as const

/**
 * A resolved plan definition as consumed by billing/enforcement code. `price` is
 * in cents (Stripe convention) — the name matches the former `PLAN_CONFIG[k].price`
 * so consumers read it unchanged. The DB column is `price_cents`; the catalog
 * service maps the two.
 */
export type PlanDefinition = {
  key: string
  /** Display name (backoffice + Stripe product label). */
  label: string
  /** Monthly price in cents (Stripe convention). */
  price: number
  /** Analyses/month cap (nominal — copied to `subscriptions.accounts_limit` on assign). */
  accounts_limit: number
  /** Enrichment credits granted per cycle. */
  enrichment_credits: number
  /** Workspace seats included in the plan (before the per-seat add-on). */
  seats: number
  /** Monthly price in cents of ONE seat beyond {@link seats}. Per-plan: a seat
   *  taps the plan's pooled credits, so it costs more on a richer tier
   *  (29 / 59 / 99 € — Louis 26/07). */
  extra_seat_price: number
  /** Whether a user can self-serve checkout this plan (trial/beta = operator-only). */
  self_serve: boolean
  /** Les features ouvertes par ce palier — la grille de gating par offre,
   *  éditable dans le backoffice comme les prix et les quotas. */
  features: PlanFeatureKey[]
  /**
   * Prix DÉCLARÉS dans les autres devises (l'euro reste {@link price}).
   *
   * Vide par défaut, et c'est un choix : Bellum ne convertit pas. Tant qu'une
   * devise n'a pas son prix posé dans le backoffice, elle n'est pas vendue et le
   * client est facturé en euros — l'écran le dit AVANT le paiement plutôt que de
   * le laisser découvrir sur son relevé.
   */
  prices: CurrencyPriceTable
  /** Backoffice sort order. */
  sort_order: number
}

/**
 * Legacy → canonical plan-key aliases. `pro`/`business`/`scale` were renamed by
 * earlier migrations (`pro`→`team`, `business`→`growth` — migration
 * 1785850000000; `scale`→`business`→`growth`). The subscription ROWS were
 * migrated, but a pre-rename Stripe subscription may still carry the old code in
 * its metadata — normalised before any catalog lookup so its webhook still
 * resolves a valid plan instead of silently no-oping. Byte-identical to the
 * former const that lived in `credits.service.ts`.
 */
export const LEGACY_PLAN_ALIASES: Readonly<Record<string, PlanKey>> = {
  pro: 'team',
  business: 'growth',
  scale: 'growth',
}

/**
 * Resolve a raw plan string (Stripe metadata / a DB row) to a canonical catalog
 * key, mapping legacy names; `undefined` when it matches nothing. Pure (no DB) —
 * the canonical key set is fixed (v1 does not create/delete plans), so this is
 * byte-identical to the former `normalizePlanKey` that read `value in PLAN_CONFIG`.
 */
export function normalizePlanKey(value: string | null | undefined): PlanKey | undefined {
  if (!value) return undefined
  if ((PLAN_KEYS as readonly string[]).includes(value)) return value as PlanKey
  return LEGACY_PLAN_ALIASES[value]
}

/**
 * MONNAIE UNIQUE (23/07) : chaque palier expose UN seul quota — `accounts_limit`
 * est le nombre de CRÉDITS du cycle, et un crédit vaut une action quelle qu'elle
 * soit (analyse, enrichissement, besoin). Les valeurs sont la SOMME des deux
 * anciens quotas, exactement comme la migration convertit les lignes existantes :
 * la bascule ne retire de capacité à personne. `enrichment_credits` reste à 0 —
 * la colonne survit le temps que toutes les surfaces basculent, elle ne décide
 * plus rien.
 *
 * Les CHIFFRES (label, prix, crédits, sièges, siège supplémentaire, self-serve)
 * ne sont plus écrits ici : ils viennent de `SHIPPED_PLAN_GRID`
 * (`@bellum/contracts`), la seule copie embarquée de la grille — l'écran
 * Facturation de l'app lit la même. Ce fichier ne garde que ce qui est propre au
 * catalogue serveur : l'ordre d'affichage et les fonctions ouvertes par palier.
 * Les valeurs restent celles de l'ancien `PLAN_CONFIG` (golden test enforces).
 */
export const PLAN_CATALOG_DEFAULTS: Readonly<Record<PlanKey, PlanDefinition>> = {
  // ÉTAT VERROUILLÉ, plus un essai (02/09/2026). Zéro crédit : le code de palier
  // survit pour les lignes qui le portent en base — dont celles qu'y rabat la
  // résiliation d'un abonnement Stripe — mais il n'ouvre plus rien. Le seul
  // essai du produit est la salle de démonstration publique.
  trial: {
    key: 'trial',
    ...fromShippedGrid('trial'),
    sort_order: 0,
    features: [...ALL_PLAN_FEATURES],
  },
  starter: {
    key: 'starter',
    ...fromShippedGrid('starter'),
    sort_order: 1,
    features: [...STARTER_FEATURES],
  },
  team: {
    key: 'team',
    ...fromShippedGrid('team'),
    sort_order: 2,
    // ENTREPRISE-TOUT #4381 — « Entreprise (sur devis) » = TOUTES les fonctions
    // (décision Louis 20/10) : le back-office y range les espaces à qui l'on
    // veut tout ouvrir. `TEAM_FEATURES` reste le socle dont Growth hérite.
    features: [...ALL_PLAN_FEATURES],
  },
  growth: {
    key: 'growth',
    ...fromShippedGrid('growth'),
    sort_order: 3,
    features: [...GROWTH_FEATURES],
  },
  // Onboarding plan RESERVED for beta design-partners (59€/mo). Assigned by hand
  // from the admin backoffice — NOT offered in the public checkout grid.
  beta: {
    key: 'beta',
    ...fromShippedGrid('beta'),
    sort_order: 4,
    features: [...ALL_PLAN_FEATURES],
  },
  // Ce que reçoit un compte créé en self-service : un palier NOMMÉ, et zéro
  // crédit (02/09/2026, Louis).
  //
  // Il portait 48 crédits — six dossiers réels — au nom de la découverte (Théo
  // 21/07 : « se créer un compte rapidos et avoir qu'une recherche possible »).
  // Mais l'écran d'onboarding annonce « plus d'entrée gratuite » depuis le
  // 24/07 : deux discours coexistaient, et c'est le silencieux qui gagnait. Le
  // produit se voit désormais dans la salle de démonstration, sans compte ; un
  // compte neuf arrive sur l'écran de choix de licence.
  //
  // La clé RESTE — un code de palier ne disparaît jamais (GA-08), des lignes en
  // base le portent, et l'écran de facturation doit pouvoir nommer un compte
  // sans licence plutôt que de le rabattre sur « Starter ».
  decouverte: {
    key: 'decouverte',
    ...fromShippedGrid('decouverte'),
    sort_order: 0,
    features: [...ALL_PLAN_FEATURES],
  },
}

/** A fresh clone of the defaults keyed by string (safe to mutate as a cache). */
export function cloneDefaultCatalog(): Record<string, PlanDefinition> {
  const out: Record<string, PlanDefinition> = {}
  // Copie PROFONDE de `features` : la valeur retournée est un cache mutable, et
  // un tableau partagé laisserait l'édition d'un plan modifier le défaut figé.
  for (const key of PLAN_KEYS)
    out[key] = { ...PLAN_CATALOG_DEFAULTS[key], features: [...PLAN_CATALOG_DEFAULTS[key].features] }
  return out
}

/**
 * L'ÉCHELLE COMMERCIALE — les paliers qu'on vend, du moins cher au plus cher.
 *
 * Elle ne se devine pas depuis `sort_order` seul : `decouverte` porte l'ordre 0
 * ET toutes les fonctions (c'est un palier de démonstration, pas une marche), et
 * l'inclure ferait tout ouvrir dès Starter. Les paliers hors échelle — essai,
 * beta, découverte — reçoivent déjà TOUT et n'ont donc rien à hériter.
 */
export const PLAN_LADDER: readonly PlanKey[] = ['starter', 'team', 'growth']

/**
 * Rend la grille CUMULATIVE : chaque palier de l'échelle porte au moins tout ce
 * que porte celui d'en dessous.
 *
 * C'est le correctif PLAN-01 de l'audit terrain du 17/08, et il est appliqué à
 * la LECTURE plutôt qu'en base pour une raison précise. La grille du code est
 * cumulative depuis toujours ; ce qui ne l'était plus, c'est la table
 * `plan_definitions`, écrite une fois puis figée pendant que de nouvelles clés
 * apparaissaient. Un client Growth voyait donc des écrans verrouillés qu'un
 * ancien plan Pro ouvrait — un palier supérieur MOINS permissif, ce qui détruit
 * la confiance tarifaire et, en démonstration, bloque net.
 *
 * Réparer les lignes par migration ne suffit pas : la table reste éditable sans
 * revue depuis le backoffice, et la prochaine clé ajoutée reproduirait la même
 * inversion en silence. Ici, l'inversion devient IMPOSSIBLE — pas seulement
 * corrigée une fois.
 *
 * Ce que la fonction ne fait PAS : ajouter une fonction que personne n'a
 * accordée. Elle ne propage que ce qu'un palier INFÉRIEUR ouvre déjà, donc elle
 * ne peut jamais élargir la grille au-delà de ce que l'opérateur a décidé.
 */
export function applyPlanFeatureMonotonicity(catalog: Record<string, PlanDefinition>): Record<string, PlanDefinition> {
  const inherited = new Set<PlanFeatureKey>()
  for (const key of PLAN_LADDER) {
    const plan = catalog[key]
    if (!plan) continue
    for (const feature of plan.features) inherited.add(feature)
    catalog[key] = { ...plan, features: normalizePlanFeatures([...inherited]) }
  }
  return catalog
}
