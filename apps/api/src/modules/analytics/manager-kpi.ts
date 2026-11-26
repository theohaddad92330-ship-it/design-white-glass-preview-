import { FIXED_COST_FAMILIES_UNMEASURED, measurability, measuredRate, type Measurability } from '@bellum/contracts'

/**
 * LES CINQ INDICATEURS QUE LA SOURCE RÉCLAMAIT ET QUE `manager-kpi.ts`
 * (`packages/contracts/src/schemas/manager-kpi.ts`) NE CALCULAIT PAS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT DÉJÀ, ET CE QUI MANQUAIT VRAIMENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Vérifié avant d'écrire une ligne (recomptage du 29/08, `dossier-26-aout-2026.md`
 * lignes 22, 26, 27, 51 et 249 — tous confirmés « ABSENT » ou « PARTIEL ») :
 *
 *  1. **Cohorte des actifs à J+30** — aucune notion de cohorte ni de J+N dans
 *     `manager-kpi.ts` ni ailleurs dans `apps/api/src/modules/analytics`.
 *  2. **Rétention à 3 mois** — même constat : aucune rétention, aucun churn réel
 *     (`AnalyticsOverviewService` calcule un PROXY de risque de churn — inactivité
 *     depuis un seuil — explicitement documenté comme n'étant PAS une rétention).
 *  3. **Marge brute de BELLUM** — `manager-kpi.ts:863` (`gross_margin`) mesure la
 *     marge de l'ESN CLIENTE, pas la nôtre. Rien ne calcule l'économie propre de
 *     Bellum nulle part dans le dépôt.
 *  4. **Cadence d'actions validées par semaine** — les actions sont journalisées
 *     (`approval_requests`, module `action-os`), mais aucune cadence hebdomadaire
 *     n'était calculée.
 *  5. **Consultants enregistrés par commercial** — le porteur est stocké
 *     (`consultants.user_id`), mais rien ne le compte PAR commercial.
 *
 * Réutilisé plutôt que recalculé (règle « une dérivation vit à un seul
 * endroit ») :
 *  - {@link measurability} / {@link measuredRate} (`@bellum/contracts`,
 *    `schemas/measurability.ts`) — LE mécanisme déjà canonique du dépôt pour
 *    « sous le seuil, non mesurable » et « dénominateur nul, jamais 0 % ». Même
 *    patron que `matching-kpis.ts`, dans ce même dossier.
 *  - {@link FIXED_COST_FAMILIES_UNMEASURED} (`@bellum/contracts`,
 *    `billing/credit-cost.ts`) — la liste déjà écrite des postes de coût FIXE
 *    que rien, dans ce dépôt, ne mesure. La marge de Bellum les hérite tels
 *    quels plutôt que de les redéclarer une seconde fois.
 *  - La fenêtre « actif » de 14 jours déjà écrite dans le catalogue
 *    (`packages/contracts/src/schemas/manager-kpi.ts`, clé `active_members` :
 *    « actions tracée sur les 14 derniers jours ») — voir {@link ACTIVE_WINDOW_DAYS}.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DÉCISIONS PRODUIT PRISES FAUTE D'ARBITRE, LA PLUS PRUDENTE À CHAQUE FOIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Numérotées D434 à D438 (réservées à ce lot) — le détail est sur chaque
 * fonction. Aucune ne bloque la livraison ; chacune est écrite pour qu'un futur
 * lot puisse la retrancher SANS relire ce fichier en entier.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  1 · Cohorte des actifs à J+30 — 2 · Rétention à 3 mois
// ═════════════════════════════════════════════════════════════════════════════

const MS_PER_DAY = 86_400_000

/**
 * D434 — « actif » reprend le repère déjà écrit du catalogue plutôt que d'en
 * inventer un second : `active_members` (`packages/contracts/src/schemas/
 * manager-kpi.ts`) définit un membre actif comme « au moins une action tracée
 * sur les 14 derniers jours ». Deux définitions de « actif » qui vivraient
 * chacune dans leur coin divergeraient la première fois que l'une des deux
 * bouge — donc la même fenêtre sert ici, à un horizon différent (J+30, J+90)
 * plutôt qu'à J+0.
 */
export const ACTIVE_WINDOW_DAYS = 14

