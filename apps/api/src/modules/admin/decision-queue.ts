import { daysBetween } from './client-health'
import type { BillingHealth } from './manual-billing-schedule'

/**
 * LA FILE DE DÉCISION DU BACK-OFFICE — pure, sans base, sans horloge (#1647).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI FAIT TOUTE LA VALEUR
 * ─────────────────────────────────────────────────────────────────────────────
 * **Une nature dont la donnée est ABSENTE ne produit AUCUNE ligne.** Pas de
 * médiane de coût sur sept jours ⇒ aucune alerte de pic. Aucun geste enregistré
 * pour un espace ⇒ aucune alerte de churn. C'est « ce qu'on ne sait pas n'alerte
 * jamais », déjà tenue dans le produit client, et c'est le contraire d'un
 * `?? 0` : une donnée absente n'est PAS un seuil franchi.
 *
 * Le raisonnement est celui que `manual-billing-schedule.ts` écrit déjà pour ses
 * sept jours de grâce — « un avertissement qui est toujours allumé n'est pas un
 * avertissement ». Un trou de données transformé en alarme éteint la file
 * entière : l'opérateur apprend à l'ignorer, et le jour où elle a raison, elle
 * ne sert plus à rien.
 *
 * Le silence n'est pas muet pour autant. {@link NatureStatus} dit, pour chacune
 * des douze, combien de sujets ont pu être MESURÉS et — quand aucun ne l'a pu —
 * POURQUOI. « Mesurée et rien trouvé » et « pas mesurable » sont deux réponses
 * différentes, et l'écran doit pouvoir les distinguer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 *  - **Il ne recalcule aucun seuil de facturation.** `invoice_missing`,
 *    `invoice_unpaid` et `commitment_ending` LISENT les alertes de
 *    `billingHealth()`. Ses quatre constantes (7 / 30 / 30 / 15 jours) ne sont
 *    ni recopiées ni relues ici : deux chemins qui refont une dérivation
 *    finissent par raconter deux histoires du même client.
 *  - **Il ne recalcule pas la capacité de crédits.** `creditCapacity` — LE
 *    plafond qui refuse une analyse — arrive déjà appliquée dans l'entrée, par
 *    le jeton que fournit `admin.module.ts`. Le recopier aurait donné deux
 *    définitions de « son plafond », dont l'une aurait oublié le report.
 *  - **Il n'écrit rien et ne décide rien.** Chaque ligne porte UNE action, qui
 *    est un LIEN vers l'écran où le geste existe déjà, avec sa propre porte et
 *    son propre journal.
 *  - **Il ne lit pas l'horloge.** `now` est un paramètre. Un test qui lit
 *    l'horloge passe à Paris et échoue dans une CI en UTC.
 *
 * ⚠️ AUCUNE MÉTRIQUE PAR PERSONNE (doctrine `c64_analytique_produit`) :
 * l'unité d'analyse est l'ESPACE. `user_suspended_long` est la seule nature qui
 * désigne quelqu'un, et c'est légitime — une suspension est un geste
 * d'administration sur un compte, pas une mesure de son comportement.
 */

/**
 * Les douze natures de #1647, dans l'ordre où l'issue les écrit.
 *
 * ⚠️ ORDRE FIGÉ. Il sert de tri secondaire et de contrat d'écran ; une valeur
 * ne se retire pas et un ajout va en fin.
 */
export const DECISION_NATURES = [
  'invoice_missing',
  'invoice_unpaid',
  'commitment_ending',
  'trial_ending',
  'churn_risk',
  'credits_exhausted',
  'cost_spike',
  'queue_stuck',
  'analysis_failing',
  'feedback_unanswered',
  'user_suspended_long',
  'plan_mismatch',
] as const

export type DecisionNature = (typeof DECISION_NATURES)[number]

// ─────────────────────────────────────────────────────────────────────────────
// LES SEUILS — ceux de l'issue, à la lettre, et RIEN d'autre
// ─────────────────────────────────────────────────────────────────────────────
// Les trois seuils de facturation n'apparaissent pas ici : ils vivent dans
// `manual-billing-schedule.ts` et cette file les LIT.

