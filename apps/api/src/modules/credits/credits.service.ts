import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import Stripe from 'stripe'
import {
  ACTION_ESTIMATED_COST_USD,
  ALL_PLAN_FEATURES,
  ANALYSIS_DEPTH_PRESETS,
  DEFAULT_ANALYSIS_DEPTH,
  ANALYSIS_SCOPE_CREDIT_COST,
  type AnalysisRunDepth,
  type AnalysisScopeMode,
  buildTriggerEvent,
  triggerPeriodQualifier,
  CREDIT_WEIGHTS,
  type BillingCurrency,
  isBillingCurrency,
  type PlanFeatureKey,
  priceInCurrency,
  resolveBillingCurrency,
} from '@bellum/contracts'
import { IsNull, Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import {
  CreditLedgerEntity,
  type CreditLedgerKind,
  type CreditLedgerResource,
} from '../../database/entities/credit-ledger.entity'
import { CreditReservationEntity } from '../../database/entities/credit-reservation.entity'
import { StripeEventEntity } from '../../database/entities/stripe-event.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { StripeService } from '../stripe/stripe.service'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { NotificationsService } from '../notifications/notifications.service'
import { TriggerRegistryService } from '../trigger-registry/trigger-registry.service'
import { CheckoutDto } from './dto/checkout.dto'
import { liveReservedTotal, spendableCredits } from './credit-reservation.rules'
import { PlanCatalogService } from './plan-catalog.service'
import { normalizePlanKey } from './plan-catalog.defaults'
import { BELLUM_LINE_METADATA_KEY, cycleUnitAmountCents, SEAT_LINE_NAME } from './pricing'
import { ProductAnalyticsService } from '../analytics/product-analytics.service'
import { Correlated } from '../../correlation-id/background-correlation'
import { WORKSPACE_BUDGET_GATE, type BudgetGateChecker } from '../workspace-budget/workspace-budget-tokens'
import { SOFT_BRAKE_MESSAGE } from './soft-brake'
import { WINDOWED_PLANS, isTrialExpired } from './trial-window'

/** Une facture Stripe aplatie pour l'affichage — pas de champ brut Stripe. */
type BillingInvoice = {
  id: string
  number: string | null
  /** Montant en centimes (convention Stripe). */
  amount: number
  currency: string
  /** `paid` | `open` | `draft` | `void` | `uncollectible` (Stripe). */
  status: string
  /** Timestamp de création (secondes UNIX, convention Stripe). */
  created: number
  hosted_invoice_url: string | null
  invoice_pdf: string | null
}

/** Un point de consommation journalier — 1 analyse (account) = 1 crédit. */
type UsageDay = {
  /** Jour au format ISO `YYYY-MM-DD` (UTC). */
  day: string
  value: number
}

const USAGE_WINDOW_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Plan catalog moved to a DB-backed, operator-editable table (`plan_definitions`).
 * The pricing + quota values are now read through {@link PlanCatalogService}; the
 * canonical keys, legacy aliases, {@link normalizePlanKey} and the byte-identical
 * factory defaults live in `plan-catalog.defaults.ts`. No enforcement math changed
 * — only the data source (a const → a cached DB read with a defaults fallback).
 */

/**
 * Shipped DEFAULT price (cents) of one seat beyond a plan's included allowance.
 * The LIVE price is per-plan and operator-editable — read it from the catalog
 * (`PlanDefinition.extra_seat_price`), not from here. This constant remains the
 * factory baseline the catalog defaults and the column default are built from.
 */
export const EXTRA_SEAT_PRICE_CENTS = 2900

/** Upper bound on purchasable extra seats (guards the client-supplied count). */
export const MAX_EXTRA_SEATS = 47

/** Enrichment types the credit grid can price. Only `contact` exists today.
 *  Local (not exported): callers pass the `'contact'` literal, they don't name it. */
type EnrichmentType = 'contact'

/**
 * Credit-cost grid per action type (roadmap item — make the per-action credit
 * cost PARAMETRABLE instead of the hard-coded `1`). It exists so a heavier
 * analysis scope (e.g. a whole-group / international run that fans out several
 * sub-analyses) CAN be billed more without re-touching the billing hot path,
 * once the price is decided.
 *
 * ⚠️ TODAY EVERY ACTION COSTS 1 → production behaviour is UNCHANGED. The
 * "expensive scope" idea (e.g. groupe / international = 2 credits) is a
 * HYPOTHÈSE À VALIDER (Louis/Théo, see agent_docs/billing/pricing-proposal.md),
 * left at 1 until the tariff is decided. The mechanism (resolvers below +
 * cost-aware {@link CreditsService.consumeAnalysisSlot}) is wired and tested so
 * flipping a value here is all it takes to activate a costlier scope.
 */
export const CREDIT_COSTS = {
  analysis: {
    /**
     * Cost in analysis slots per perimeter (`scope_mode`). All 1 today.
     *
     * La grille vit dans `@bellum/contracts` (`ANALYSIS_SCOPE_CREDIT_COST`) parce
     * que l'écran de confirmation de périmètre ANNONCE ce coût avant le débit :
     * une grille dupliquée côté web finirait par annoncer un chiffre différent de
     * celui débité ici. Un périmètre plus cher (fan-out multi-entités) se change
     * à un seul endroit.
     */
    byScope: ANALYSIS_SCOPE_CREDIT_COST satisfies Record<AnalysisScopeMode, number>,
  },
  enrichment: {
    /** Coût d'un enrichissement de contact — l'unité de référence de la grille. */
    contact: CREDIT_WEIGHTS.contact_enrichment,
  },
} as const satisfies {
  analysis: { byScope: Record<AnalysisScopeMode, number> }
  enrichment: Record<EnrichmentType, number>
}

/** Default cost when a scope/type is unknown or unset — keeps prod at 1.
 *  Local (internal knobs); the public seam is {@link CREDIT_COSTS} + the resolvers. */
// Le repli quand un périmètre est inconnu. Il vaut le prix PLEIN d'une analyse,
// pas 1 : un périmètre non reconnu ne doit pas offrir un dossier complet à un
// huitième de son coût. Sous-facturer par défaut est la seule erreur que la
// grille ne rattrape jamais.
const DEFAULT_ANALYSIS_COST = CREDIT_WEIGHTS.account_analysis
const DEFAULT_ENRICHMENT_COST = CREDIT_WEIGHTS.contact_enrichment

/**
 * Part du quota du cycle CONSOMMÉE à partir de laquelle on prévient, quand
 * l'environnement ne dit rien (transparence billing, Théo beta 15/08 : prévenir
 * AVANT l'épuisement ; D5, Louis 28/08 : « livrer l'annonce AVANT le mur »).
 *
 * ⚠ C'est le SEUL endroit du dépôt où ce chiffre existe (GA-26). Il est réglable
 * par `CREDIT_LOW_THRESHOLD_PERCENT` et le web ne le recalcule pas : il lit
 * `credits_low` dans la réponse de `GET /credits`, qui sort de la MÊME fonction
 * {@link isCreditLow} que la notification.
 */
export const DEFAULT_CREDIT_LOW_THRESHOLD_PERCENT = 80

/**
 * « Bientôt à court » = la part CONSOMMÉE du cycle a atteint le seuil, donc le
 * restant est tombé à (100 − seuil) % ou moins.
 *
 * La borne est INCLUSIVE (D5) : à 80 % pile, l'annonce est due. L'écriture
 * précédente (`restant >= quota × 0,2` ⇒ silence) laissait passer le pile-poil
 * sans rien dire — et c'est exactement le cas qu'un seuil rond fabrique.
 *
 * Une capacité nulle ou inconnue ne déclenche RIEN : « non mesuré » n'est pas
 * « épuisé ». Pure et exportée pour que le test puisse la lire directement.
 */
export function isCreditLow(remaining: number, capacity: number, thresholdPercent: number): boolean {
  if (capacity <= 0) return false
  // Comparé en POURCENTS ENTIERS, jamais en fractions : `capacity * (1 - 80/100)`
  // vaut 19,999999999999996 pour une capacité de 100, si bien que « 20 restants
  // sur 100 » — le pile-poil 80 % que la décision vise — tombait juste au-dessus
  // de sa propre borne et ne déclenchait rien.
  return remaining * 100 <= capacity * (100 - thresholdPercent)
}

/** Le seuil lu dans l'environnement, ramené à un entier de 1 à 100. Une valeur
 *  absente, vide ou illisible retombe sur le défaut — un avertissement mal réglé
 *  vaut mieux qu'une API qui refuse de démarrer. */
function normalizeThresholdPercent(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) return DEFAULT_CREDIT_LOW_THRESHOLD_PERCENT
  return Math.floor(parsed)
}

/** Fallback anti-spam window when a row has no `period_start` (legacy rows) —
 *  one notification per rolling month, mirroring the quota cycle length. */
const CREDIT_LOW_FALLBACK_WINDOW_MS = 30 * MS_PER_DAY

/** Clamp a resolved cost to a safe positive integer (defends against a bad grid
 *  value ever reaching the SQL — the cost is interpolated as an integer). */
/**
 * Crédits RESTANTS sur le cycle — la seule question que pose la monnaie unique.
 *
 * Le pool est `accounts_limit` (quota du plan) + `topup_analyses` (recharge
 * ponctuelle, expirant au renouvellement) moins `accounts_used`. Analyses ET
 * enrichissements y puisent : un crédit vaut une action, quelle qu'elle soit.
 * Jamais négatif — un dépassement (débit concurrent, ajustement opérateur) se
 * lit « 0 », pas « -3 ».
 */
function creditsRemaining(row: CreditPoolRow | null): number {
  return Math.max(0, creditCapacity(row) - (row?.accounts_used ?? 0))
}

/** Ce qu'une ligne d'abonnement porte du POOL de crédits — le seul sous-ensemble
 *  dont dépendent la capacité et le solde. */
type CreditPoolRow = {
  accounts_limit?: number | null
  accounts_used?: number | null
  topup_analyses?: number | null
  rollover_credits?: number | null
  rollover_expires_at?: Date | string | null
}

/**
 * La capacité DÉPENSABLE du cycle : quota du plan + recharge ponctuelle + report
 * encore valide.
 *
 * Elle vit ici et nulle part ailleurs. `maybeNotifyCreditLow` la recalculait
 * SANS le report tout en comparant à un solde qui, lui, le comptait : un client
 * qui venait de reporter la moitié de sa réserve s'entendait dire « bientôt
 * épuisé ». Deux chemins qui refont la même dérivation divergent toujours.
 *
 * ⚠️ EXPORTÉE depuis l'issue 1656, et pour cette raison exactement : le taux de
 * dépassement par offre a besoin du MÊME plafond que celui qui refuse une
 * analyse. Le recopier là-bas aurait donné deux définitions de « son plafond »,
 * dont l'une aurait oublié le report — la faute déjà payée par
 * `maybeNotifyCreditLow`. Elle reste la seule définition ; il y a juste un
 * lecteur de plus.
 */
export function creditCapacity(row: CreditPoolRow | null): number {
  return (row?.accounts_limit ?? 0) + (row?.topup_analyses ?? 0) + validRollover(row)
}

/**
 * Le report ENCORE VALIDE, en crédits.
 *
 * Une réserve expirée vaut zéro et non « bientôt zéro » : l'afficher jusqu'au
 * dernier jour puis la voir disparaître d'un coup est déjà désagréable, la
 * compter après son échéance serait un mensonge. Une date illisible est traitée
 * comme une absence de report — jamais comme un report éternel.
 */
function validRollover(
  row: { rollover_credits?: number | null; rollover_expires_at?: Date | string | null } | null,
): number {
  const amount = row?.rollover_credits ?? 0
  if (amount <= 0) return 0
  const expiresAt = row?.rollover_expires_at
  if (!expiresAt) return 0
  const at = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt)
  return Number.isFinite(at) && at > Date.now() ? amount : 0
}

function normalizeCost(cost: number): number {
  return Number.isFinite(cost) ? Math.max(1, Math.floor(cost)) : 1
}

/** How many analysis slots one run costs, from {@link CREDIT_COSTS}. Unknown /
 *  unset scope → {@link DEFAULT_ANALYSIS_COST}. Pure + exported for tests.
 *  `grid` defaults to the live grid; it's an override seam so a test can prove a
 *  costlier scope is honoured without mutating the frozen production grid.
 *
 *  #2163.76 — `excludedCount` mirrors `estimateAnalysisCredits` (the contract
 *  function the confirmation screen reads): one credit less per excluded
 *  entity, floored at 1. Kept in lockstep with the client estimate on
 *  purpose — a scope this function debits and a screen that announced a
 *  different number is exactly the defect `LaunchCostNote` was built to
 *  prevent. Absent/0 ⇒ byte-identical to before this parameter existed. */
export function resolveAnalysisCost(
  scopeMode?: AnalysisScopeMode | null,
  excludedCount = 0,
  grid: Record<string, number> = CREDIT_COSTS.analysis.byScope,
  /** #3288 — palier de profondeur ; Louis 10/10 : absent ⇒ « Approfondie » (`DEFAULT_ANALYSIS_DEPTH`). */
  depth?: AnalysisRunDepth | null,
): number {
  const scoped = normalizeCost((scopeMode ? grid[scopeMode] : undefined) ?? DEFAULT_ANALYSIS_COST)
  const base = Math.max(1, Math.round(scoped * ANALYSIS_DEPTH_PRESETS[depth ?? DEFAULT_ANALYSIS_DEPTH].costMultiplier))
  const excluded = Number.isFinite(excludedCount) ? Math.max(0, Math.floor(excludedCount)) : 0
  return Math.max(1, base - excluded)
}