/**
 * Les deux repères de cohorte : à combien de jours après l'inscription on
 * regarde si la personne est toujours là. 30 = activation ; 90 = rétention à
 * trois mois. Les deux répondent à la MÊME question à un horizon différent —
 * un seul moteur les calcule, voir {@link measureCohortRetention}.
 */
export const COHORT_DAY_MARKS = { firstWeek: 7, activeCohort: 30, retention: 90 } as const

/**
 * D435 — largeur de la fenêtre de cohorte, en jours : combien de jours
 * d'inscriptions sont regroupés sous « arrivés il y a N jours ». Une semaine
 * pour le J+30 (cadence hebdomadaire, comme la majorité des indicateurs
 * « business » du catalogue) ; UN MOIS pour la rétention à 3 mois (cadence
 * trimestrielle — regrouper par semaine y donnerait une cohorte minuscule pour
 * un indicateur qu'on ne relit que quatre fois par an).
 */
export const COHORT_WINDOW_DAYS = { firstWeek: 7, activeCohort: 7, retention: 30 } as const

/**
 * Sous combien de personnes dans la cohorte le taux ne veut rien dire. Même
 * ordre de grandeur que les seuils déjà tranchés pour ce genre de question —
 * `measurability.ts` pose 10 pour le DSO, `matching-kpis.ts` pose 5 à 10 pour
 * ses propres taux : dix est bas exprès, pour écarter le bruit des tout
 * premiers jours sans attendre une significativité qu'un outil commercial
 * n'atteindra jamais.
 */
const COHORT_MEASURABILITY_MIN = 10

/** Un utilisateur, réduit à ce dont la cohorte a besoin. */
export type CohortMember = {
  userId: string
  /** Date d'inscription (`profiles.created_at`) — le point zéro de la cohorte. */
  signupAt: Date
  /** MAX(user_actions.created_at), tous les temps. `null` = aucune action
   *  jamais tracée pour cette personne — elle compte dans la cohorte (elle est
   *  bien arrivée il y a N jours), mais jamais comme « encore active ». */
  lastActionAt: Date | null
}

export type ManagerKpiRateMeasure = {
  measurability: Measurability
  /** `null` tant que la cohorte est sous le seuil, OU vide — jamais 0 %. */
  value: number | null
}

/**
 * Le moteur commun aux deux indicateurs : parmi les utilisateurs arrivés il y a
 * `dayMark` jours (± la largeur `cohortWindowDays`), quelle part est encore
 * active — c'est-à-dire a une action tracée dans les {@link ACTIVE_WINDOW_DAYS}
 * derniers jours, évalués à `now`.
 *
 * Non exporté : `measureActiveCohortAtDay30` / `measureRetentionAtThreeMonths`
 * sont les deux seules portes d'entrée, pour qu'un troisième appelant ne
 * choisisse pas ses propres repères (dérive garantie).
 */
/**
 * #1946.14 — la fenêtre « encore actif », bornée par le repère lui-même.
 *
 * Elle vaut {@link ACTIVE_WINDOW_DAYS} partout où le repère est plus long
 * qu'elle (J+30, J+90 : rien ne change, au jour près), et le repère lui-même
 * sinon. Ce n'est pas un second réglage : c'est une DÉRIVATION du premier, à
 * un seul endroit, et elle existe parce qu'un J+7 lu sur quatorze jours ne
 * mesurerait rien.
 *
 * Le détail qui l'impose : la cohorte du J+7 est celle des inscrits d'il y a 7
 * à 13 jours. Avec une fenêtre d'activité de 14 jours, l'action du JOUR DE
 * L'INSCRIPTION tombe encore dedans — l'indicateur dirait « a fait au moins un
 * geste, un jour », c'est-à-dire l'activation, et il vaudrait 100 % en
 * permanence. Borné à 7 jours, le geste compté est forcément POSTÉRIEUR à
 * l'inscription : c'est bien un usage, pas un souvenir.
 */
function activeWindowFor(dayMark: number): number {
  return Math.min(ACTIVE_WINDOW_DAYS, dayMark)
}