/** `trial_ending` — un essai qui se termine dans moins de trois jours. */
export const TRIAL_ENDING_DAYS = 3
/** `churn_risk` — un espace sans le moindre geste depuis plus de vingt-et-un jours. */
export const CHURN_RISK_DAYS = 21
/** `credits_exhausted` — plus de 90 % de l'enveloppe du cycle consommée. */
export const CREDITS_EXHAUSTED_RATIO = 0.9
/** `cost_spike` — un coût fournisseur au-delà de 150 % de sa médiane. */
export const COST_SPIKE_RATIO = 1.5
/** …médiane calculée sur exactement sept jours. Moins : pas de médiane, pas d'alerte. */
export const COST_SPIKE_BASELINE_DAYS = 7
/** `queue_stuck` — un job BullMQ qui attend depuis plus d'une heure. */
export const QUEUE_STUCK_MS = 60 * 60 * 1000
/** `analysis_failing` — plus de 10 % d'échecs sur vingt-quatre heures. */
export const ANALYSIS_FAILING_RATIO = 0.1
/**
 * …et sous ce nombre d'analyses, il n'y a pas de TAUX.
 *
 * Ce n'est pas un treizième seuil inventé, c'est une condition de MESURABILITÉ :
 * une erreur sur trois analyses fait 33 %, ce qui ne dit rien de la santé du
 * moteur. Le dépôt tient déjà ce raisonnement ailleurs sous le nom
 * `OBSERVABILITY_ALERT_MIN_SAMPLE`, dont le défaut est vingt ; on prend le même
 * nombre plutôt qu'un second, pour que deux écrans ne se contredisent pas sur la
 * même journée.
 */
export const ANALYSIS_FAILING_MIN_RUNS = 20
/** `feedback_unanswered` — un retour sans réponse depuis plus de quarante-huit heures. */
export const FEEDBACK_UNANSWERED_HOURS = 48
/** `user_suspended_long` — une suspension qui dure depuis plus de trente jours. */
export const USER_SUSPENDED_LONG_DAYS = 30
/** `plan_mismatch` — l'usage dépasse l'offre depuis deux mois COMPLETS. */
export const PLAN_MISMATCH_MONTHS = 2

// ─────────────────────────────────────────────────────────────────────────────
// L'ENTRÉE — des FAITS, chacun explicitement nullable
// ─────────────────────────────────────────────────────────────────────────────

/** Un client facturé sur facture. `health` vient de `billingHealth()`, jamais d'ici. */
export interface BillingSubjectFacts {
  workspaceId: string
  label: string
  /** `null` = aucune condition commerciale saisie pour cet espace — donc rien à dire. */
  health: BillingHealth | null
}

/** Ce qu'un espace consomme sur un mois CIVIL révolu. */
export interface MonthlyUsageFacts {
  /** `YYYY-MM`. */
  month: string
  consumed: number
}

/** Un espace client, vu par les cinq natures qui portent sur lui. */
export interface WorkspaceFacts {
  workspaceId: string
  label: string
  /** La clé du palier. `null` = aucun abonnement lisible. */
  plan: string | null
  /** Fin d'essai. `null` = pas d'essai, ou date jamais enregistrée. */
  trialEndsAt: string | Date | null
  /**
   * Dernier geste connu, tous membres confondus.
   *
   * ⚠️ `null` n'est PAS « trente jours sans rien faire ». Un espace dont aucun
   * geste n'a jamais été estampillé peut simplement ne pas être instrumenté —
   * le `workspace_id` de `user_actions` est encore nullable.
   */
  lastActivityAt: string | Date | null
  /** Crédits consommés sur le cycle courant. `null` = pas d'abonnement lisible. */
  creditsUsed: number | null
  /** Le PLAFOND du cycle, tel que `creditCapacity` le définit. `null` = inconnu. */
  creditsCapacity: number | null
  /** Début du cycle de quota — sert à dire « au jour N ». `null` = inconnu. */
  cycleStart: string | Date | null
  /** Le quota d'analyses du palier souscrit — le dénominateur de `plan_mismatch`. */
  planAllowance: number | null
  /**
   * Les {@link PLAN_MISMATCH_MONTHS} derniers mois COMPLETS de consommation, du
   * plus ancien au plus récent. `null` = le journal des crédits n'a rien à dire
   * sur la fenêtre — jamais « zéro consommé ».
   */
  monthlyUsage: MonthlyUsageFacts[] | null
}