/** How many enrichment credits one enrichment costs, from {@link CREDIT_COSTS}.
 *  Only `contact` exists today (=1). Pure + exported for tests. */
export function resolveEnrichmentCost(type: EnrichmentType = 'contact'): number {
  const grid = CREDIT_COSTS.enrichment as Record<string, number>
  return normalizeCost(grid[type] ?? DEFAULT_ENRICHMENT_COST)
}

/**
 * `WINDOWED_PLANS` et `isTrialExpired` vivent dans `./trial-window.ts` depuis le
 * 28/10/2026 : du pur calcul, lisible sans importer ce service (garde GA-07).
 * Ce fichier reste celui qui les PUBLIE — rien ne change pour ses appelants.
 */
export { WINDOWED_PLANS, isTrialExpired }

const WINDOWED_PLANS_SQL = WINDOWED_PLANS.map(p => `'${p}'`).join(', ')

/** SQL predicate — true when a row is spendable w.r.t. the trial window: paid
 *  plans always pass; a windowed row passes only while `trial_end` is unset or in
 *  the future. Folded into the atomic consume guards so an expired trial can't
 *  claim an analysis or enrichment. */
const TRIAL_ACTIVE_SQL = `(plan NOT IN (${WINDOWED_PLANS_SQL}) OR trial_end IS NULL OR trial_end > now())`

/**
 * La capacité dépensable d'un cycle, en SQL.
 *
 * Quota du palier + recharge ponctuelle + report du cycle précédent TANT QU'IL
 * EST VALIDE. Le report se comporte donc exactement comme une recharge : aucune
 * ligne de consommation n'a besoin de savoir dans quel ordre puiser, et rien ne
 * peut devenir négatif. Passée l'échéance, le terme retombe à zéro de lui-même —
 * il n'y a rien à purger, donc rien qui puisse être oublié.
 */
const SPENDABLE_SQL = `accounts_limit + topup_analyses + CASE WHEN rollover_expires_at > now() THEN rollover_credits ELSE 0 END`

/**
 * Prochain renouvellement du quota mensuel — la question « quand est-ce que mes
 * analyses repartent à zéro ? », que l'écran Facturation ne savait pas répondre
 * (rapport TF1 P0-07 : la date manquait au payload, et rien ne devait être
 * inventé). Miroir EXACT de la borne du cron de reset : `period_start` + 1 mois.
 *
 * `null` pour un palier à fenêtre (essai / découverte) : ceux-là expirent — c'est
 * `trial_end` qui les décrit — et pour une ligne sans `period_start` (legacy),
 * où l'on préfère ne rien afficher qu'une date fausse.
 */
export function nextResetFor(row: { plan?: string | null; period_start?: Date | string | null } | null): string | null {
  if (!row?.period_start) return null
  if ((WINDOWED_PLANS as readonly string[]).includes(row.plan ?? '')) return null
  const start = new Date(row.period_start)
  if (Number.isNaN(start.getTime())) return null
  const next = new Date(start)
  next.setMonth(next.getMonth() + 1)
  return next.toISOString()
}

/** La date de renouvellement, écrite en clair pour une notification stockée
 *  (« 15 septembre 2026 »). Le corps d'une notification est du texte figé en
 *  base : il n'y a pas de traduction possible à la lecture, on écrit donc la
 *  langue du produit. Une date illisible ne s'écrit pas du tout. */