function measureCohortRetention(
  users: readonly CohortMember[],
  now: Date,
  dayMark: number,
  cohortWindowDays: number,
): ManagerKpiRateMeasure {
  // Fenêtre de cohorte, en ÂGE : `dayMark` jours ≤ âge < `dayMark +
  // cohortWindowDays` jours, ce qui se traduit en dates par une borne HAUTE
  // incluse et une borne BASSE exclue (`cohortStart` est le point le plus
  // ANCIEN, donc l'âge le plus GRAND) — demi-ouverte, pour qu'un utilisateur ne
  // compte jamais dans deux fenêtres adjacentes à la fois. Un utilisateur
  // inscrit il y a EXACTEMENT `dayMark` jours a bien atteint son J+`dayMark` :
  // il compte.
  const cohortEnd = new Date(now.getTime() - dayMark * MS_PER_DAY)
  const cohortStart = new Date(cohortEnd.getTime() - cohortWindowDays * MS_PER_DAY)
  const activeSince = new Date(now.getTime() - activeWindowFor(dayMark) * MS_PER_DAY)

  let cohortSize = 0
  let stillActive = 0
  for (const user of users) {
    if (user.signupAt <= cohortStart || user.signupAt > cohortEnd) continue
    cohortSize += 1
    if (user.lastActionAt != null && user.lastActionAt >= activeSince) stillActive += 1
  }

  const state = measurability(cohortSize, COHORT_MEASURABILITY_MIN)
  return {
    measurability: state,
    // `measuredRate` refuse déjà un dénominateur nul ou négatif ; le garde ici
    // (via `measurability`) est ANTÉRIEUR — il refuse aussi une cohorte trop
    // petite pour que le pourcentage veuille dire quelque chose, pas seulement
    // une cohorte vide.
    value: state.measurable ? measuredRate(stillActive, cohortSize) : null,
  }
}

/**
 * #1946.14 · Usage à J+7 — « Instrumenter : usage J+7 et J+30 ».
 *
 * FORMULE — numérateur : utilisateurs arrivés il y a 7 (± 7) jours dont la
 * dernière action tracée date de moins de 7 jours ({@link activeWindowFor}) ;
 * dénominateur : tous les utilisateurs arrivés il y a 7 (± 7) jours. Même
 * moteur, même seuil de mesurabilité et même refus du 0 % que les deux repères
 * déjà en place — un troisième repère qui choisirait ses propres règles
 * divergerait au premier changement.
 *
 * ⚠️ Ce que ce taux ne dit PAS : il ne parle de personne. Il compte des
 * inscrits dans une cohorte, jamais un utilisateur nommé, et il ne descend
 * jamais à l'espace client (doctrine `c64_analytique_produit`).
 */
export function measureActiveCohortAtDay7(users: readonly CohortMember[], now: Date): ManagerKpiRateMeasure {
  return measureCohortRetention(users, now, COHORT_DAY_MARKS.firstWeek, COHORT_WINDOW_DAYS.firstWeek)
}

/**
 * 1 · Cohorte des actifs à J+30.
 *
 * FORMULE — numérateur : utilisateurs arrivés il y a 30 (± 7) jours dont la
 * dernière action tracée date de moins de 14 jours ; dénominateur : tous les
 * utilisateurs arrivés il y a 30 (± 7) jours. EXCLU du dénominateur : rien —
 * quiconque est arrivé dans la fenêtre COMPTE, même sans avoir jamais rien
 * fait depuis (c'est justement ce que l'indicateur mesure).
 */
export function measureActiveCohortAtDay30(users: readonly CohortMember[], now: Date): ManagerKpiRateMeasure {
  return measureCohortRetention(users, now, COHORT_DAY_MARKS.activeCohort, COHORT_WINDOW_DAYS.activeCohort)
}

/**
 * 2 · Rétention à 3 mois.
 *
 * FORMULE — identique à {@link measureActiveCohortAtDay30}, à un horizon de 90
 * jours et une cohorte élargie à un mois d'inscriptions (voir D435).
 */
export function measureRetentionAtThreeMonths(users: readonly CohortMember[], now: Date): ManagerKpiRateMeasure {
  return measureCohortRetention(users, now, COHORT_DAY_MARKS.retention, COHORT_WINDOW_DAYS.retention)
}

// ═════════════════════════════════════════════════════════════════════════════
//  3 · Marge brute de BELLUM (pas celle de l'ESN cliente)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Un montant, avec sa devise — jamais l'un sans l'autre. `cents` est TOUJOURS
 * en centimes de `currency`, même quand la source native (`provider_costs.
 * cost_usd`) est en unités : convertir en centimes est une multiplication par
 * 100, pas une conversion de devise.
 */
type ManagerKpiMoney = { currency: string; cents: number }