/** Le coût d'UN fournisseur : le jour évalué, et les sept jours qui le précèdent. */
export interface ProviderCostFacts {
  provider: string
  /** `YYYY-MM-DD` — le jour dont {@link latestUsd} est le total. */
  latestDay: string
  /** Total TARIFÉ du jour, en dollars. `null` = aucune ligne tarifée ce jour-là. */
  latestUsd: number | null
  /** Les jours précédents, du plus ancien au plus récent. La médiane s'y calcule. */
  baselineUsd: number[]
}

/**
 * Une file BullMQ, telle qu'`AdminQueuesService` la résume déjà.
 *
 * ⚠️ `oldestWaiting` est une UNION, pas un nombre nullable, et la raison tient à
 * cette file de décision autant qu'à l'écran `/queues` : un `null` confondait
 * « file vide » (une bonne nouvelle, MESURÉE) et « Redis muet » (une panne). Les
 * traiter pareil aurait fait taire la nature sur une file qu'on ne sait plus
 * lire — c'est-à-dire annoncer que tout va bien parce qu'on ne voit plus rien,
 * exactement ce que la règle « ce qu'on ne sait pas n'alerte jamais » interdit
 * de confondre avec « il n'y a rien à signaler ».
 *
 * La forme est STRUCTURELLE et non importée : ce module reste pur, et il n'a pas
 * à connaître le service qui la produit.
 */
export interface QueueFacts {
  name: string
  waiting: number
  oldestWaiting: /** Aucun job en attente. C'est mesuré, et une file vide n'a pas d'âge. */
    | { etat: 'vide' }
    /** La file n'a pas pu être lue. Ni « saine », ni « bloquée » : inconnue. */
    | { etat: 'inconnu' }
    /** Âge du plus vieux job en attente. */
    | { etat: 'mesure'; plusVieuxMs: number }
}

/** Les analyses des vingt-quatre dernières heures — la plateforme, pas un espace. */
interface AnalysisWindowFacts {
  total: number
  errors: number
}

/** Un retour bêta et l'état de son suivi. */
export interface FeedbackFacts {
  id: string
  category: string
  createdAt: string | Date
  /**
   * A-t-il été TRAITÉ ? `null` = on n'a pas pu regarder.
   *
   * ⚠️ C'est la moitié qui compte. La base sait ce qui a été REMONTÉ ; seul le
   * suivi sait ce qui en a été FAIT. Quand le suivi est muet — intégration
   * absente, service injoignable — tous les retours ressembleraient à des
   * retours sans réponse, et la file s'allumerait entière un jour de panne.
   */
  treated: boolean | null
}

/** Un compte suspendu, et depuis quand la décision est en attente. */
interface SuspensionFacts {
  userId: string
  label: string
  suspendedAt: string | Date
}

/**
 * Tout ce dont la file a besoin. **Chaque champ vaut `null` quand la source n'a
 * pas pu être lue** — et un `null` éteint sa nature au lieu de l'allumer.
 */
export interface DecisionQueueInput {
  billing: BillingSubjectFacts[] | null
  workspaces: WorkspaceFacts[] | null
  providerCosts: ProviderCostFacts[] | null
  queues: QueueFacts[] | null
  analyses: AnalysisWindowFacts | null
  feedback: FeedbackFacts[] | null
  suspensions: SuspensionFacts[] | null
}

/** Une entrée dont AUCUNE source n'est lisible : la file est alors muette,
 *  douze fois, avec douze raisons. */