function formatResetDate(iso: string): string {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return iso
  return at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** #3400 — la lecture d'opérateur : pourquoi (ou non) un enrichissement serait refusé sur ce pool. */
export type EnrichmentDiagnostic = {
  cause: 'none' | 'no_subscription' | 'trial_ended' | 'pool_empty' | 'workspace_budget' | 'tool_daily_cap'
  plan: string | null
  trialEnd: string | null
  trialExpired: boolean
  /** Le solde du pool — celui que la modale annonce. */
  creditsRemaining: number
  creditsReserved: number
  /** La porte amont (`hasEnrichmentCredit`) laisserait-elle passer ? */
  preCheckAllows: boolean
  /** Le message NOMMÉ de la porte de budget d'espace, `null` si elle laisse passer. */
  workspaceGate: string | null
  isDemo: boolean
}

/** #3400 — pourquoi un enrichissement est refusé alors que le solde n'est pas vide. */
type EnrichmentRefusalKind = 'trial_ended' | 'unavailable'
type EnrichmentRefusal = { kind: EnrichmentRefusalKind; message: string }

/** A one-shot credit top-up pack (Théo §14 — recharge hors abonnement). */
type TopupPack = {
  /** Stable id carried in Stripe metadata — never change once sold. */
  id: string
  /** UI label, e.g. « +10 analyses ». */
  label: string
  /** Which counter the pack grants. */
  resource: 'analysis' | 'enrichment'
  /** How many credits the pack adds to the pool. */
  amount: number
  /** One-shot price in cents (server-authoritative, never from the client). */
  priceCents: number
}

/**
 * Catalog of one-shot credit top-ups (Théo §14 : « chaque analyse coûte des
 * APIs » — pas d'illimité ; une recharge ponctuelle complète le quota du plan
 * sans changer d'abonnement).
 *
 * Prix AUTORITATIFS côté serveur (jamais envoyés par le client). Tarif overage
 * (au-dessus du coût unitaire réel + du prix par unité en abonnement) et
 * DÉGRESSIF au volume — plus le pack est gros, moins l'unité est chère :
 *   - analyse : coût réel ~0,65€/run → packs 3,80 / 2,95 / 2,38 €/unité
 *   - enrichissement : coût réel ~0,08€/unité → packs 0,36 / 0,29 / 0,23 €/unité
 * `id` est stable (porté dans les metadata Stripe) — ne jamais le changer une
 * fois vendu. Mettre à `[]` désactive la feature (écran « bientôt disponible »).
 */
export const TOPUP_PACKS: readonly TopupPack[] = [
  { id: 'analysis_5', label: '+5 crédits', resource: 'analysis', amount: 5, priceCents: 1900 },
  { id: 'analysis_20', label: '+20 crédits', resource: 'analysis', amount: 20, priceCents: 5900 },
  { id: 'analysis_50', label: '+50 crédits', resource: 'analysis', amount: 50, priceCents: 11900 },
  // Les anciens packs « enrichissement » (0,36 €/unité) sont RETIRÉS de la vente :
  // avec une monnaie unique, ils achetaient exactement les mêmes crédits que les
  // packs ci-dessus à un huitième du prix — un client averti n'aurait plus jamais
  // acheté qu'eux, y compris pour lancer des analyses. Leurs ids restent connus
  // du serveur (`TOPUP_PACKS_LEGACY`) pour qu'un paiement déjà engagé soit
  // honoré ; ils ne sont simplement plus proposés.
]

/** Packs retirés de la vente mais encore honorables : un checkout ouvert avant
 *  le retrait doit créditer ce qui a été payé. Jamais listés à l'écran. */
export const TOPUP_PACKS_LEGACY: readonly TopupPack[] = [
  { id: 'enrich_25', label: '+25 crédits', resource: 'enrichment', amount: 25, priceCents: 900 },
  { id: 'enrich_100', label: '+100 crédits', resource: 'enrichment', amount: 100, priceCents: 2900 },
  { id: 'enrich_300', label: '+300 crédits', resource: 'enrichment', amount: 300, priceCents: 6900 },
]

@Injectable()
export class CreditsService {
  private readonly logger = new Logger(CreditsService.name)
  private readonly frontendUrl: string
  /** Le seuil d'annonce « bientôt à court de crédits », en % CONSOMMÉ du cycle
   *  (D5). Lu une seule fois, ici — voir {@link DEFAULT_CREDIT_LOW_THRESHOLD_PERCENT}. */
  private readonly creditLowThresholdPercent: number

  constructor(
    config: ConfigService,
    private readonly stripeService: StripeService,
    @InjectRepository(SubscriptionEntity)
    private readonly credits: Repository<SubscriptionEntity>,
    @InjectRepository(CreditLedgerEntity)
    private readonly ledger: Repository<CreditLedgerEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(StripeEventEntity)
    private readonly stripeEvents: Repository<StripeEventEntity>,
    // Le registre de ce qui est PROMIS mais pas encore dépensé. Requis, pas
    // `@Optional()` : un solde qui oublierait les crédits en vol se remettrait à
    // les promettre deux fois, en silence — exactement le défaut qu'on répare.
    // Le rendre obligatoire fait échouer le DÉMARRAGE si le câblage disparaît,
    // plutôt que de rendre un chiffre optimiste (GA-20).
    @InjectRepository(CreditReservationEntity)
    private readonly reservations: Repository<CreditReservationEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // DB-backed plan catalog (replaced the hardcoded PLAN_CONFIG const). Required
    // — enforcement reads plan templates through it (with a defaults fallback).
    private readonly planCatalog: PlanCatalogService,
    // Product analytics — best-effort, `@Optional()` so the direct-`new` spec
    // (`makeService()`) needs no analytics stub.
    @Optional() private readonly analytics?: ProductAnalyticsService,
    // Cron-tick lock — `@Optional()` for the same reason; without it the cron
    // runs unlocked (single-instance behaviour).
    @Optional() private readonly locks?: SingletonLockService,
    // In-app `credit_low` alert on debit (transparence billing) — best-effort +
    // `@Optional()` so direct-`new` specs need no stub and a missing wiring can
    // never break the billing hot path.
    @Optional() private readonly notifications?: NotificationsService,
    // La porte de coût par espace (#2975) — appelée AVANT de débiter, avec le
    // coût ESTIMÉ de l'action. Par JETON (`workspace-budget-tokens.ts`), pas
    // par service direct : GA-07 compte un import service→service, le jeton
    // déplace la composition dans `WorkspaceBudgetModule`. `@Optional()`
    // comme les trois ci-dessus : aucun spec direct-`new` n'a besoin de le
    // fournir, et une porte absente se comporte comme un espace sans aucun
    // levier réglé (no-op complet, jamais un blocage par défaut).
    @Optional() @Inject(WORKSPACE_BUDGET_GATE) private readonly budgetGate?: BudgetGateChecker,
    // #2875/#2402.1 (vague F/G 27/09) — le registre canonique des déclencheurs
    // commerciaux : `maybeNotifyCreditLow` y persiste désormais AUSSI
    // `credit_low`, best-effort, à côté de la notification in-app (jamais à sa
    // place). EN DERNIER et `@Optional()`, comme les précédents : un paramètre
    // inséré au milieu décalerait en silence tous les appels positionnels des
    // specs existantes.
    @Optional() private readonly triggers?: TriggerRegistryService,
  ) {
    this.frontendUrl = config.get<string>('frontendUrl', 'http://localhost:5173')
    this.creditLowThresholdPercent = normalizeThresholdPercent(config.get('creditLowThresholdPercent'))
  }

  /**
   * Resolve the *billing subject* for `userId`: the OWNER of their active
   * workspace. A workspace's plan + quota live on its owner's `subscriptions`
   * row (the light multi-user model — no per-member subscription rows), so a
   * member's analyses and enrichments draw from — and are capped by — the
   * owner's shared pool, and the member is bound by the owner's plan.
   *
   * Solo user → they own their workspace → `ownerUserId === userId` and
   * `isOwner` is true, so quota/plan resolution is byte-for-byte unchanged.
   *
   * `isDemo` mirrors the workspace's `is_demo` flag (demo mode C1): a demo
   * workspace's consumes/refunds are short-circuited so demos never debit —
   * see {@link consumeAnalysisSlot} / {@link consumeEnrichmentCredit}.
   *
   * Fails soft: if no workspace resolves (should not happen post-backfill) we
   * bill the caller themself so billing never hard-errors on the hot path.
   */
  private async resolveBillingSubscription(
    userId: string,
  ): Promise<{ ownerUserId: string; workspaceId: string | null; isOwner: boolean; isDemo: boolean }> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
      const ownerUserId = workspace?.owner_user_id ?? userId
      return { ownerUserId, workspaceId, isOwner: ownerUserId === userId, isDemo: workspace?.is_demo === true }
    } catch {
      return { ownerUserId: userId, workspaceId: null, isOwner: true, isDemo: false }
    }
  }

  /**
   * Append one immutable movement to the credit ledger. BEST-EFFORT: a ledger
   * failure is logged and swallowed so it can never block the billing hot path
   * (a consume/refund that succeeded on `subscriptions` must still return ok
   * even if the audit write hiccups). The running balance stays authoritative;
   * the ledger is the history alongside it.
   */
  /**
   * Audit M1 — exécute `work` en exclusion mutuelle sur `key` (verrou consultatif
   * Postgres, levé au COMMIT). Les sections « lire le registre, puis écrire »
   * (remboursement, recharge, idempotence du webhook) n'étaient protégées par
   * rien : deux appels simultanés lisaient le même état et agissaient tous les
   * deux. Même procédé que `refresh-refund.service.ts`.
   */
  private async withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    return this.credits.manager.transaction(async tx => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key])
      return work()
    })
  }

  private async recordLedger(entry: {
    ownerUserId: string
    workspaceId?: string | null
    actorUserId?: string | null
    kind: CreditLedgerKind
    resource: CreditLedgerResource
    delta: number
    reason?: string | null
    accountId?: string | null
    /** Audit M1 : relève l'échec d'écriture au lieu de l'avaler (recharges). */
    strict?: boolean
  }): Promise<string | null> {
    try {
      const inserted = await this.ledger.insert({
        owner_user_id: entry.ownerUserId,
        workspace_id: entry.workspaceId ?? null,
        actor_user_id: entry.actorUserId ?? null,
        kind: entry.kind,
        resource: entry.resource,
        delta: entry.delta,
        reason: entry.reason ?? null,
        account_id: entry.accountId ?? null,
      })
      // L'id de la ligne écrite — c'est lui qui permet de rattacher APRÈS COUP
      // un débit au compte qu'il a payé (voir {@link attachAnalysisDebit}). Une
      // implémentation qui ne le rend pas (doublure de test) vaut `null` : le
      // rattachement se saute, il ne casse pas.
      const id = inserted?.identifiers?.[0]?.['id']
      return typeof id === 'string' ? id : null
    } catch (err) {
      this.logger.error(`Failed to write credit ledger entry (${entry.kind})`, {
        error: err,
        tags: { 'credits.ledger': 'write_failed', 'credits.kind': entry.kind },
      })
      if (entry.strict) throw err
      return null
    }
  }

  /**
   * Rattache un débit d'analyse au compte qu'il a payé.
   *
   * **Pourquoi après coup.** Le créneau est réservé AVANT que le compte
   * n'existe — c'est voulu : on ne crée pas de ligne pour un quota qu'on va
   * refuser. La ligne de registre partait donc avec `account_id = NULL`, et
   * TOUS les remboursements retombaient sur le montant par défaut sans jamais
   * pouvoir vérifier ce qui avait réellement été débité. C'est ce trou qui
   * rendait le remboursement ni exact ni idempotent : deux chemins pouvaient
   * rendre 8 crédits chacun pour un seul débit, et un run annulé ne pouvait pas
   * savoir combien lui rendre.
   *
   * Best-effort, comme toute écriture de registre : un rattachement manqué
   * ramène au comportement précédent (montant par défaut), il ne fait perdre
   * ni crédit ni analyse.
   */
  async attachAnalysisDebit(ledgerId: string | null | undefined, accountId: string): Promise<void> {
    if (!ledgerId) return
    try {
      await this.ledger.update({ id: ledgerId }, { account_id: accountId })
    } catch (err) {
      this.logger.warn('Failed to attach the analysis debit to its account', {
        error: err,
        contexts: { refund: { ledgerId, accountId } },
      })
    }
  }

  /**
   * `true` quand le dernier débit d'analyse de ce compte n'a PAS été remboursé.
   *
   * Lu par la reprise d'un run : reprendre est gratuit tant que le run en cours
   * est payé, et redevient payant si son crédit a déjà été rendu (annulation,
   * échec). C'est l'invariant qui tient la caisse : **un dossier livré = un
   * débit**, jamais zéro (annuler puis reprendre gratuitement) ni deux.
   *
   * Sans aucune ligne de débit au registre — run lancé par l'opérateur, run
   * antérieur au rattachement, écriture de registre ratée — on répond `true` :
   * dans le doute on ne fait PAS payer une deuxième fois.
   */
  async hasOutstandingAnalysisDebit(userId: string, accountId: string): Promise<boolean> {
    const { ownerUserId } = await this.resolveBillingSubscription(userId)
    const pending = await this.pendingAnalysisRefund(ownerUserId, accountId)
    return pending === null || pending > 0
  }

  /**
   * Recent credit movements for the caller's workspace pool (owner-scoped, newest
   * first). Read-only audit view — powers the billing history panel and lets a
   * disputed consume/refund be traced. Capped so the endpoint stays bounded.
   */
  async getLedger(userId: string, limit = 100): Promise<{ entries: CreditLedgerEntity[] }> {
    const { ownerUserId } = await this.resolveBillingSubscription(userId)
    const entries = await this.ledger.find({
      where: { owner_user_id: ownerUserId },
      order: { created_at: 'DESC' },
      take: Math.min(Math.max(limit, 1), 500),
    })
    return { entries }
  }

  async createCheckoutSession(userId: string, email: string, dto: CheckoutDto): Promise<{ url: string }> {
    await this.assertNotManuallyBilled(userId)
    const planConfig = await this.planCatalog.getOrDefault(dto.plan)
    const annual = dto.annual === true

    // Devise : le VERROU d'abord (Stripe refuse de changer la devise d'un
    // abonnement existant), puis le choix du client, puis son pays de
    // FACTURATION — jamais `workspace.market`, qui décrit le marché prospecté.
    // Le prix est celui DÉCLARÉ dans cette devise ; sans prix déclaré, la vente
    // se fait en euros (aucune conversion n'est calculée nulle part).
    const billing = await this.resolveCheckoutCurrency(userId, dto.currency ?? null)
    const priced = priceInCurrency({
      eur: { priceCents: planConfig.price, extraSeatPriceCents: planConfig.extra_seat_price },
      table: planConfig.prices,
      currency: billing.currency,
    })
    // Server-authoritative pricing: the client only picks the cycle, never the
    // amount. The cycle math lives in `cycleUnitAmountCents` so that re-pricing
    // an EXISTING subscription (PlanPriceSyncService) lands on the exact same
    // figure as this checkout.
    const interval = annual ? 'year' : 'month'
    const unitAmount = cycleUnitAmountCents(priced.price.priceCents, interval)

    // Extra seats beyond the plan's INCLUDED allowance (varies per tier —
    // Starter-Solo 1 / Team 3 / Growth 8), billed +29€/mo each
    // (server-authoritative price; the client only picks the count, capped).
    // Annual mirrors the plan's −20 %×12 whole-euro rounding.
    const extraSeats = Math.max(0, Math.min(dto.extra_seats ?? 0, MAX_EXTRA_SEATS))
    const seatUnit = cycleUnitAmountCents(priced.price.extraSeatPriceCents, interval)

    const session = await this.stripeService.createSubscriptionCheckout({
      customerEmail: email,
      metadata: { userId, plan: dto.plan, interval, extra_seats: String(extraSeats), currency: priced.currency },
      successUrl: dto.success_url || `${this.frontendUrl}/billing?success=true`,
      cancelUrl: dto.cancel_url || `${this.frontendUrl}/billing?canceled=true`,
      plan: {
        name: `BellumAI ${planConfig.label}`,
        description: `${planConfig.accounts_limit} analyses/mois, ${planConfig.enrichment_credits} enrichissements${annual ? ' — facturation annuelle' : ''}`,
        unitAmount,
        currency: priced.currency,
        interval,
        // Tags the line so a later operator price edit can re-price THIS line
        // (and only it) on the live subscription, without matching on a name.
        productMetadata: { [BELLUM_LINE_METADATA_KEY]: 'plan' },
      },
      ...(extraSeats > 0 && {
        seatAddon: {
          name: SEAT_LINE_NAME,
          description: `${extraSeats} siège(s) au-delà des ${planConfig.seats} siège(s) inclus`,
          unitAmount: seatUnit,
          currency: priced.currency,
          quantity: extraSeats,
          interval,
          productMetadata: { [BELLUM_LINE_METADATA_KEY]: 'seat' },
        },
      }),
    })

    return { url: session.url || '' }
  }

  /**
   * La devise de facturation d'un espace, et si elle est encore choisissable.
   *
   * Le verrou n'est pas une préférence produit : Stripe n'autorise pas à changer
   * la devise d'un abonnement existant — il faut l'annuler et en recréer un.
   * Proposer un choix à quelqu'un qui a déjà payé produirait donc un échec au
   * paiement, après le clic. On lit ce qui a été RÉELLEMENT facturé.
   *
   * Le pays lu est `billing_country`, jamais `market` : ce dernier décrit le
   * marché prospecté, et facturer en dollars une ESN française qui prospecte les
   * États-Unis serait précisément l'erreur silencieuse qu'on veut éviter.
   */
  async resolveCheckoutCurrency(
    userId: string,
    requested: string | null,
  ): Promise<{ currency: BillingCurrency; locked: boolean }> {
    let workspace: WorkspaceEntity | null = null
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      workspace = await this.workspaces.findOne({ where: { id: workspaceId } })
    } catch {
      // Pas d'espace résolu (compte tout neuf) : l'euro, et le choix reste ouvert.
      workspace = null
    }
    const locked = workspace?.billing_currency ?? null
    return {
      currency: resolveBillingCurrency({
        locked,
        requested,
        billingCountry: workspace?.billing_country ?? null,
      }),
      locked: isBillingCurrency(locked),
    }
  }

  /**
   * Fige la devise d'un espace après un paiement RÉUSSI.
   *
   * Écrite depuis `session.currency`, c'est-à-dire ce que Stripe a réellement
   * facturé — pas depuis nos propres métadonnées. Les deux devraient coïncider ;
   * si un jour ils divergent, c'est le relevé du client qui fait foi, pas notre
   * intention. Écrite une seule fois : un espace déjà figé n'est jamais réécrit.
   */
  private async lockBillingCurrency(userId: string, currency: string | null | undefined): Promise<void> {
    if (!isBillingCurrency(currency)) return
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      await this.workspaces.update({ id: workspaceId, billing_currency: IsNull() }, { billing_currency: currency })
    } catch (err) {
      // Le verrou est une commodité d'affichage : le rater ne doit jamais faire
      // échouer un paiement déjà encaissé.
      this.logger.error(`Failed to lock billing currency for ${userId}`, { error: err })
    }
  }

  async createPortalSession(stripeCustomerId: string): Promise<{ url: string }> {
    const session = await this.stripeService.createBillingPortal({
      customerId: stripeCustomerId,
      returnUrl: `${this.frontendUrl}/billing`,
    })
    return { url: session.url }
  }

  /**
   * Crée (ou retrouve) un Stripe Customer pour l'utilisateur, puis lance
   * une session Checkout en mode `setup` — Stripe collecte une carte
   * bancaire sans débit, l'enregistre sur le customer et redirige.
   *
   * Utilisé par les users sans abonnement qui veulent pré-enregistrer un
   * moyen de paiement. Une fois la carte ajoutée, le portail Stripe
   * (`createPortalSession`) devient accessible — c'est lui qui gère
   * ensuite l'affichage / la suppression / le changement de carte.
   */
  async createSetupSession(userId: string, email: string): Promise<{ url: string }> {
    await this.assertNotManuallyBilled(userId)
    const customerId = await this.ensureStripeCustomer(userId, email)

    const session = await this.stripeService.createSetupCheckout({
      customerId,
      successUrl: `${this.frontendUrl}/billing?setup=success`,
      cancelUrl: `${this.frontendUrl}/billing?setup=canceled`,
    })

    return { url: session.url || '' }
  }

  /**
   * Garantit qu'une ligne `user_credits` existe pour l'utilisateur et
   * qu'elle porte un `stripe_customer_id`. Crée le Customer côté Stripe
   * à la volée si besoin — on tag le `userId` Bellum dans
   * `metadata.userId` pour permettre les retrouvailles côté Stripe.
   */
  /**
   * Refuse any Stripe-side action for an invoice-billed (sales-led) client.
   *
   * They have no Stripe customer and must never acquire one: a self-serve
   * checkout would start a SECOND charge on top of the invoice they already pay,
   * and `checkout.session.completed` would overwrite their negotiated caps with
   * the plain catalog template.
   *
   * Reads the EXPLICIT `billing_mode`, never `stripe_subscription_id IS NULL` —
   * a NULL id also describes a trial or an abandoned checkout, both of which
   * must keep their access to checkout.
   */
  private async assertNotManuallyBilled(userId: string): Promise<void> {
    const row = await this.credits.findOne({ where: { user_id: userId }, select: ['billing_mode'] })
    if (row?.billing_mode === 'manual') {
      throw new BadRequestException(
        'Cet espace est en facturation manuelle (sur facture). Contactez votre interlocuteur commercial pour modifier votre contrat.',
      )
    }
  }

  private async ensureStripeCustomer(userId: string, email: string): Promise<string> {
    const existing = await this.credits.findOne({ where: { user_id: userId } })
    if (existing?.stripe_customer_id) return existing.stripe_customer_id

    const customer = await this.stripeService.createCustomer({
      email,
      metadata: { userId },
    })

    const merged = this.credits.merge(existing ?? this.credits.create({ user_id: userId }), {
      stripe_customer_id: customer.id,
    })
    await this.credits.save(merged)
    return customer.id
  }

  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    // Audit M1 — deux livraisons simultanées du même événement se sérialisent :
    // la seconde relit, APRÈS la fin de la première, l'id que celle-ci a gravé.
    return this.withLock(`stripe-event:${event.id}`, () => this.processWebhookEvent(event))
  }

  private async processWebhookEvent(event: Stripe.Event): Promise<void> {
    // Idempotence (finding pentest #14). Stripe livre AU MOINS une fois et rejoue
    // de lui-même. On ne grave l'id qu'APRÈS un traitement réussi : l'enregistrer
    // AVANT laissait une panne transitoire (throw non capté) sauter le rejeu de
    // Stripe — un top-up payé perdu en silence, sans aucun compteur pour le voir.
    // Un événement déjà gravé a été traité → on le saute. Les rejeux de Stripe
    // sont espacés (jamais simultanés), et grantTopup est idempotent par eventId :
    // un rejeu après une panne re-traite sans double-créditer.
    const already = await this.stripeEvents.findOne({ where: { id: event.id }, select: ['id'] })
    if (already) {
      this.logger.log(`Stripe event already processed, skipping: ${event.id}`)
      return
    }

    switch (event.type) {
      // Audit H3 — un moyen de paiement ASYNCHRONE (SEPA, virement) émet
      // `completed` avec `payment_status: 'unpaid'` : l'argent n'est pas encaissé.
      // Le top-up se crédite alors sur `async_payment_succeeded`, jamais avant.
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.async_payment_failed':
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.metadata?.['userId']
        // One-shot credit top-up (mode: payment) — grant the pack, not a plan.
        const topupPackId = session.metadata?.['topupPackId']
        if (userId && topupPackId) {
          if (event.type === 'checkout.session.async_payment_failed') {
            this.logger.warn(`Top-up payment failed (async): user=${userId} pack=${topupPackId} — no credit`)
          } else if (session.payment_status !== 'paid') {
            this.logger.log(
              `Top-up not yet paid (payment_status=${session.payment_status}): user=${userId} pack=${topupPackId} — awaiting async_payment_succeeded`,
            )
          } else {
            await this.grantTopup(userId, topupPackId, session.metadata?.['topupActor'] ?? null, event.id)
          }
          break
        }
        // Le plan (abonnement) ne se règle que sur `completed`.
        if (event.type !== 'checkout.session.completed') break
        // Normalised so a pre-rename session (metadata plan `pro`/`business`)
        // still lands on its renamed tier instead of being dropped.
        const plan = normalizePlanKey(session.metadata?.['plan'])
        if (userId && plan) {
          const planConfig = await this.planCatalog.getOrDefault(plan)
          try {
            const existing = await this.credits.findOne({ where: { user_id: userId } })
            const extraSeats = Math.max(
              0,
              Math.min(Number(session.metadata?.['extra_seats'] ?? 0) || 0, MAX_EXTRA_SEATS),
            )
            const merged = this.credits.merge(existing ?? this.credits.create({ user_id: userId }), {
              plan,
              accounts_limit: planConfig.accounts_limit,
              enrichment_credits: planConfig.enrichment_credits,
              accounts_used: 0,
              // Paid plan clears the trial and starts a fresh monthly window.
              trial_end: null,
              period_start: new Date(),
              extra_seats: extraSeats,
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
            })
            await this.credits.save(merged)
            // La devise réellement facturée devient le verrou de l'espace.
            await this.lockBillingCurrency(userId, session.currency)
            await this.recordLedger({
              ownerUserId: userId,
              kind: 'grant_plan',
              resource: 'analysis_slot',
              delta: planConfig.accounts_limit,
              reason: `plan:${plan} (checkout ${event.id})`,
            })
            void this.analytics?.track('plan_changed', {
              userId,
              properties: { plan, via: 'checkout', extraSeats },
            })
            this.logger.log(`Checkout completed: user=${userId} plan=${plan}`)
          } catch (err) {
            this.logger.error(`Failed to upsert user_credits for ${userId}`, { error: err })
          }
        }
        break
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        // Legacy metadata (`pro`/`business`) maps to the renamed tier — an
        // existing subscription's updates keep flowing after the rename.
        const plan = normalizePlanKey(sub.metadata?.['plan'])
        if (plan) {
          const planConfig = await this.planCatalog.getOrDefault(plan)
          try {
            const current = await this.credits.findOne({
              where: { stripe_subscription_id: sub.id },
              select: ['user_id', 'plan'],
            })

            // Stripe emits `subscription.updated` for ANY change to the object —
            // a re-priced item, a seat quantity, a status flip. Only an actual
            // TIER change may rewrite quotas: re-running the grant on same-tier
            // updates would hand the subscriber a full fresh credit pool
            // mid-cycle, every time. Notably, an operator's plan-price edit
            // (PlanPriceSyncService) fires exactly such an update.
            if (current && current.plan === plan) {
              this.logger.log(`Subscription updated: ${sub.id} plan=${plan} unchanged — quotas left as-is`)
              break
            }

            await this.credits
              .createQueryBuilder()
              .update()
              .set({
                plan,
                accounts_limit: planConfig.accounts_limit,
                enrichment_credits: planConfig.enrichment_credits,
              })
              .where('stripe_subscription_id = :id', { id: sub.id })
              // Belt and braces for invoice-billed clients. A manual row holds
              // SQL NULL here, which never equals anything — but this UPDATE is
              // not scoped by user_id, so a single mis-written placeholder
              // ('' or 'manual') would rewrite EVERY manual client's quota at
              // once. The explicit mode filter makes that unreachable.
              .andWhere("billing_mode = 'stripe'")
              .execute()
            const row =
              current ??
              (await this.credits.findOne({
                where: { stripe_subscription_id: sub.id },
                select: ['user_id'],
              }))
            if (row) {
              await this.recordLedger({
                ownerUserId: row.user_id,
                kind: 'grant_plan',
                resource: 'analysis_slot',
                delta: planConfig.accounts_limit,
                reason: `plan:${plan} (subscription.updated ${sub.id})`,
              })
              void this.analytics?.track('plan_changed', {
                userId: row.user_id,
                properties: { plan, via: 'subscription.updated' },
              })
            }
            this.logger.log(`Subscription updated: ${sub.id} plan=${plan}`)
          } catch (err) {
            this.logger.error(`Failed to update subscription ${sub.id}`, { error: err })
          }
        } else {
          this.logger.log(`Subscription updated: ${sub.id} status=${sub.status} (no plan metadata)`)
        }
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        try {
          // No free tier anymore: a cancelled subscription locks to a no-access
          // state (0 quota) rather than dropping to a free plan. The user must
          // resubscribe. (Represented as `trial` with zero quota — the trial the
          // account already consumed; trial-expiry gating lands in a follow-up.)
          await this.credits
            .createQueryBuilder()
            .update()
            // `topup_analyses` goes to 0 with the rest: this is the hard lockout
            // path, and leaving purchased capacity spendable would reopen the
            // very access the zeroed quota is closing.
            .set({ plan: 'trial', accounts_limit: 0, enrichment_credits: 0, extra_seats: 0, topup_analyses: 0 })
            .where('stripe_subscription_id = :id', { id: sub.id })
            // Same guard as `subscription.updated`, and it matters more here:
            // this is the LOCKOUT path (0 quota). An invoice-billed client must
            // never be reachable by it.
            .andWhere("billing_mode = 'stripe'")
            .execute()
          this.logger.log(`Subscription deleted: ${sub.id} — locked (no active plan)`)
        } catch (err) {
          this.logger.error(`Failed to downgrade subscription ${sub.id}`, { error: err })
        }
        break
      }
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`)
    }

    // Traité sans throw : on grave l'id pour que le prochain rejeu soit sauté.
    // `orIgnore` couvre un rejeu concurrent (rare chez Stripe) sans écraser.
    await this.stripeEvents
      .createQueryBuilder()
      .insert()
      .values({ id: event.id, type: event.type })
      .orIgnore()
      .execute()
  }

  /**
   * Credit a completed one-shot top-up to the owner's pool. Server re-resolves
   * the pack (so the granted amount is authoritative, never client-supplied) and
   * bumps the matching counter: `analysis` raises `topup_analyses` (more runs
   * THIS cycle), `enrichment` adds `enrichment_credits`. Records a `topup` ledger
   * entry. Best-effort like the rest of the webhook — logs and swallows on error.
   *
   * ⚠️ `analysis` must NEVER touch `accounts_limit`. That column is the PLAN's
   * monthly cap and nothing resets it, so incrementing it turned a single
   * one-off purchase into a permanent quota increase, refilled by every
   * subsequent monthly reset. The purchased extra lives in `topup_analyses`,
   * which {@link resetElapsedMonthlyQuotas} clears when the cycle rolls.
   */
  private async grantTopup(
    ownerUserId: string,
    packId: string,
    actorUserId: string | null,
    eventId: string,
  ): Promise<void> {
    const pack = this.resolveTopupPack(packId)
    if (!pack) {
      this.logger.warn(`Top-up webhook for unknown/disabled pack: ${packId}`)
      return
    }
    // Idempotence par eventId (finding #14). L'incrément de `topup_analyses`
    // n'est PAS idempotent ; l'enregistrement de l'événement se faisant désormais
    // APRÈS le traitement, un rejeu Stripe re-passe ici. On refuse de re-créditer
    // si le ledger porte déjà la recharge de CET événement (son `reason` grave
    // `(checkout <eventId>)`).
    const alreadyGranted = await this.ledger
      .createQueryBuilder('l')
      .where('l.kind = :kind', { kind: 'topup' })
      .andWhere('l.reason LIKE :needle', { needle: `%(checkout ${eventId})%` })
      .getCount()
    if (alreadyGranted > 0) {
      this.logger.log(`Top-up already granted for ${eventId}, skipping replay`)
      return
    }
    try {
      // MONNAIE UNIQUE : tout pack crédite le MÊME pool de cycle, quel que soit
      // le nom historique de sa ressource. `topup_analyses` est la colonne que
      // le renouvellement mensuel remet à zéro — une recharge achète de la
      // capacité POUR CE CYCLE, jamais un relèvement permanent du quota.
      const set = { topup_analyses: () => `topup_analyses + ${pack.amount}` }
      // Audit M1 — le registre s'écrit AVANT le crédit, et son échec est relevé :
      // c'est la ligne `(checkout <eventId>)` qui rend le rejeu inoffensif. Écrit
      // après l'UPDATE (et avalé s'il échouait), un rejeu Stripe re-créditait.
      const ledgerId = await this.recordLedger({
        ownerUserId,
        actorUserId,
        kind: 'topup',
        resource: pack.resource === 'analysis' ? 'analysis_slot' : 'enrichment_credit',
        delta: pack.amount,
        reason: `topup:${pack.id} (checkout ${eventId})`,
        strict: true,
      })
      try {
        await this.credits
          .createQueryBuilder()
          .update()
          .set(set)
          .where('user_id = :userId', { userId: ownerUserId })
          .execute()
      } catch (err) {
        // Le crédit n'a pas eu lieu : la ligne ne doit pas dire le contraire,
        // sinon le rejeu serait pris pour un doublon et la recharge perdue.
        if (ledgerId) await this.ledger.delete({ id: ledgerId }).catch(() => undefined)
        throw err
      }
      void this.analytics?.track('credits_topup', {
        userId: ownerUserId,
        properties: { pack: pack.id, resource: pack.resource, amount: pack.amount },
      })
      this.logger.log(`Top-up granted: user=${ownerUserId} pack=${pack.id} +${pack.amount} ${pack.resource}`)
    } catch (err) {
      // On RE-LÈVE (finding #14) : un échec ne doit pas être gravé comme traité.
      // handleWebhookEvent n'enregistre l'event qu'après un retour sans throw ;
      // en propageant, on laisse Stripe rejouer, et l'idempotence par eventId
      // ci-dessus garantit qu'un rejeu ne double-crédite pas.
      this.logger.error(`Failed to grant top-up ${pack.id} for ${ownerUserId}`, { error: err })
      throw err
    }
  }

  async getStripeCustomerId(userId: string): Promise<{ data: string | null }> {
    const row = await this.credits.findOne({
      where: { user_id: userId },
      select: ['stripe_customer_id'],
    })
    return { data: row?.stripe_customer_id ?? null }
  }

  /**
   * Retourne les factures Stripe réelles de l'utilisateur (les plus récentes
   * d'abord). Sans customer Stripe → liste vide (état honnête « aucune facture »).
   * Une erreur Stripe (customer supprimé, réseau) est loggée et dégradée en
   * liste vide plutôt que de casser la page de facturation.
   */
  async listInvoices(userId: string): Promise<{ invoices: BillingInvoice[] }> {
    // One read for both facts. Invoice-billed clients have no Stripe customer by
    // design — their documents are issued in the accounting tool — so bail
    // before the API round-trip rather than looking them up and finding nothing.
    const row = await this.credits.findOne({
      where: { user_id: userId },
      select: ['stripe_customer_id', 'billing_mode'],
    })
    if (row?.billing_mode === 'manual') return { invoices: [] }

    const customerId = row?.stripe_customer_id ?? null
    if (!customerId) return { invoices: [] }

    try {
      const raw = await this.stripeService.listInvoices(customerId)
      const invoices = raw.map(
        (inv): BillingInvoice => ({
          id: inv.id,
          number: inv.number ?? null,
          amount: inv.total,
          currency: inv.currency,
          status: inv.status ?? 'open',
          created: inv.created,
          hosted_invoice_url: inv.hosted_invoice_url ?? null,
          invoice_pdf: inv.invoice_pdf ?? null,
        }),
      )
      return { invoices }
    } catch (err) {
      this.logger.error(`Failed to list Stripe invoices for ${userId}`, {
        error: err,
        tags: { 'stripe.op': 'invoices.list' },
      })
      return { invoices: [] }
    }
  }

  /**
   * Consommation journalière réelle sur les 30 derniers jours : chaque analyse
   * crée une ligne `accounts`, donc on agrège les créations par jour (UTC). Les
   * jours sans analyse sont remplis à 0 pour que le graphe ait toujours 30
   * points ordonnés du plus ancien au plus récent.
   */
  async getUsage(userId: string): Promise<{ usage: UsageDay[]; total: number }> {
    const since = new Date(Date.now() - (USAGE_WINDOW_DAYS - 1) * MS_PER_DAY)
    since.setUTCHours(0, 0, 0, 0)

    const rows = await this.accounts
      .createQueryBuilder('account')
      .select("to_char(date_trunc('day', account.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')", 'day')
      .addSelect('COUNT(*)', 'count')
      .where('account.user_id = :userId', { userId })
      .andWhere('account.created_at >= :since', { since })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; count: string }>()

    const counts = new Map(rows.map(row => [row.day, Number(row.count) || 0]))
    const usage: UsageDay[] = Array.from({ length: USAGE_WINDOW_DAYS }, (_, index) => {
      const day = new Date(since.getTime() + index * MS_PER_DAY).toISOString().slice(0, 10)
      return { day, value: counts.get(day) ?? 0 }
    })
    const total = usage.reduce((sum, point) => sum + point.value, 0)
    return { usage, total }
  }

  /**
   * Billing status for the caller's active workspace. The plan + quota come
   * from the workspace OWNER's subscription (shared by all members), plus:
   * - `is_billing_owner` — whether the caller may edit billing (owner only);
   * - `seats_total` — the plan's seat allowance (from the plan catalog);
   * - `seats_used` — how many members occupy the workspace today.
   * Solo user → owner is themself → identical to the old per-user response.
   */
  async getCredits(userId: string): Promise<{
    user_id: string
    plan: string
    /** MONNAIE UNIQUE — plafond de crédits du cycle : quota du plan + recharge
     *  ponctuelle. Un crédit vaut UNE action, quelle qu'elle soit. */
    credits_limit: number
    /** Crédits consommés sur le cycle (analyses ET enrichissements). */
    credits_used: number
    /**
     * Crédits DISPONIBLES — ce que le pool laisse, MOINS ce qui est déjà engagé
     * par une action en cours (`credits_reserved`). La seule question que pose
     * désormais la facturation, et la seule réponse qu'on a le droit de donner
     * deux fois : sans la soustraction, le même crédit était annoncé disponible
     * à deux gestes simultanés, et le second s'arrêtait en route après avoir
     * déjà écrit dans le CRM.
     */
    credits_remaining: number
    /**
     * Ce qui est PROMIS à une action en cours et pas encore dépensé.
     *
     * Exposé à part plutôt que fondu dans le total : sans lui, un solde qui
     * descend puis remonte tout seul ressemble à une erreur de comptage. Avec
     * lui, une surface peut dire « 8 engagés par une action en cours ».
     * Vaut 0 en démonstration — aucun crédit n'y est débité.
     */
    credits_reserved: number
    /**
     * L'ANNONCE est due : la part consommée du cycle a atteint le seuil (D5,
     * défaut 80 %, réglable par `CREDIT_LOW_THRESHOLD_PERCENT`).
     *
     * C'est une DÉCISION, pas une donnée brute : le seuil vit côté serveur et
     * nulle part ailleurs (GA-26). Un écran qui le recalculerait finirait par
     * annoncer autre chose que la notification `credit_low`. `false` quand la
     * capacité est inconnue (aucune ligne) et dans une salle de démonstration,
     * qui n'a pas de facturation.
     */
    credits_low: boolean
    /** Crédits reportés du cycle précédent et ENCORE valides (0 si expirés). */
    rollover_credits: number
    /** Échéance du report, ISO — `null` quand il n'y en a pas (ou plus). */
    rollover_expires_at: string | null
    /** @deprecated Alias de `credits_limit` — conservé le temps que toutes les
     *  surfaces (backoffice, anciens écrans) basculent sur le nom canonique. */
    accounts_limit: number
    /** @deprecated Alias de `credits_used`. */
    accounts_used: number
    /** The part of the cap bought as a one-off pack (expires at reset). */
    topup_analyses: number
    /** @deprecated Alias de `credits_remaining` — il n'existe plus de seconde
     *  monnaie ; un consommateur pas encore migré lit donc le VRAI solde, pas un
     *  compteur mort qui l'aurait laissé afficher « 0 enrichissement ». */
    enrichment_credits: number
    stripe_customer_id: string | null
    stripe_subscription_id: string | null
    is_billing_owner: boolean
    seats_total: number
    seats_used: number
    /** ISO trial end (null for paid plans). */
    trial_end: string | null
    /** Prochain renouvellement du quota mensuel (plans payants). Dérivé de
     *  `period_start` + 1 mois, la borne EXACTE que le cron de reset applique —
     *  pas une date d'affichage inventée. `null` sur un palier à fenêtre (essai /
     *  découverte) : ceux-là expirent, ils ne se renouvellent pas. */
    next_reset: string | null
    /** True when a trial's window has closed → the account is locked. */
    trial_expired: boolean
    /** Paid seats beyond the plan's included allowance. */
    extra_seats: number
    /** `manual` = invoice-billed (sales-led contract, no Stripe subscription);
     *  `stripe` = self-serve. Explicit, so the UI never has to guess from the
     *  absence of a Stripe id (which also means trial / abandoned checkout). */
    billing_mode: 'stripe' | 'manual'
    /** True when the caller's active workspace is a DEMO space (C1) — actions
     *  are free, real analyses are replaced by replays, banner shown app-wide. */
    is_demo: boolean
    /** Ce que le palier OUVRE (copilote, exports, CRM, MCP, API). L'app s'en sert
     *  pour verrouiller une surface et proposer la bonne offre AVANT le clic —
     *  l'API refuse de toute façon côté serveur (`PlanFeatureGuard`). */
    features: PlanFeatureKey[]
  }> {
    const { ownerUserId, workspaceId, isOwner, isDemo } = await this.resolveBillingSubscription(userId)
    const row = await this.credits.findOne({ where: { user_id: ownerUserId } })
    // Legacy-safe lookup: a not-yet-migrated `pro`/`business` row still resolves
    // its renamed tier's seat allowance instead of falling back to trial.
    const planConfig = await this.planCatalog.getOrDefault(normalizePlanKey(row?.plan) ?? 'trial')
    const seatsUsed = workspaceId ? await this.members.count({ where: { workspace_id: workspaceId } }) : 1
    const trialEnd = row?.trial_end ?? null
    // Ce qui est en vol. Une salle de démonstration ne débite rien, donc elle ne
    // réserve rien : on ne l'interroge même pas (`credit_reservations` y est vide
    // à dessein, voir `demo-coverage.ts`). Sans espace résolu non plus — une
    // réservation appartient toujours à un espace.
    const reserved = await this.reservedCredits(isDemo ? null : workspaceId)
    // Le solde du POOL, avant soustraction. `credits_low` reste calculé dessus :
    // D5 mesure la part CONSOMMÉE du cycle, pas l'instant. Une réservation qui
    // ferait basculer l'annonce l'allumerait pendant un run et l'éteindrait
    // juste après, alors que la notification `credit_low`, elle, dirait autre chose.
    const poolRemaining = creditsRemaining(row)

    return {
      user_id: row?.user_id ?? ownerUserId,
      // A row is always seeded at signup; a missing one is exceptional → no access
      // (0 quota) rather than a silent grant.
      plan: row?.plan ?? 'trial',
      // EFFECTIVE capacity for the cycle: plan cap + whatever one-off top-up was
      // bought for it. Every consumer of this field ("N crédits" pill, MCP quota
      // message, backoffice) asks the same question — how many analyses can be
      // run — and a buyer must see the analyses they paid for. The breakdown is
      // in `topup_analyses` for surfaces that need to tell the two apart.
      credits_limit: creditCapacity(row),
      credits_used: row?.accounts_used ?? 0,
      credits_remaining: spendableCredits(poolRemaining, reserved),
      credits_reserved: reserved,
      // L'annonce AVANT le mur (D5). Une salle de démonstration ne facture rien :
      // lui faire dire « bientôt à court » vendrait un mur qui n'existe pas.
      credits_low: isDemo ? false : isCreditLow(poolRemaining, creditCapacity(row), this.creditLowThresholdPercent),
      // Le report est montré À PART, avec sa date : noyé dans le total, il
      // ressemblerait à un quota permanent, et sa disparition au 31e jour
      // passerait pour une erreur de comptage.
      rollover_credits: validRollover(row),
      rollover_expires_at: validRollover(row) > 0 ? new Date(row!.rollover_expires_at!).toISOString() : null,
      accounts_limit: (row?.accounts_limit ?? 0) + (row?.topup_analyses ?? 0),
      accounts_used: row?.accounts_used ?? 0,
      topup_analyses: row?.topup_analyses ?? 0,
      enrichment_credits: spendableCredits(poolRemaining, reserved),
      stripe_customer_id: row?.stripe_customer_id ?? null,
      stripe_subscription_id: row?.stripe_subscription_id ?? null,
      is_billing_owner: isOwner,
      seats_total: planConfig.seats + (row?.extra_seats ?? 0),
      seats_used: seatsUsed,
      trial_end: trialEnd ? new Date(trialEnd).toISOString() : null,
      next_reset: nextResetFor(row),
      // A demo workspace is never "locked": the trial gate is billing machinery
      // and demo actions bypass billing entirely.
      trial_expired: isDemo ? false : isTrialExpired(row),
      extra_seats: row?.extra_seats ?? 0,
      // A row predating the column reads as `stripe` — the status quo for
      // everyone already live.
      billing_mode: row?.billing_mode === 'manual' ? 'manual' : 'stripe',
      is_demo: isDemo,
      // Un espace de démo montre le produit : tout est ouvert, comme côté serveur
      // (`PlanFeaturesService`) — deux réponses différentes afficheraient un
      // verrou que l'API n'applique pas.
      features: isDemo ? [...ALL_PLAN_FEATURES] : [...planConfig.features],
    }
  }

  /**
   * Ce qui est PROMIS à une action en cours sur cet espace, et pas encore
   * dépensé — le nombre à retrancher du solde annoncé.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * POURQUOI LA LECTURE VIT ICI ET L'ÉCRITURE AILLEURS
   * ─────────────────────────────────────────────────────────────────────────
   * Les réservations sont POSÉES par le moteur d'exécution gouvernée
   * (`CreditReservationService`, module Action OS), qui seul sait qu'un run
   * part. Elles ne servent qu'à une chose : être retranchées du solde — et le
   * solde appartient à ce service, seul à connaître le pool. La dérivation
   * (« qu'est-ce qu'une réservation vivante, combien elle pèse ») vit une seule
   * fois, dans {@link liveReservedTotal}, que les deux côtés appliquent.
   *
   * ⚠️ CE QUE CE NOMBRE NE FAIT PAS : il ne bloque aucun débit. Une réservation
   * est une PROMESSE, pas de l'argent — un run qui ne part finalement pas la
   * libère. Le débit réel reste gardé par l'UPDATE atomique de
   * {@link consumeEnrichmentCredit} / {@link consumeAnalysisSlot}, qui est ce
   * qui empêche deux gestes simultanés de franchir le plafond. Bloquer sur une
   * promesse ferait refuser un enrichissement à cause d'un run qui n'aura
   * peut-être rien dépensé.
   *
   * Sans espace (`null`), zéro : une réservation appartient toujours à un espace.
   */
  private async reservedCredits(workspaceId: string | null): Promise<number> {
    if (!workspaceId) return 0
    const rows = await this.reservations.find({ where: { workspace_id: workspaceId, state: 'reserved' } })
    return liveReservedTotal(rows, new Date())
  }

  canAnalyze(accountsUsed: number, accountsLimit: number): boolean {
    return accountsUsed < accountsLimit
  }

  /**
   * Monthly quota reset for PAID plans. Zeroes `accounts_used` (the analyses
   * counter, use-it-or-lose-it) and tops `enrichment_credits` up to at least the
   * plan quota (`GREATEST` never reduces a top-up balance), then advances
   * `period_start`. Trial rows are excluded — a trial expires (Phase 2), it does
   * not roll monthly. Rolling per-subscription (a row resets when ITS window is a
   * month old), so mid-month signups get a full month. One UPDATE per paid plan
   * keeps the plan catalog the single source of the enrichment quota.
   *
   * `topup_analyses` is zeroed with the cycle: a one-off analysis pack buys
   * capacity for the month it was bought in, not a permanent quota increase.
   * This is the counterpart of granting top-ups on their own column — the plan
   * cap (`accounts_limit`) is deliberately left untouched here, so an operator's
   * negotiated cap survives the reset while a purchased extra does not.
   *
   * Returns the number of subscriptions reset. Idempotent within a window: a row
   * already advanced won't match `period_start <= now() - 1 month` again.
   */
  async resetElapsedMonthlyQuotas(): Promise<number> {
    let total = 0
    // Paid plans reset monthly (beta included — it's a 59€/mo paid plan). `trial`
    // is excluded: it expires, it does not roll.
    for (const plan of ['starter', 'team', 'growth', 'beta'] as const) {
      // MONNAIE UNIQUE : le renouvellement rend le quota de CRÉDITS du palier.
      const quota = (await this.planCatalog.getOrDefault(plan)).accounts_limit
      const res = await this.credits
        .createQueryBuilder()
        .update()
        .set({
          // Le REPORT (grille du 16/08) : ce qui n'a pas été consommé du quota du
          // palier survit 30 jours. Calculé AVANT la remise à zéro — dans un
          // UPDATE, la partie droite lit les anciennes valeurs, c'est ce qui rend
          // ces deux lignes cohérentes malgré l'apparence.
          //
          // Seul le quota du PALIER est reportable : ni la recharge ponctuelle
          // (achetée pour un cycle précis), ni un report antérieur — sinon les
          // crédits s'empileraient de mois en mois, ce qui n'est pas ce qui est
          // promis.
          rollover_credits: () => `GREATEST(LEAST(accounts_limit, ${quota}) - accounts_used, 0)`,
          rollover_expires_at: () => `now() + interval '30 days'`,
          accounts_used: 0,
          // One-off capacity expires with the cycle it was bought for.
          topup_analyses: 0,
          // Le plafond revient au nominal du palier — un opérateur qui a accordé
          // PLUS que le nominal (geste commercial) n'est pas rétrogradé.
          accounts_limit: () => `GREATEST(accounts_limit, ${quota})`,
          period_start: () => 'now()',
        })
        .where("plan = :plan AND period_start <= now() - interval '1 month'", { plan })
        // RETURN the reset owners so the monthly refill is traceable in the ledger.
        .returning(['user_id'])
        .execute()
      total += res.affected ?? 0

      // Best-effort ledger: one `grant_plan` line per reset owner records the
      // monthly re-provisioning (delta = le quota de crédits du palier — même
      // convention que le grant de checkout, qui journalise le quota complet et
      // non la variation nette). A DB without RETURNING support (or
      // a mocked `execute` in tests) yields no rows → we simply skip the audit
      // write, exactly like `recordLedger` swallows its own failures.
      const rows = (res.raw as Array<{ user_id?: string }> | undefined) ?? []
      for (const row of rows) {
        if (!row?.user_id) continue
        await this.recordLedger({
          ownerUserId: row.user_id,
          kind: 'grant_plan',
          // `analysis_slot` est le nom historique de la ressource « crédit » dans
          // le ledger. On le garde : renommer une valeur contrainte en base pour
          // une question de vocabulaire casserait l'historique et le CHECK.
          resource: 'analysis_slot',
          delta: quota,
          reason: `monthly_reset:${plan}`,
        })
      }
    }
    if (total) this.logger.log(`Monthly quota reset: ${total} subscription(s)`)
    return total
  }

  /** Daily sweep that applies {@link resetElapsedMonthlyQuotas}. Runs at 03:23;
   *  `ScheduleModule` is booted process-wide (outbox.module). At N replicas the
   *  singleton lock keeps it to one run per tick — the guarded UPDATE is
   *  concurrency-safe anyway (the WHERE re-evaluates under the row lock), the
   *  lock just avoids N redundant sweeps racing each other. */
  @Cron('23 3 * * *', { name: 'monthly-quota-reset' })
  @Correlated('cron:credits.monthlyQuotaResetCron')
  async monthlyQuotaResetCron(): Promise<void> {
    try {
      await withSingletonLock(this.locks, 'monthly-quota-reset', async () => {
        await this.resetElapsedMonthlyQuotas()
      })
    } catch (error) {
      this.logger.error('Monthly quota reset sweep failed', { error })
    }
  }

  /**
   * La porte de coût par espace (#2975), interrogée AVANT de débiter — même
   * chokepoint pour TOUTE action coûteuse (analyse, enrichissement,
   * need_play, cv_rewrite, talent_enrichment…), puisque toutes passent par
   * {@link consumeAnalysisSlot}/{@link consumeEnrichmentCredit} (GA-26 : un
   * seul endroit pour ce réglage, jamais un contrôle recopié par appelant).
   *
   * Rend `null` — la porte laisse passer — sans lire `provider_costs` du
   * tout quand : aucun espace n'est résolu, aucune {@link WorkspaceBudgetService}
   * n'est câblée (même discipline `@Optional()` que le reste du fichier), ou
   * qu'aucun plafond n'est réglé pour cet espace (`checkGate` no-op déjà).
   * Sinon, `verdict.message` NOMME la limite dépassée (#2440.87).
   */
  private async checkWorkspaceBudget(
    workspaceId: string | null,
    actorUserId: string,
    actionKey: keyof typeof ACTION_ESTIMATED_COST_USD,
    creditsAboutToSpend: number,
  ): Promise<string | null> {
    // #4464 — la porte nomme une limite chiffrée (USD) : le client ne reçoit que le frein doux ;
    // le diagnostic opérateur (`enrichmentDiagnostic`) garde la limite nommée.
    const refusal = await this.workspaceGateRefusal(workspaceId, actorUserId, actionKey, creditsAboutToSpend)
    return refusal ? SOFT_BRAKE_MESSAGE : null
  }

  /** La porte de coût, avec la LIMITE nommée (`overCap`) en plus du message. */
  private async workspaceGateRefusal(
    workspaceId: string | null,
    actorUserId: string,
    actionKey: keyof typeof ACTION_ESTIMATED_COST_USD,
    creditsAboutToSpend: number,
  ): Promise<{ message: string; overCap: string } | null> {
    if (!workspaceId || !this.budgetGate) return null
    const estimatedCostUsd = ACTION_ESTIMATED_COST_USD[actionKey] * creditsAboutToSpend
    const verdict = await this.budgetGate(workspaceId, actorUserId, actionKey, estimatedCostUsd)
    return verdict.allowed ? null : { message: verdict.message, overCap: verdict.overCap }
  }

  /**
   * Atomically decrement one enrichment credit. The single SQL update with a
   * `enrichment_credits > 0` guard handles the race where two concurrent
   * enrich calls land on the same user — only one will see `affected: 1`,
   * the other gets `affected: 0` and a `insufficient_credits` failure.
   *
   * Call this AFTER a successful Apollo lookup so a failed network call
   * doesn't burn the user's credits.
   */
  async consumeEnrichmentCredit(
    userId: string,
    context?: { reason?: string; accountId?: string; type?: EnrichmentType; cost?: number },
  ): Promise<{ ok: boolean; remaining: number; reason?: string; refusal?: EnrichmentRefusalKind }> {
    // Cost from the credit grid — an explicit `cost` wins, else it's resolved
    // from the enrichment type (only `contact` = 1 today, so prod is unchanged).
    // Server-controlled, normalised integer — safe to interpolate into the SQL.
    const cost = normalizeCost(context?.cost ?? resolveEnrichmentCost(context?.type))
    const { ownerUserId, workspaceId, isDemo } = await this.resolveBillingSubscription(userId)
    // Demo workspace (C1): the action proceeds but NOTHING is debited — no
    // balance update, no ledger line. Demos must never consume the owner's pool.
    // Le solde ANNONCÉ en démonstration est celui du palier VENDU : `trial` est
    // passé à zéro le 02/09/2026, et une salle qui affiche « 0 crédit » vend un
    // mur qui n'existe pas (un espace `is_demo` ne débite jamais).
    if (isDemo) return { ok: true, remaining: (await this.planCatalog.getOrDefault('growth')).accounts_limit }
    const budgetBlock = await this.checkWorkspaceBudget(workspaceId, userId, 'enrichment', cost)
    if (budgetBlock) {
      const row = await this.credits.findOne({ where: { user_id: ownerUserId } })
      return { ok: false, remaining: creditsRemaining(row), reason: budgetBlock }
    }
    const result = await this.credits
      .createQueryBuilder()
      .update()
      // MONNAIE UNIQUE : un enrichissement débite le MÊME pool qu'une analyse.
      // Le compteur du cycle est `accounts_used`, le plafond `accounts_limit +
      // topup_analyses` (quota du plan + recharge ponctuelle, la seconde étant
      // remise à zéro au renouvellement). Deux monnaies signifiaient qu'un
      // commercial pouvait avoir « des enrichissements mais plus d'analyses »,
      // et devoir acheter deux packs différents pour un seul geste métier.
      .set({ accounts_used: () => `accounts_used + ${cost}` })
      // Garde atomique : le débit TIENT dans le solde, et la fenêtre d'essai est
      // encore ouverte. Deux enrichissements simultanés ne peuvent pas passer
      // tous les deux sous le plafond — un seul voit `affected: 1`.
      .where(`user_id = :userId AND accounts_used + ${cost} <= ${SPENDABLE_SQL} AND ${TRIAL_ACTIVE_SQL}`, {
        userId: ownerUserId,
      })
      .execute()

    if (!result.affected) {
      // #3400 — le refus dit sa VRAIE cause. Sans raison, l'appelant retombait
      // sur « crédits épuisés » alors que le compteur affichait 65.
      const refusal = await this.refusalOf(ownerUserId)
      return refusal
        ? { ok: false, remaining: 0, reason: refusal.message, refusal: refusal.kind }
        : { ok: false, remaining: 0 }
    }

    await this.recordLedger({
      ownerUserId,
      workspaceId,
      actorUserId: userId,
      kind: 'consume_enrichment',
      resource: 'enrichment_credit',
      delta: -cost,
      reason: context?.reason ?? null,
      accountId: context?.accountId ?? null,
    })

    // Full row (not just the balance): the credit-low check below needs the
    // plan + period_start to resolve the quota and the anti-spam cycle anchor.
    const row = await this.credits.findOne({ where: { user_id: ownerUserId } })
    await this.maybeNotifyCreditLow(row)
    return { ok: true, remaining: creditsRemaining(row) }
  }

  /**
   * #3400 — POURQUOI un enrichissement est refusé, lu sur la ligne du pool.
   * `null` = le solde est réellement vide (l'appelant garde « crédits épuisés »).
   * Le débit atomique exige un solde ET une fenêtre d'essai ouverte ; le
   * compteur, lui, n'affichait que le solde — les deux affirmations divergeaient.
   * Jamais de nom de fournisseur : un quota amont n'est pas des « crédits épuisés ».
   */
  async enrichmentRefusal(userId: string): Promise<EnrichmentRefusal | null> {
    const { ownerUserId } = await this.resolveBillingSubscription(userId)
    return this.refusalOf(ownerUserId)
  }

  /**
   * #3400 — « confirmer la cause réelle sur CE compte » : ce que le refus d'un
   * enrichissement donnerait, rendu en LECTURE SEULE (aucun débit, aucune ligne de
   * registre, aucune réservation). Il suit l'ordre exact du geste réel : la porte
   * amont de {@link hasEnrichmentCredit} (essai fermé, solde vide), puis la porte de
   * budget d'espace de {@link consumeEnrichmentCredit}. `none` = le débit passerait.
   * Réservé à l'opérateur (`EnrichmentDiagnosticController`, secret interne).
   */
  async enrichmentDiagnostic(userId: string): Promise<EnrichmentDiagnostic> {
    const { ownerUserId, workspaceId, isDemo } = await this.resolveBillingSubscription(userId)
    const row = await this.credits.findOne({ where: { user_id: ownerUserId } })
    const reserved = await this.reservedCredits(isDemo ? null : workspaceId)
    const trialExpired = isTrialExpired(row)
    const remaining = creditsRemaining(row)
    const cost = normalizeCost(resolveEnrichmentCost('contact'))
    const gateRefusal = isDemo ? null : await this.workspaceGateRefusal(workspaceId, userId, 'enrichment', cost)
    const workspaceGate = gateRefusal?.message ?? null
    const preCheckAllows = isDemo || (!trialExpired && remaining > 0)
    let cause: EnrichmentDiagnostic['cause'] = 'none'
    if (!isDemo) {
      if (!row) cause = 'no_subscription'
      else if (trialExpired) cause = 'trial_ended'
      else if (remaining <= 0) cause = 'pool_empty'
      // #2440.48 — diagnostic seulement : le quota quotidien de l'outil se nomme à part du budget
      // d'espace (une autre limite à lever, une autre heure de réouverture). Débit inchangé.
      else if (gateRefusal) cause = gateRefusal.overCap === 'tool_daily_cap' ? 'tool_daily_cap' : 'workspace_budget'
    }
    return {
      cause,
      plan: row?.plan ?? null,
      trialEnd: row?.trial_end ? new Date(row.trial_end).toISOString() : null,
      trialExpired,
      creditsRemaining: remaining,
      creditsReserved: reserved,
      preCheckAllows,
      workspaceGate,
      isDemo,
    }
  }

  private async refusalOf(ownerUserId: string): Promise<EnrichmentRefusal | null> {
    const row = await this.credits.findOne({ where: { user_id: ownerUserId } })
    if (isTrialExpired(row)) {
      return {
        kind: 'trial_ended',
        message:
          "Ta période d'essai est terminée : l'enrichissement est suspendu tant que tu n'as pas choisi une offre.",
      }
    }
    if (creditsRemaining(row) > 0) {
      return {
        kind: 'unavailable',
        message: "L'enrichissement est momentanément indisponible. Rien n'a été consommé — réessaie dans un instant.",
      }
    }
    return null
  }

  /** Read-only check used to gate the UI before the user even tries. Même pool
   *  que l'analyse : un solde vide interdit les deux. Même règle que le débit
   *  atomique (#3400) : une fenêtre d'essai fermée ferme aussi la porte ici. */
  async hasEnrichmentCredit(userId: string): Promise<boolean> {
    const { ownerUserId, isDemo } = await this.resolveBillingSubscription(userId)
    // Demo workspace: actions are free — never gate the UI on the owner's pool.
    if (isDemo) return true
    const row = await this.credits.findOne({
      where: { user_id: ownerUserId },
      // Toutes les colonnes du pool, report compris (05/10/2026) : sans
      // `rollover_*`, un quota consommé avec un report valide lisait −1 ici
      // et refusait l'enrichissement que le débit atomique aurait accepté.
      select: [
        'plan',
        'trial_end',
        'accounts_limit',
        'accounts_used',
        'topup_analyses',
        'rollover_credits',
        'rollover_expires_at',
      ],
    })
    if (isTrialExpired(row)) return false
    return creditsRemaining(row) > 0
  }

  /**
   * Atomically claim one analysis slot against the plan's `accounts_limit`.
   * A single guarded UPDATE (`accounts_used + 1 WHERE accounts_used <
   * accounts_limit`) both increments usage and enforces the cap in one shot, so
   * two concurrent starts can't both slip past the limit — only one sees
   * `affected: 1`, the other gets `ok: false`. Call this AFTER the
   * idempotency / result-cache checks in `AnalysisService.start` so a cache hit
   * or an in-flight reuse never burns a slot.
   *
   * The signup trigger normally seeds a `trial` row; if it's somehow missing we
   * seed one and claim against it so a brand-new user isn't wrongly blocked.
   */
  async consumeAnalysisSlot(
    userId: string,
    context?: { reason?: string; accountId?: string; scopeMode?: AnalysisScopeMode; cost?: number },
  ): Promise<{ ok: boolean; used: number; limit: number; ledgerId?: string | null; reason?: string }> {
    // Cost from the credit grid (roadmap item): an explicit `cost` wins, else it
    // is resolved from the analysis perimeter (`scopeMode`). Today every scope
    // resolves to 1, so this is byte-for-byte the previous behaviour; a costlier
    // scope only debits more once its grid value is bumped. `cost` is a
    // server-controlled, normalised integer — safe to interpolate into the SQL.
    const cost = normalizeCost(context?.cost ?? resolveAnalysisCost(context?.scopeMode))
    const { ownerUserId, workspaceId, isDemo } = await this.resolveBillingSubscription(userId)
    // Le palier d'un compte SANS licence — zéro crédit depuis le 02/09/2026.
    // C'est le repli quand la ligne d'abonnement manque (le trigger de signup
    // n'a pas tourné) : il ne sert plus qu'à NOMMER un palier, plus à en ouvrir un.
    const locked = await this.planCatalog.getOrDefault('decouverte')
    // Demo workspace (C1): the action proceeds but NOTHING is debited — no
    // counter bump, no ledger line. Demos must never consume the owner's pool.
    // Le plafond ANNONCÉ est celui du palier vendu : une salle de démonstration
    // montre le produit tel qu'il s'achète, et `locked` afficherait « 0 crédit ».
    if (isDemo) return { ok: true, used: 0, limit: (await this.planCatalog.getOrDefault('growth')).accounts_limit }
    const budgetBlock = await this.checkWorkspaceBudget(workspaceId, userId, 'analysis', cost)
    if (budgetBlock) {
      const existing = await this.credits.findOne({ where: { user_id: ownerUserId } })
      return {
        ok: false,
        used: existing?.accounts_used ?? 0,
        limit: existing ? creditCapacity(existing) : locked.accounts_limit,
        reason: budgetBlock,
      }
    }
    const result = await this.credits
      .createQueryBuilder()
      .update()
      .set({ accounts_used: () => `accounts_used + ${cost}` })
      // Guard: the run FITS under the cap AND (not a trial, or the trial is still
      // active). `+ cost <= limit` generalises the old `used < limit` (identical
      // when cost = 1). An expired trial matches no row → ok:false, like a full quota.
      // The cap is the plan quota PLUS any one-off top-up bought for this cycle —
      // a customer who paid for +50 analyses can spend them, and `topup_analyses`
      // (unlike `accounts_limit`) is cleared by the monthly reset.
      .where(`user_id = :userId AND accounts_used + ${cost} <= ${SPENDABLE_SQL} AND ${TRIAL_ACTIVE_SQL}`, {
        userId: ownerUserId,
      })
      .execute()

    if (result.affected) {
      const ledgerId = await this.recordLedger({
        ownerUserId,
        workspaceId,
        actorUserId: userId,
        kind: 'consume_analysis',
        resource: 'analysis_slot',
        delta: -cost,
        reason: context?.reason ?? null,
        accountId: context?.accountId ?? null,
      })
      // Full row (not just the counters): the credit-low check below needs the
      // plan + period_start to resolve the anti-spam cycle anchor.
      const row = await this.credits.findOne({ where: { user_id: ownerUserId } })
      await this.maybeNotifyCreditLow(row)
      return {
        ledgerId,
        ok: true,
        used: row?.accounts_used ?? cost,
        // La capacité EFFECTIVE du cycle, celle que `getCredits` publie en
        // `credits_limit` — report compris. Sans lui, un client qui reportait
        // 50 crédits lisait « 150/100 consommés » au moment du refus.
        limit: row ? creditCapacity(row) : locked.accounts_limit,
      }
    }

    // affected: 0 — either the owner row is missing (seed + claim) or the quota
    // is full. Seed against the owner so the shared pool is created once.
    const existing = await this.credits.findOne({ where: { user_id: ownerUserId } })
    if (existing) {
      return {
        ok: false,
        used: existing.accounts_used,
        limit: creditCapacity(existing),
      }
    }
    /**
     * Ligne absente — le trigger de signup n'a pas tourné.
     *
     * On la POSE quand même (la facturation a besoin d'un sujet, et l'écran doit
     * pouvoir nommer un palier), mais à ZÉRO crédit, et on REFUSE l'action.
     *
     * ⚠️ C'était la dernière porte gratuite du produit, et la plus discrète :
     * jusqu'au 02/09/2026 cette branche semait 48 crédits ET laissait passer
     * l'analyse (`ok: true`). Fermer le trigger de signup sans fermer celle-ci
     * n'aurait pas retiré l'essai gratuit — il l'aurait déplacé dans le chemin
     * de consommation, où personne ne l'aurait cherché.
     *
     * Aucune ligne de journal : rien n'a été consommé, et un débit inscrit pour
     * une action refusée fausserait la reddition de comptes.
     */
    const seeded = this.credits.create({
      user_id: ownerUserId,
      plan: 'decouverte',
      accounts_limit: locked.accounts_limit,
      enrichment_credits: locked.enrichment_credits,
      accounts_used: 0,
    })
    await this.credits.save(seeded)
    return { ok: false, used: 0, limit: creditCapacity(seeded) }
  }

  /**
   * Transparence billing (Théo beta 15/08) : après un débit réussi, si le solde
   * restant du pool passe sous {@link CREDIT_LOW_THRESHOLD_RATIO} du quota,
   * dépose UNE notification in-app `credit_low` chez le OWNER du workspace (le
   * sujet de facturation). Garde-fous :
   *  - pref `credit_low` (opt-out, défaut ON) ;
   *  - anti-spam : max 1 notification par cycle de quota (ancre =
   *    `period_start`, fallback fenêtre 30 j pour les lignes legacy) ;
   *  - best-effort intégral : toute erreur est loggée et avalée — le débit qui
   *    a réussi ne doit JAMAIS échouer à cause de la notification.
   *
   * Le seuil et la capacité sortent des MÊMES fonctions que `credits_low` dans
   * {@link CreditsService.getCredits} : la cloche et l'écran ne peuvent pas dire
   * deux choses différentes du même solde.
   */
  // Pas de paramètre `resource` : depuis la MONNAIE UNIQUE, le crédit ne porte
  // plus le nom du geste qui l'a dépensé, et le message ne le nomme pas non plus.
  // Il traînait dans la signature, inutilisé, en laissant croire le contraire.
  private async maybeNotifyCreditLow(row: SubscriptionEntity | null): Promise<void> {
    if (!this.notifications || !row) return
    try {
      // MONNAIE UNIQUE : une seule jauge à surveiller, quel que soit le geste qui
      // vient de débiter. Le plafond est celui du CYCLE (quota du plan + recharge
      // ponctuelle), donc acheter un pack relève le seuil d'alerte avec lui au
      // lieu de laisser un client qui vient de recharger « bientôt épuisé ».
      const quota = creditCapacity(row)
      const remaining = creditsRemaining(row)
      if (!isCreditLow(remaining, quota, this.creditLowThresholdPercent)) return

      const prefs = await this.notifications.getPreferences(row.user_id)
      if (!prefs.credit_low) return

      // Max ONE credit_low per quota cycle: the monthly reset advances
      // `period_start`, which re-arms the alert for the next cycle.
      const cycleStart = row.period_start ?? new Date(Date.now() - CREDIT_LOW_FALLBACK_WINDOW_MS)
      const alreadySent = await this.notifications.countSince(row.user_id, 'credit_low', cycleStart)
      if (alreadySent > 0) return

      // Un seul libellé : le crédit ne porte plus le nom du geste qui l'a dépensé.
      // La date de renouvellement n'apparaît QUE si le dépôt la connaît
      // (`nextResetFor` rend `null` sur un palier à fenêtre et sur une ligne sans
      // `period_start`) : « ils se rechargent bientôt » serait une invention.
      const nextReset = nextResetFor(row)
      const resetSentence = nextReset ? ` Ils se rechargent le ${formatResetDate(nextReset)}.` : ''
      const body = `Il te reste ${remaining} crédit${remaining > 1 ? 's' : ''} sur ${quota} ce cycle.${resetSentence} Recharge ou change d'offre pour ne pas être bloqué.`
      await this.notifications.createNotification(row.user_id, {
        type: 'credit_low',
        title: 'Crédits bientôt épuisés',
        body,
        link: '/billing',
      })
      // #2875/#2402.1 (vague F/G 27/09) — persiste AUSSI un `TriggerEvent`
      // canonique, au même point que la notification (même garde-fou anti-spam
      // « max une par cycle » : sans elle, un appel par débit inonderait le
      // registre pendant tout le cycle où le solde reste bas). Best-effort,
      // jamais sur le chemin critique du débit.
      void this.recordCreditLowTrigger(row, remaining, quota)
    } catch (err) {
      this.logger.warn('credit_low notification failed (non-fatal)', {
        user: { id: row.user_id },
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /**
   * #2875/#2402.1 — un événement canonique PAR ESPACE possédé par
   * `row.user_id`, même fan-out que `InterventionsSweeper.creditsExhausted`
   * pour la même raison : le pool est celui du PROPRIÉTAIRE, mais un
   * propriétaire peut porter plusieurs espaces, chacun avec sa propre file
   * d'intervention et sa propre corrélation #2402.14. Les espaces de
   * démonstration sont exclus, comme partout — ils ne débitent rien.
   */
  private async recordCreditLowTrigger(row: SubscriptionEntity, remaining: number, quota: number): Promise<void> {
    if (!this.triggers) return
    try {
      const owned = await this.workspaces.find({ where: { owner_user_id: row.user_id, is_demo: false } })
      const now = new Date()
      for (const workspace of owned) {
        const event = buildTriggerEvent({
          type: 'credit_low',
          source: 'credits',
          subjectType: 'workspace',
          subjectId: workspace.id,
          workspaceId: workspace.id,
          ownerId: row.user_id,
          evidence: `${remaining} crédit${remaining > 1 ? 's' : ''} restant(s) sur ${quota} ce cycle.`,
          now,
          // #2875 — un seuil par cycle de facturation (mois), pas à chaque débit.
          dedupeQualifier: triggerPeriodQualifier(now, 'month'),
        })
        void this.triggers.recordOnceByDedupeKey(event, 'credits/credits.service')
      }
    } catch (error) {
      this.logger.warn('Événement canonique « credit_low » en échec (non-fatal)', {
        user: { id: row.user_id },
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Ce qu'il RESTE à rembourser sur ce compte : ce qui a été débité, moins ce
   * qui a déjà été rendu. `null` = le registre ne connaît aucun débit pour ce
   * compte, donc il ne peut rien arbitrer (l'appelant décidera).
   *
   * C'est ce calcul qui rend le remboursement REJOUABLE. Deux chemins rendent
   * le créneau d'un même run — le gestionnaire d'échec terminal du worker et le
   * faucheur de runs bloqués — et rien ne les empêchait de tomber tous les deux
   * sur le même compte : le pool du client gonflait alors en silence. Compter
   * sur le registre plutôt que sur une horloge ou un drapeau rend le second
   * passage naturellement sans effet.
   */
  private async pendingAnalysisRefund(ownerUserId: string, accountId: string): Promise<number | null> {
    return (await this.pendingAnalysisRefundDetail(ownerUserId, accountId))?.pending ?? null
  }

  /** {@link pendingAnalysisRefund} + l'id du débit visé, la clé d'unicité du remboursement (#4123). */
  private async pendingAnalysisRefundDetail(
    ownerUserId: string,
    accountId: string,
  ): Promise<{ pending: number; debitId: string | null } | null> {
    const rows = await this.ledger.find({
      where: { owner_user_id: ownerUserId, account_id: accountId, resource: 'analysis_slot' },
      order: { created_at: 'ASC' },
    })
    // Le DERNIER débit, pas la somme de tous : un compte se relance, et son
    // registre porte donc autant de lignes `consume_analysis` que de runs. En
    // sommant, un compte analysé (dossier livré, 8 crédits légitimement pris)
    // puis relancé et annulé rendait 16 crédits — les 8 du run annulé ET les 8
    // du dossier que le commercial garde. Un remboursement ne concerne qu'UN
    // run : celui qui vient de tomber ou d'être arrêté, c'est-à-dire le dernier
    // débité.
    /** L'horodatage exploitable d'une ligne, ou `null` quand il ne l'est pas. */
    const at = (row: CreditLedgerEntity): number | null => {
      const value = new Date(row.created_at).getTime()
      return Number.isFinite(value) ? value : null
    }
    let lastDebit: { amount: number; at: number | null; id: string | null } | null = null
    for (const row of rows) {
      if (row.kind !== 'consume_analysis') continue
      lastDebit = {
        amount: Math.abs(Number(row.delta) || 0),
        at: at(row),
        id: typeof row.id === 'string' ? row.id : null,
      }
    }
    if (!lastDebit || lastDebit.amount === 0) return null
    const debit = lastDebit
    // Les remboursements postérieurs à ce débit sont les siens. Comparaison sur
    // les DATES et non sur la position dans la liste : deux lignes écrites dans
    // la même milliseconde ne s'ordonnent pas de façon fiable. Une date
    // illisible d'un côté ou de l'autre compte le remboursement — l'erreur
    // qu'on refuse est le DOUBLE remboursement, pas le remboursement manqué.
    const refunded = rows
      .filter(row => {
        if (row.kind !== 'refund_analysis') return false
        const when = at(row)
        return when === null || debit.at === null || when >= debit.at
      })
      .reduce((sum, row) => sum + Math.abs(Number(row.delta) || 0), 0)
    return { pending: Math.max(0, debit.amount - refunded), debitId: debit.id }
  }

  /**
   * Rend le créneau d'analyse quand le run n'a pas abouti — échec terminal,
   * création de compte ratée, run fauché.
   *
   * **Il rendait 1 crédit alors que le débit en prend 8.** Une analyse complète
   * vaut `CREDIT_WEIGHTS.account_analysis` depuis la pondération du 02/08 ; le
   * remboursement, lui, était resté sur le `- 1` de l'époque « 1 crédit = 1
   * action ». Un run qui tombait — celui de VINCI ENERGIES, par exemple —
   * laissait donc 7 crédits sur le carreau pour un dossier que le commercial
   * n'a jamais vu. Le montant vient maintenant de ce qui a RÉELLEMENT été
   * débité, lu dans le registre.
   *
   * Sans ligne de débit au registre (écriture best-effort qui a échoué, ou
   * remboursement avant même que le compte n'existe), on retombe sur le coût
   * annoncé par l'appelant — et on le DIT dans les logs, parce que c'est le seul
   * cas où deux appels peuvent rembourser deux fois. Avec un débit identifié,
   * la base tranche (index unique partiel, #4123) : le second appel est un no-op.
   */
  async refundAnalysisSlot(
    userId: string,
    context?: { reason?: string; accountId?: string; cost?: number; requireLedgerDebit?: boolean },
  ): Promise<void> {
    const { ownerUserId, workspaceId, isDemo } = await this.resolveBillingSubscription(userId)
    // Demo workspace: nothing was ever debited, so there is nothing to refund
    // (a refund here would silently inflate the owner's real pool).
    if (isDemo) return

    // Audit M1 — lecture du registre, UPDATE et écriture du remboursement forment
    // UNE section critique par (propriétaire, compte) : N annulations simultanées
    // lisaient toutes « reste à rendre = débit » et rendaient N fois, en effaçant
    // le quota du mois (GREATEST(…, 0)). L'index unique de #4123 reste la garde
    // en base (plusieurs instances API) ; le verrou évite la course dans l'instance.
    const run = async (): Promise<void> => {
      const fallback = normalizeCost(context?.cost ?? DEFAULT_ANALYSIS_COST)
      let amount = fallback
      let debitId: string | null = null
      if (context?.accountId) {
        const detail = await this.pendingAnalysisRefundDetail(ownerUserId, context.accountId)
        const pending = detail?.pending ?? null
        debitId = detail?.debitId ?? null
        if (pending === null) {
          // Aucun débit au registre pour ce compte. `requireLedgerDebit` est
          // l'appel qui préfère ne RIEN rendre : une annulation peut porter sur un
          // run lancé par l'opérateur (`force`), qui n'a jamais rien coûté au
          // client — rendre le coût annoncé lui offrirait des crédits qu'il n'a
          // pas payés. Les appelants historiques gardent le repli, qui les protège
          // d'un run réellement débité dont l'écriture du registre a échoué.
          if (context.requireLedgerDebit) {
            this.logger.log('Refund skipped — no ledger debit for this account', {
              user: { id: ownerUserId },
              contexts: { refund: { accountId: context.accountId, reason: context.reason ?? null } },
            })
            return
          }
          this.logger.warn('Refund without a ledger debit — idempotence not enforced for this call', {
            user: { id: ownerUserId },
            contexts: { refund: { accountId: context.accountId, amount: fallback } },
          })
        } else {
          // Déjà remboursé : ne rien faire est la BONNE réponse, pas un échec.
          if (pending === 0) return
          amount = pending
        }
      }

      // #4123 — la lecture du registre ci-dessus ne protège pas d'un appel
      // simultané (annulation + `onFailed` du worker lisent tous deux « 8 restent
      // à rendre »). On RÉSERVE donc d'abord la ligne de remboursement, clé sur le
      // débit visé : l'index unique partiel la refuse au second arrivé, qui ne
      // touche pas au compteur. Sans id de débit (registre ancien, rattachement
      // manqué) on garde le chemin historique, non idempotent, déjà journalisé.
      const claimed = debitId
        ? await this.claimAnalysisRefund({ ownerUserId, workspaceId, userId, amount, debitId, context })
        : 'unkeyed'
      if (claimed === 'lost') {
        this.logger.log('Refund skipped — this debit was already refunded by a concurrent call', {
          user: { id: ownerUserId },
          contexts: { refund: { accountId: context?.accountId ?? null, debitId, reason: context?.reason ?? null } },
        })
        return
      }

      let affected: number | undefined
      try {
        const result = await this.credits
          .createQueryBuilder()
          .update()
          .set({ accounts_used: () => `GREATEST(accounts_used - ${amount}, 0)` })
          .where('user_id = :userId', { userId: ownerUserId })
          .execute()
        affected = result.affected
      } catch (err) {
        await this.releaseAnalysisRefundClaim(claimed)
        throw err
      }

      // Only log the refund if a row was actually decremented — GREATEST clamps at
      // 0, but `affected` still tells us the owner row existed and was touched.
      if (!affected) {
        await this.releaseAnalysisRefundClaim(claimed)
        return
      }
      if (claimed === 'unkeyed') {
        await this.recordLedger({
          ownerUserId,
          workspaceId,
          actorUserId: userId,
          kind: 'refund_analysis',
          resource: 'analysis_slot',
          delta: amount,
          reason: context?.reason ?? null,
          accountId: context?.accountId ?? null,
        })
      }
    }
    if (context?.accountId) {
      await this.withLock(`refund-analysis:${ownerUserId}:${context.accountId}`, run)
    } else {
      await run()
    }
  }

  /**
   * Réserve la ligne `refund_analysis` d'un débit : `ON CONFLICT DO NOTHING`
   * sur l'index unique partiel. `'lost'` = un autre appel l'a déjà prise.
   * Une erreur d'écriture du registre (hors conflit) ne bloque pas le
   * remboursement : on retombe sur `'unkeyed'`, comme avant (écriture de
   * registre best-effort).
   */
  private async claimAnalysisRefund(args: {
    ownerUserId: string
    workspaceId: string | null
    userId: string
    amount: number
    debitId: string
    context?: { reason?: string; accountId?: string }
  }): Promise<'unkeyed' | 'lost' | { ledgerId: string }> {
    try {
      const res = await this.ledger
        .createQueryBuilder()
        .insert()
        .values({
          owner_user_id: args.ownerUserId,
          workspace_id: args.workspaceId,
          actor_user_id: args.userId,
          kind: 'refund_analysis',
          resource: 'analysis_slot',
          delta: args.amount,
          reason: args.context?.reason ?? null,
          account_id: args.context?.accountId ?? null,
          refunds_ledger_id: args.debitId,
        })
        .orIgnore()
        .returning('id')
        .execute()
      const raw: unknown = res?.raw
      const id = Array.isArray(raw) ? (raw[0] as { id?: unknown } | undefined)?.id : undefined
      return typeof id === 'string' ? { ledgerId: id } : 'lost'
    } catch (err) {
      this.logger.error('Failed to reserve the analysis refund ledger line', {
        error: err,
        tags: { 'credits.ledger': 'write_failed', 'credits.kind': 'refund_analysis' },
      })
      return 'unkeyed'
    }
  }

  /** Rend la réservation quand le compteur n'a finalement pas bougé — le registre ne ment pas. */
  private async releaseAnalysisRefundClaim(claimed: 'unkeyed' | { ledgerId: string }): Promise<void> {
    if (claimed === 'unkeyed') return
    try {
      await this.ledger.delete({ id: claimed.ledgerId })
    } catch (err) {
      this.logger.warn('Failed to release an unused analysis refund claim', {
        error: err,
        contexts: { refund: { ledgerId: claimed.ledgerId } },
      })
    }
  }

  /**
   * Give back one (or `cost`) enrichment credit(s) after a debit that shouldn't
   * have stuck, and record a `refund_enrichment` ledger line. Symmetric with
   * {@link refundAnalysisSlot} — closes the last declared-but-unwritten ledger
   * kind so the audit trail is complete both ways.
   *
   * ⚠️ NO live call site today, BY DESIGN: both enrichment debits happen only
   * AFTER a successful Apollo lookup (`contacts.service` / `analysis-refresh`
   * .service), so there is no "debit then fail" window to refund — inventing a
   * call there would be wrong. This method is READY for a future enrichment
   * provider that debits BEFORE the result is known (debit-then-verify): wire it
   * wherever such a provider can fail after the debit. Adding credits can't go
   * negative, so no `GREATEST` clamp is needed.
   */
  async refundEnrichmentCredit(
    userId: string,
    context?: { reason?: string; accountId?: string; cost?: number },
  ): Promise<void> {
    const cost = normalizeCost(context?.cost ?? DEFAULT_ENRICHMENT_COST)
    const { ownerUserId, workspaceId, isDemo } = await this.resolveBillingSubscription(userId)
    // Demo workspace: nothing was ever debited — see refundAnalysisSlot.
    if (isDemo) return
    const result = await this.credits
      .createQueryBuilder()
      .update()
      // MONNAIE UNIQUE : on rend le crédit au pool du cycle. `GREATEST(...,0)`
      // interdit un compteur négatif si le remboursement dépasse le consommé.
      .set({ accounts_used: () => `GREATEST(accounts_used - ${cost}, 0)` })
      .where('user_id = :userId', { userId: ownerUserId })
      .execute()

    // Only log the refund if the owner row actually existed and was touched.
    if (result.affected) {
      await this.recordLedger({
        ownerUserId,
        workspaceId,
        actorUserId: userId,
        kind: 'refund_enrichment',
        resource: 'enrichment_credit',
        delta: cost,
        reason: context?.reason ?? null,
        accountId: context?.accountId ?? null,
      })
    }
  }

  /**
   * The plan catalog keyed by plan (live, DB-backed) in the historical
   * `PLAN_CONFIG` shape — the same five fields, so the public `/credits/plans`
   * response is byte-identical (the catalog's extra metadata `key`/`self_serve`/
   * `sort_order` is intentionally not surfaced here). Async now that the source is
   * the cached `plan_definitions` table rather than a const.
   */
  async getPlanConfig(): Promise<
    Record<
      string,
      {
        label: string
        price: number
        accounts_limit: number
        enrichment_credits: number
        seats: number
        extra_seat_price: number
        /** Ce que le palier OUVRE — l'écran de facturation en fait ses puces, et
         *  l'écran verrouillé s'en sert pour nommer le palier à prendre. */
        features: PlanFeatureKey[]
      }
    >
  > {
    const record = await this.planCatalog.asRecord()
    const out: Record<
      string,
      {
        label: string
        price: number
        accounts_limit: number
        enrichment_credits: number
        seats: number
        extra_seat_price: number
        features: PlanFeatureKey[]
      }
    > = {}
    for (const [key, def] of Object.entries(record)) {
      out[key] = {
        label: def.label,
        price: def.price,
        accounts_limit: def.accounts_limit,
        enrichment_credits: def.enrichment_credits,
        seats: def.seats,
        extra_seat_price: def.extra_seat_price,
        features: [...def.features],
      }
    }
    return out
  }

  /** The public top-up catalog (empty until a price grid is configured). */
  getTopupPacks(): readonly TopupPack[] {
    return TOPUP_PACKS
  }

  /** Resolve a pack by id — the single seam onto {@link TOPUP_PACKS} used by
   *  both the checkout and the webhook grant (kept private so pricing stays
   *  server-authoritative). */
  private resolveTopupPack(packId: string): TopupPack | undefined {
    // Les packs retirés restent RÉSOLVABLES : un paiement engagé avant le retrait
    // doit créditer ce qui a été payé. Ils ne sont simplement plus proposés.
    return TOPUP_PACKS.find(p => p.id === packId) ?? TOPUP_PACKS_LEGACY.find(p => p.id === packId)
  }

  /**
   * Launch a one-shot Stripe Checkout for a credit top-up. Server-authoritative:
   * the pack (and its price) is resolved from {@link TOPUP_PACKS} by id — the
   * client only names the pack, never the amount. Returns `{ url: null }` when
   * the catalog is empty / the id is unknown so the UI degrades to "bientôt
   * disponible" instead of erroring. The purchase credits the workspace OWNER's
   * pool (billing subject), stamped in Stripe metadata for the webhook.
   */
  async createTopupCheckout(userId: string, email: string, packId: string): Promise<{ url: string | null }> {
    const pack = this.resolveTopupPack(packId)
    if (!pack) {
      this.logger.warn(`Top-up requested for unknown/disabled pack: ${packId}`)
      return { url: null }
    }

    const { ownerUserId } = await this.resolveBillingSubscription(userId)
    const session = await this.stripeService.createOneShotCheckout({
      customerEmail: email,
      name: `BellumAI ${pack.label}`,
      description:
        pack.resource === 'analysis' ? `${pack.amount} analyses supplémentaires` : `${pack.amount} enrichissements`,
      unitAmount: pack.priceCents,
      // The webhook credits `userId` (the owner) and attributes the buy to the
      // actor for the ledger. `topupPackId` re-resolves the pack server-side.
      metadata: { userId: ownerUserId, topupPackId: pack.id, topupActor: userId },
      successUrl: `${this.frontendUrl}/billing?topup=success`,
      cancelUrl: `${this.frontendUrl}/billing?topup=canceled`,
    })
    return { url: session.url }
  }
}