type BellumGrossMarginInput = {
  /** Le revenu de la fenêtre. AUJOURD'HUI : l'estimation MRR déjà rendue par
   *  `AnalyticsOverviewService.estimateMrrCents` (abonnements en cours × grille
   *  de prix) — importée, jamais recalculée. Ce N'EST PAS un encaissement réel :
   *  ce service le documente déjà lui-même ainsi (« a point-in-time estimate...
   *  NOT invoiced revenue »). Aucune table de ce dépôt ne conserve ce qui a été
   *  RÉELLEMENT prélevé par Stripe — voir la note de fin de fichier. */
  revenue: ManagerKpiMoney
  /** Le coût fournisseurs/modèles TARIFÉ de la même fenêtre — la somme des
   *  lignes de `provider_costs` qui ont un `cost_usd` non nul, déjà agrégée par
   *  `ProviderCostService.overview` / `cost-alert.ts`. Coût VARIABLE
   *  uniquement : voir {@link FIXED_COST_FAMILIES_UNMEASURED}. */
  variableCost: ManagerKpiMoney
  /** Lignes de coût SANS prix, exclues du total — jamais absorbées comme des
   *  zéros (même discipline que `cost-alert.ts` / `credit-cost.ts`). */
  untariffedCostLines: number
  /** Combien de comptes payants sur la fenêtre — le garde-fou d'échantillon :
   *  une marge sur un seul client n'est pas une marge d'entreprise. */
  paidAccounts: number
}

export type BellumGrossMarginResult = {
  measurability: Measurability
  /** `null` tant que non mesurable — devises incomparables, échantillon trop
   *  petit, ou revenu nul sur la fenêtre. JAMAIS 0 % par défaut. */
  marginRate: number | null
  /**
   * D436 — pourquoi le calcul a été refusé, quand il l'a été.
   *
   * `currency_mismatch` : le revenu et le coût ne sont pas dans la même
   * devise, et **Bellum ne convertit rien** — la règle est déjà écrite,
   * ailleurs, pour une raison identique (`packages/contracts/src/billing/
   * currencies.ts` : « un taux de change appliqué à la volée... fait diverger
   * la comptabilité de ce que le client a vu »). Le revenu de ce dépôt est en
   * EUR (grille de prix des offres) ; le registre des coûts fournisseurs est
   * en USD (`PROVIDER_UNIT_COST_*`, voir `env-reference.md`) — TANT qu'aucune
   * des deux sources n'est réellement dans l'autre devise, cet indicateur rend
   * `currency_mismatch` en production. Ce n'est pas un bug de ce fichier :
   * c'est un trou de données nommé plutôt que masqué par une conversion
   * inventée. `null` en dehors de ce cas.
   */
  blockedReason: 'currency_mismatch' | null
  /** Les postes de coût FIXE que ce calcul EXCLUT structurellement — toujours
   *  la même liste, importée. Ce que ce fichier rend est une marge sur coût
   *  VARIABLE (contribution), jamais une marge complète : hébergement,
   *  observabilité, outillage interne et CRM interne ne sont dans AUCUNE table
   *  de ce dépôt. */
  fixedCostsExcluded: typeof FIXED_COST_FAMILIES_UNMEASURED
  /** Vrai dès qu'une ligne de coût n'a pas de prix : le coût utilisé est un
   *  PLANCHER, la marge réelle est donc AU PLUS celle qui est rendue. */
  isFloor: boolean
}

/**
 * 3 · Marge brute de BELLUM — PAS celle de l'ESN cliente (`gross_margin` du
 * catalogue, `manager-kpi.ts:863`, mesure l'autre chose).
 *
 * FORMULE — (revenu − coût fournisseurs/modèles TARIFÉ) ÷ revenu, sur la même
 * fenêtre. EXCLU du calcul et nommé à part : les lignes de coût sans prix
 * (`untariffedCostLines`) et les quatre familles de coût FIXE que rien ne
 * mesure (`fixedCostsExcluded`) — les additionner comme des zéros ferait
 * passer une marge FAUSSE dans le sens rassurant, exactement le défaut que
 * `credit-cost.ts` refuse déjà pour le coût d'un crédit.
 */