export function emptyDecisionQueueInput(): DecisionQueueInput {
  return {
    billing: null,
    workspaces: null,
    providerCosts: null,
    queues: null,
    analyses: null,
    feedback: null,
    suspensions: null,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LA SORTIE
// ─────────────────────────────────────────────────────────────────────────────

/** Gravité d'une ligne. Elle décide de l'ordre, jamais d'une couleur en dur. */
type DecisionSeverity = 'danger' | 'warning' | 'info'

/** Ce sur quoi porte la décision. Un espace, une file, un fournisseur — et
 *  une seule fois un compte. Local : il ne voyage que dans `DecisionQueueItem`. */
interface DecisionSubject {
  kind: 'workspace' | 'user' | 'queue' | 'provider' | 'feedback' | 'platform'
  id: string
  label: string
}

/** L'unique geste que la ligne propose. Un LIEN — la porte vit à l'arrivée. */
interface DecisionAction {
  label: string
  href: string
}

/** Une ligne de la file. Les cinq champs de l'issue, et rien de plus. */
interface DecisionQueueItem {
  nature: DecisionNature
  subject: DecisionSubject
  /**
   * Le détail CHIFFRÉ. **Il porte toujours au moins un nombre** — c'est ce qui
   * rend la ligne actionnable, et {@link carriesFigure} en est la porte.
   */
  detail: string
  /**
   * Depuis combien de jours pleins le fait est établi.
   *
   * `null` quand la date de bascule n'est PAS enregistrée (une enveloppe de
   * crédits ne dit pas quand elle a franchi 90 %). « Non mesuré » n'est jamais
   * « 0 » : une ligne à `0` dirait « c'est arrivé aujourd'hui », ce qui serait
   * faux.
   */
  ageDays: number | null
  severity: DecisionSeverity
  action: DecisionAction
}

/** Ce qu'une nature a pu faire — mesurer, lever, ou se taire faute de donnée. */
interface NatureStatus {
  nature: DecisionNature
  /** Combien de sujets ont pu être MESURÉS. `0` = rien de lisible. */
  measured: number
  /** Combien de lignes elle produit. */
  raised: number
  /** Pourquoi rien n'a pu être mesuré. `null` dès que `measured > 0`. */
  unmeasured: string | null
  /**
   * Ce qui n'a PAS pu être lu alors que le reste l'a été. `null` s'il ne manque
   * rien.
   *
   * ⚠️ POURQUOI CE CHAMP EXISTE, ALORS QUE `unmeasured` SEMBLAIT SUFFIRE
   * Le modèle d'origine était binaire — une nature est mesurée, ou elle ne l'est
   * pas — et il rate le cas qui arrive vraiment : une source PARTIELLEMENT
   * lisible. Trois files sur cinq répondent, deux sont muettes ; `measured` vaut
   * 3, donc `unmeasured` est `null`, donc l'écran annonce « mesuré, rien à
   * signaler » sur un périmètre amputé de 40 %.
   *
   * C'est le même défaut que celui que l'union d'`AdminQueuesService` a fermé un
   * cran plus bas, et pour la même raison : ne pas confondre « il n'y a rien »
   * avec « je ne vois rien ». Un compte juste sur ce qu'il a lu, muet sur ce
   * qu'il n'a pas lu, est un compte qui ment par omission.
   */
  partial: string | null
}

export interface DecisionQueueResult {
  items: DecisionQueueItem[]
  /** Les douze, toujours, dans l'ordre de {@link DECISION_NATURES}. */
  natures: NatureStatus[]
}

// ─────────────────────────────────────────────────────────────────────────────
// LES OUTILS — des FORMATEURS, pas des dérivations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un détail porte-t-il un chiffre ?
 *
 * ⚠️ Aucun drapeau `g` : `RegExp.test()` avec `g` est STATEFUL (il avance
 * `lastIndex`), et un même littéral réutilisé rendrait une fois vrai, une fois
 * faux. Ce défaut a déjà été payé dans ce dépôt.
 */
export function carriesFigure(detail: string): boolean {
  return /\d/.test(detail)
}

/** `3` → « 3 », `2.5` → « 2,5 ». Un formateur, pas un calcul. */
function nombre(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',')
}

/** `2026-08-01` → « 01/08/2026 ». Les dates se lisent en français. */
function jour(iso: string): string {
  const [y, m, d] = iso.split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Jours pleins qui RESTENT avant `to`. Négatif quand la date est passée.
 *
 * Ce n'est pas `daysBetween` retourné : celle-ci ramène à zéro, ce qui est juste
 * pour une ancienneté et faux pour une échéance — « il reste −2 jours » et « il
 * reste 0 jour » ne demandent pas la même décision.
 */
function daysUntil(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000)
}

/** Une durée en millisecondes, lisible : « 3 h 12 », « 45 min ». */
function duree(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}`
}

/**
 * La médiane d'une série. `null` quand la série est vide — jamais `0`, qui
 * ferait de « rien mesuré » une base de comparaison.
 */
function mediane(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? null
  const low = sorted[middle - 1]
  const high = sorted[middle]
  return low === undefined || high === undefined ? null : (low + high) / 2
}

/** Un dollar, à deux décimales, en français. */
function dollars(value: number): string {
  return `${value.toFixed(2).replace('.', ',')} $`
}

// ─────────────────────────────────────────────────────────────────────────────
// LE CALCUL
// ─────────────────────────────────────────────────────────────────────────────

/** L'accumulateur d'UNE nature : ses lignes, ce qu'elle a mesuré, et sa raison. */
class NatureBuilder {
  readonly items: DecisionQueueItem[] = []
  measured = 0

  constructor(
    readonly nature: DecisionNature,
    private readonly severity: DecisionSeverity,
  ) {}

  /** Un sujet de plus a pu être mesuré — qu'il lève une ligne ou non. */
  count(): void {
    this.measured += 1
  }

  /**
   * Une ligne de plus.
   *
   * ⚠️ **Une ligne sans détail chiffré n'entre pas.** C'est la porte de T3, et
   * elle vit ICI, à l'endroit unique où une ligne naît : la poser sur chaque
   * appelant garantirait d'en oublier un. Le refus n'est pas silencieux — la
   * nature reste comptée comme MESURÉE, si bien que l'écart entre `measured` et
   * `raised` se voit, plutôt qu'une ligne qui disparaît sans trace.
   */
  raise(line: Omit<DecisionQueueItem, 'nature' | 'severity'> & { severity?: DecisionSeverity }): void {
    if (!carriesFigure(line.detail)) return
    this.items.push({ nature: this.nature, severity: line.severity ?? this.severity, ...line })
  }

  status(reason: string, partial: string | null): NatureStatus {
    return {
      nature: this.nature,
      measured: this.measured,
      raised: this.items.length,
      unmeasured: this.measured > 0 ? null : reason,
      // Une lacune PARTIELLE se dit même quand le reste s'est lu — c'est
      // précisément le cas où `unmeasured` se tait.
      partial: this.measured > 0 ? partial : null,
    }
  }
}

/** L'ordre d'affichage : le plus grave d'abord, puis le plus ancien. */
const SEVERITY_RANK: Record<DecisionSeverity, number> = { danger: 0, warning: 1, info: 2 }
const NATURE_RANK = new Map<DecisionNature, number>(DECISION_NATURES.map((nature, index) => [nature, index]))

function compare(a: DecisionQueueItem, b: DecisionQueueItem): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  if (bySeverity !== 0) return bySeverity
  // Une ancienneté INCONNUE se range après une ancienneté mesurée : elle ne
  // vaut pas zéro jour, et elle ne vaut pas non plus l'infini.
  const ageA = a.ageDays ?? -1
  const ageB = b.ageDays ?? -1
  if (ageA !== ageB) return ageB - ageA
  const byNature = (NATURE_RANK.get(a.nature) ?? 0) - (NATURE_RANK.get(b.nature) ?? 0)
  if (byNature !== 0) return byNature
  return a.subject.label.localeCompare(b.subject.label, 'fr')
}

const espaceHref = (workspaceId: string): string => `/clients?view=esn&workspace=${encodeURIComponent(workspaceId)}`
const factureHref = (workspaceId: string): string => `/facturation?workspace=${encodeURIComponent(workspaceId)}`

/**
 * LA FILE. Une seule dérivation, lue par les écrans — pas une requête ad hoc
 * par écran, ce qui est précisément ce que #1647 demande de remplacer.
 */
export function buildDecisionQueue(input: DecisionQueueInput, now: Date): DecisionQueueResult {
  const builders: NatureBuilder[] = []
  const reasons = new Map<DecisionNature, string>()
  /** Ce qui manque alors que le reste s'est lu. Voir `NatureStatus.partial`. */
  const partials = new Map<DecisionNature, string>()

  const make = (nature: DecisionNature, severity: DecisionSeverity, reason: string): NatureBuilder => {
    const builder = new NatureBuilder(nature, severity)
    builders.push(builder)
    reasons.set(nature, reason)
    return builder
  }

  // ── Facturation — les trois natures LISENT `billingHealth`, aucune ne
  //    redéfinit ses seuils (7 / 30 / 30 / 15 jours).
  const factureManquante = make(
    'invoice_missing',
    'warning',
    'aucun client sur facture n’a de conditions commerciales saisies',
  )
  const impaye = make('invoice_unpaid', 'warning', 'aucun client sur facture n’a de conditions commerciales saisies')
  const engagement = make(
    'commitment_ending',
    'info',
    'aucun client sur facture n’a de conditions commerciales saisies',
  )

  for (const client of input.billing ?? []) {
    if (!client.health) continue
    factureManquante.count()
    impaye.count()
    engagement.count()

    for (const alert of client.health.alerts) {
      const subject = { kind: 'workspace' as const, id: client.workspaceId, label: client.label }
      if (alert.kind === 'invoice_missing' && alert.window) {
        factureManquante.raise({
          subject,
          detail: `facture non émise pour la période du ${jour(alert.window.start)} — ${nombre(alert.days)} j de retard`,
          ageDays: alert.days,
          severity: alert.severity === 'danger' ? 'danger' : 'warning',
          action: { label: 'Émettre la facture', href: factureHref(client.workspaceId) },
        })
      }
      if (alert.kind === 'invoice_unpaid') {
        const reference = alert.reference ? `facture ${alert.reference}` : 'facture'
        impaye.raise({
          subject,
          detail: `${reference} impayée depuis ${nombre(alert.days)} j`,
          ageDays: alert.days,
          action: { label: 'Relancer le paiement', href: factureHref(client.workspaceId) },
        })
      }
      // ⚠️ SEUL `commitment_ending_soon` est repris. `commitment_ended_unrenewed`
      // existe dans `billingHealth` et n'est PAS l'une des douze natures de
      // #1647 : la file rend ce que l'issue nomme, pas ce qu'on aurait pu y
      // ajouter. Le registre des factures continue de le montrer.
      if (alert.kind === 'commitment_ending_soon' && client.health.commitmentEnd) {
        engagement.raise({
          subject,
          detail: `engagement terminé dans ${nombre(alert.days)} j, le ${jour(client.health.commitmentEnd)}`,
          // Le fait « il reste moins de quinze jours » est vrai depuis
          // l'entrée dans la fenêtre — une soustraction, jamais un zéro posé.
          ageDays: Math.max(0, 15 - alert.days),
          action: { label: 'Décider du renouvellement', href: factureHref(client.workspaceId) },
        })
      }
    }
  }

  // ── Espaces clients — quatre natures.
  const essai = make('trial_ending', 'info', 'aucune date de fin d’essai enregistrée')
  const churn = make(
    'churn_risk',
    'warning',
    'aucun geste enregistré — l’inactivité ne se distingue pas d’un espace non instrumenté',
  )
  const credits = make('credits_exhausted', 'warning', 'aucune enveloppe de crédits lisible')
  const offre = make('plan_mismatch', 'info', 'aucun mouvement de crédit sur les deux derniers mois complets')

  for (const workspace of input.workspaces ?? []) {
    const subject = { kind: 'workspace' as const, id: workspace.workspaceId, label: workspace.label }

    const trialEnd = toDate(workspace.trialEndsAt)
    if (trialEnd) {
      essai.count()
      const reste = daysUntil(now, trialEnd)
      // Un essai DÉJÀ terminé n'est pas un essai « qui se termine » : #1647
      // nomme douze natures, et « essai échu » n'en est pas une.
      if (reste >= 0 && reste < TRIAL_ENDING_DAYS) {
        essai.raise({
          subject,
          detail: `essai terminé dans ${nombre(reste)} j`,
          ageDays: TRIAL_ENDING_DAYS - reste,
          action: { label: 'Proposer une offre', href: espaceHref(workspace.workspaceId) },
        })
      }
    }

    const lastActivity = toDate(workspace.lastActivityAt)
    if (lastActivity) {
      churn.count()
      // ⚠️ `daysBetween` vient de `client-health.ts` : c'est LA dérivation de
      // « depuis combien de jours ce geste date », déjà lue par l'axe activité.
      const jours = daysBetween(lastActivity, now)
      if (jours > CHURN_RISK_DAYS) {
        churn.raise({
          subject,
          detail: `aucune activité depuis ${nombre(jours)} j`,
          ageDays: jours,
          action: { label: 'Ouvrir la fiche de l’espace', href: espaceHref(workspace.workspaceId) },
        })
      }
    }

    // ⚠️ Une enveloppe à zéro n'est pas « 100 % consommée » : c'est une
    // enveloppe qu'on ne sait pas mesurer. Elle sort du dénominateur.
    if (workspace.creditsUsed !== null && workspace.creditsCapacity !== null && workspace.creditsCapacity > 0) {
      credits.count()
      const part = workspace.creditsUsed / workspace.creditsCapacity
      if (part > CREDITS_EXHAUSTED_RATIO) {
        const cycleStart = toDate(workspace.cycleStart)
        const jourDuCycle = cycleStart ? daysBetween(cycleStart, now) : null
        const cycle = jourDuCycle === null ? '' : `, au jour ${nombre(jourDuCycle)} du cycle`
        credits.raise({
          subject,
          detail:
            `${nombre(workspace.creditsUsed)} crédits consommés sur ${nombre(workspace.creditsCapacity)} ` +
            `— ${nombre(Math.round(part * 100))} %${cycle}`,
          // La date de bascule des 90 % n'est enregistrée nulle part. « Non
          // mesuré » n'est pas « aujourd'hui » : l'ancienneté reste absente.
          ageDays: null,
          action: { label: 'Créditer l’espace', href: espaceHref(workspace.workspaceId) },
        })
      }
    }

    const usage = workspace.monthlyUsage
    if (
      workspace.planAllowance !== null &&
      workspace.planAllowance > 0 &&
      usage !== null &&
      usage.length === PLAN_MISMATCH_MONTHS
    ) {
      offre.count()
      const allowance = workspace.planAllowance
      if (usage.every(month => month.consumed > allowance)) {
        offre.raise({
          subject,
          detail:
            `${usage.map(month => nombre(month.consumed)).join(' puis ')} crédits consommés sur ` +
            `${usage.map(month => month.month).join(' et ')}, pour une offre à ${nombre(allowance)}`,
          // Le fait est vrai depuis le premier des deux mois : deux mois pleins.
          ageDays: PLAN_MISMATCH_MONTHS * 30,
          action: { label: 'Revoir l’offre souscrite', href: espaceHref(workspace.workspaceId) },
        })
      }
    }
  }

  // ── Coût fournisseur — une médiane, ou rien.
  const pic = make(
    'cost_spike',
    'warning',
    `pas de médiane de coût sur ${COST_SPIKE_BASELINE_DAYS} jours — aucune alerte de pic`,
  )
  for (const serie of input.providerCosts ?? []) {
    if (serie.latestUsd === null) continue
    if (serie.baselineUsd.length !== COST_SPIKE_BASELINE_DAYS) continue
    const base = mediane(serie.baselineUsd)
    // Une médiane à zéro n'est pas une base : 150 % de rien est rien, et chaque
    // centime dépensé après une semaine creuse deviendrait une alarme.
    if (base === null || base <= 0) continue
    pic.count()
    const ratio = serie.latestUsd / base
    if (ratio > COST_SPIKE_RATIO) {
      pic.raise({
        subject: { kind: 'provider', id: serie.provider, label: serie.provider },
        detail:
          `${dollars(serie.latestUsd)} le ${jour(serie.latestDay)}, contre ${dollars(base)} de médiane ` +
          `sur ${COST_SPIKE_BASELINE_DAYS} j — ${nombre(Math.round(ratio * 100))} %`,
        ageDays: Math.max(0, daysBetween(new Date(`${serie.latestDay}T00:00:00.000Z`), now)),
        action: { label: 'Voir les coûts fournisseurs', href: '/couts' },
      })
    }
  }

  // ── Files BullMQ.
  const file = make('queue_stuck', 'danger', 'les files n’ont pas pu être lues')
  let filesIllisibles = 0
  for (const queue of input.queues ?? []) {
    // Une file illisible ne se COMPTE pas comme mesurée : la compter ferait dire
    // « 5 files mesurées, rien à signaler » alors qu'on n'en voit que trois.
    if (queue.oldestWaiting.etat === 'inconnu') {
      filesIllisibles += 1
      continue
    }
    file.count()
    // « Vide » est une valeur MESURÉE : une file sans job en attente n'a pas
    // d'âge, et ce n'est pas « 0 ms d'attente ».
    if (queue.oldestWaiting.etat === 'vide') continue
    const age = queue.oldestWaiting.plusVieuxMs
    if (age <= QUEUE_STUCK_MS) continue
    file.raise({
      subject: { kind: 'queue', id: queue.name, label: `file ${queue.name}` },
      detail:
        `${nombre(queue.waiting)} job${queue.waiting > 1 ? 's' : ''} en attente, ` +
        `le plus ancien depuis ${duree(age)}`,
      ageDays: Math.floor(age / 86_400_000),
      action: { label: 'Ouvrir la file', href: `/queues?queue=${encodeURIComponent(queue.name)}` },
    })
  }
  // Une file illisible se DIT, même quand les autres se lisent : sans cette
  // phrase, une panne Redis partielle se lirait « rien ne demande de décision ».
  if (filesIllisibles > 0) {
    const phrase = `${filesIllisibles} file(s) n’ont pas pu être lues — ni saines, ni bloquées, inconnues`
    // Les DEUX : `reasons` sert quand AUCUNE file n'a pu être lue, `partials`
    // quand certaines l'ont été. Sans le second, une panne partielle se lirait
    // « rien ne demande de décision ».
    reasons.set('queue_stuck', phrase)
    partials.set('queue_stuck', phrase)
  }

  // ── Taux d'échec d'analyse.
  const echecs = make('analysis_failing', 'danger', 'aucune analyse lisible sur 24 h')
  if (input.analyses) {
    if (input.analyses.total < ANALYSIS_FAILING_MIN_RUNS) {
      reasons.set(
        'analysis_failing',
        `${input.analyses.total} analyse(s) sur 24 h — trop peu pour un taux (minimum ${ANALYSIS_FAILING_MIN_RUNS})`,
      )
    } else {
      echecs.count()
      const part = input.analyses.errors / input.analyses.total
      if (part > ANALYSIS_FAILING_RATIO) {
        echecs.raise({
          subject: { kind: 'platform', id: 'analyses', label: 'analyses de la plateforme' },
          detail:
            `${nombre(input.analyses.errors)} échec${input.analyses.errors > 1 ? 's' : ''} sur ` +
            `${nombre(input.analyses.total)} analyses en 24 h — ${nombre(Math.round(part * 100))} %`,
          ageDays: 0,
          action: { label: 'Voir les analyses en échec', href: '/monitoring?view=runs' },
        })
      }
    }
  }

  // ── Retours bêta.
  const retours = make(
    'feedback_unanswered',
    'info',
    'l’état des retours n’a pas pu être lu — un retour non suivi ne se distingue pas d’un retour non traité',
  )
  for (const item of input.feedback ?? []) {
    if (item.treated === null) continue
    const createdAt = toDate(item.createdAt)
    if (!createdAt) continue
    retours.count()
    if (item.treated) continue
    const heures = Math.floor((now.getTime() - createdAt.getTime()) / 3_600_000)
    if (heures <= FEEDBACK_UNANSWERED_HOURS) continue
    retours.raise({
      subject: { kind: 'feedback', id: item.id, label: `retour « ${item.category} »` },
      detail: `sans réponse depuis ${nombre(heures)} h`,
      ageDays: daysBetween(createdAt, now),
      action: { label: 'Répondre au retour', href: '/feedback' },
    })
  }

  // ── Suspensions.
  const suspensions = make(
    'user_suspended_long',
    'info',
    'aucune date de suspension n’est enregistrée dans le produit — la suspension vit chez le fournisseur d’identité',
  )
  for (const suspension of input.suspensions ?? []) {
    const suspendedAt = toDate(suspension.suspendedAt)
    if (!suspendedAt) continue
    suspensions.count()
    const jours = daysBetween(suspendedAt, now)
    if (jours <= USER_SUSPENDED_LONG_DAYS) continue
    suspensions.raise({
      subject: { kind: 'user', id: suspension.userId, label: suspension.label },
      detail: `suspendu depuis ${nombre(jours)} j, sans décision`,
      ageDays: jours,
      action: { label: 'Trancher la suspension', href: `/users/${encodeURIComponent(suspension.userId)}` },
    })
  }

  const byNature = new Map(builders.map(builder => [builder.nature, builder]))
  return {
    items: builders.flatMap(builder => builder.items).sort(compare),
    natures: DECISION_NATURES.map(nature => {
      const builder = byNature.get(nature)
      /* istanbul ignore next — `make` est appelé pour les douze ; la branche
         existe pour que le type ne mente pas, pas pour être atteinte. */
      if (!builder) return { nature, measured: 0, raised: 0, unmeasured: 'nature non calculée', partial: null }
      return builder.status(reasons.get(nature) ?? 'donnée absente', partials.get(nature) ?? null)
    }),
  }
}