export function measureBellumGrossMargin(input: BellumGrossMarginInput): BellumGrossMarginResult {
  const isFloor = input.untariffedCostLines > 0
  const fixedCostsExcluded = FIXED_COST_FAMILIES_UNMEASURED

  if (input.revenue.currency !== input.variableCost.currency) {
    return {
      // Une mesure bloquée par une devise incomparable n'a pas d'échantillon à
      // proprement parler : elle n'a jamais atteint le point où compter les
      // comptes payants aurait un sens. `observed`/`required` valent 0/1 pour
      // que la forme reste celle de `Measurability`, jamais « mesurable ».
      measurability: { measurable: false, observed: 0, required: 1, missing: 1 },
      marginRate: null,
      blockedReason: 'currency_mismatch',
      fixedCostsExcluded,
      isFloor,
    }
  }

  // Même seuil que la marge moyenne d'un portefeuille de missions
  // (`MEASURABILITY_THRESHOLDS.averageMargin` — importé plus bas) : c'est la
  // MÊME catégorie de question (une moyenne/marge a besoin d'assez
  // d'observations), juste sur notre propre économie plutôt que sur celle de
  // l'ESN cliente.
  const state = measurability(input.paidAccounts, MEASURABILITY_MIN_PAID_ACCOUNTS)
  return {
    measurability: state,
    marginRate: state.measurable
      ? measuredRate(input.revenue.cents - input.variableCost.cents, input.revenue.cents)
      : null,
    blockedReason: null,
    fixedCostsExcluded,
    isFloor,
  }
}

/**
 * Réutilise le seuil déjà tranché pour « une moyenne/marge a besoin d'assez
 * d'observations » (`MEASURABILITY_THRESHOLDS.averageMargin` — la marge
 * moyenne d'un portefeuille de MISSIONS) plutôt que d'en inventer un nouveau :
 * c'est la même question de fond, posée sur l'économie de Bellum au lieu de
 * celle de l'ESN cliente. Recopié en valeur (et non importé comme référence)
 * pour ne pas faire dépendre ce fichier de la forme interne de
 * `MEASURABILITY_THRESHOLDS`, dont la clé `averageMargin` documente un AUTRE
 * indicateur — un import direct laisserait croire que les deux clés sont la
 * même mesure alors qu'elles partagent seulement leur seuil.
 */
const MEASURABILITY_MIN_PAID_ACCOUNTS = 5

// ═════════════════════════════════════════════════════════════════════════════
//  4 · Cadence d'actions validées par semaine
// ═════════════════════════════════════════════════════════════════════════════

const MS_PER_WEEK = 7 * MS_PER_DAY

/** Combien de semaines complètes la cadence couvre par défaut. */
const DEFAULT_CADENCE_WEEKS = 8

/** Une demande d'approbation, réduite à ce que la cadence lit
 *  (`approval_requests` — module `action-os`, hors périmètre d'écriture de ce
 *  lot, lu en lecture seule comme le fait déjà tout ce fichier ailleurs pour
 *  `product_events` / `credit_ledger` / `subscriptions`). */
export type ApprovalRequestRecord = {
  state: 'pending' | 'approved' | 'rejected' | 'expired'
  /** `null` tant qu'aucune décision n'a été rendue. */
  decidedAt: Date | null
}

export type WeeklyValidatedActions = {
  /** Lundi 00:00 UTC de la semaine, `YYYY-MM-DD`. */
  weekStart: string
  /** Lundi suivant, exclu — `YYYY-MM-DD`. */
  weekEnd: string
  validated: number
}

/** Le lundi 00:00 UTC de la semaine ISO qui contient `date`. */
function mondayUtc(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay() // 0 = dimanche … 6 = samedi
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/**
 * D437 — ce qui compte comme « validée » : `approval_requests.state ===
 * 'approved'`, à sa date de décision (`decided_at`). C'est la porte que la
 * doctrine décrit pour un geste de SYSTÈME (« demande visible, prévisualisation
 * FIGÉE, expiration 3 jours ») — un geste d'UTILISATEUR est auto-approuvé et
 * n'ouvre jamais de ligne dans cette table (« le clic EST la décision »), donc
 * il n'apparaît structurellement pas ici. Élargir la définition aux gestes
 * auto-approuvés demanderait de lire `user_actions` en plus et de définir ce
 * qu'« validée » veut dire pour un geste que personne n'a eu à approuver — une
 * décision produit que ce lot NE TRANCHE PAS (voir le rapport de fin de lot).
 *
 * 4 · Cadence d'actions validées par semaine.
 *
 * FORMULE — par semaine ISO (lundi 00:00 UTC → lundi suivant) : COUNT(
 * approval_requests WHERE state = 'approved' AND decided_at DANS la semaine).
 * C'est un COMPTE, pas un taux : zéro validation une semaine donnée est un
 * FAIT vrai (rien ne s'est passé), pas une mesure ratée — ce fichier ne lui
 * applique donc PAS `measurability`/`measuredRate`, qui protègent des
 * DIVISIONS contre un dénominateur vide. Il n'y a rien à diviser ici.
 *
 * La semaine EN COURS (celle qui contient `now`) n'entre JAMAIS dans la série :
 * elle est incomplète, et la compter ferait lire un ralentissement qui n'a pas
 * eu lieu — seulement une semaine pas encore finie.
 */
export function computeValidatedActionCadence(
  approvals: readonly ApprovalRequestRecord[],
  now: Date,
  weeks: number = DEFAULT_CADENCE_WEEKS,
): readonly WeeklyValidatedActions[] {
  const parsedWeeks = Math.trunc(weeks)
  const safeWeeks = Number.isFinite(parsedWeeks) ? Math.min(52, Math.max(1, parsedWeeks)) : DEFAULT_CADENCE_WEEKS
  const currentWeekStart = mondayUtc(now)

  const buckets: WeeklyValidatedActions[] = []
  const indexByStart = new Map<string, number>()
  for (let i = safeWeeks; i >= 1; i--) {
    const start = new Date(currentWeekStart.getTime() - i * MS_PER_WEEK)
    const end = new Date(start.getTime() + MS_PER_WEEK)
    indexByStart.set(isoDate(start), buckets.length)
    buckets.push({ weekStart: isoDate(start), weekEnd: isoDate(end), validated: 0 })
  }

  for (const approval of approvals) {
    if (approval.state !== 'approved' || approval.decidedAt == null) continue
    const bucketStart = isoDate(mondayUtc(approval.decidedAt))
    const index = indexByStart.get(bucketStart)
    // `undefined` = hors fenêtre (avant les `weeks` demandées, ou dans la
    // semaine en cours) : ni l'un ni l'autre n'entre dans la série rendue.
    if (index != null) buckets[index]!.validated += 1
  }

  return buckets
}

// ═════════════════════════════════════════════════════════════════════════════
//  5 · Consultants enregistrés par commercial
// ═════════════════════════════════════════════════════════════════════════════

/** Un consultant, réduit à ce que le compte par commercial lit. */
export type ConsultantRegistration = {
  /** `consultants.user_id` — le porteur de la fiche (le commercial qui l'a
   *  enregistrée), pas le scope de lecture (`workspace_id`). */
  userId: string
  createdAt: Date
}

export type ConsultantsRegisteredByRep = {
  userId: string
  registered: number
}

/**
 * D438 — le compte ne liste QUE les commerciaux ayant enregistré AU MOINS un
 * consultant sur la fenêtre ; il ne complète pas à zéro les commerciaux
 * absents de `consultants`. Compléter à zéro demanderait de savoir QUI sont
 * tous les commerciaux de l'espace (une jointure vers l'effectif / les rôles
 * d'espace), une donnée hors du périmètre de fichiers de ce lot
 * (`apps/api/src/modules/analytics/**` et `packages/contracts/src/schemas/`
 * seulement) — voir le rapport de fin de lot. Un commercial absent d'ici n'est
 * donc pas prouvé à zéro par ce calcul ; il est seulement absent de la liste.
 *
 * 5 · Consultants enregistrés par commercial.
 *
 * FORMULE — par commercial (`consultants.user_id`) : COUNT(consultants créés
 * dans la fenêtre). Comme la cadence (§4), c'est un COMPTE et non un taux :
 * aucun garde `measurability` ici, pour la même raison — zéro consultant
 * enregistré par une personne sur une fenêtre est un fait, pas une mesure
 * ratée.
 */
export function computeConsultantsRegisteredByRep(
  consultants: readonly ConsultantRegistration[],
  window: { from: Date; to: Date },
): readonly ConsultantsRegisteredByRep[] {
  const counts = new Map<string, number>()
  for (const consultant of consultants) {
    if (consultant.createdAt < window.from || consultant.createdAt >= window.to) continue
    counts.set(consultant.userId, (counts.get(consultant.userId) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([userId, registered]) => ({ userId, registered }))
    .sort((a, b) => b.registered - a.registered || a.userId.localeCompare(b.userId))
}
