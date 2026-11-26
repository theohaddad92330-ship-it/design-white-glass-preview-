import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { CreditLedgerEntity } from '../../database/entities/credit-ledger.entity'
import { ProviderCostEntity } from '../../database/entities/provider-cost.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { AdminClientHealthService } from './admin-client-health.service'
import { AdminQueuesService } from './admin-queues.service'
import {
  buildDecisionQueue,
  COST_SPIKE_BASELINE_DAYS,
  emptyDecisionQueueInput,
  PLAN_MISMATCH_MONTHS,
  type BillingSubjectFacts,
  type DecisionQueueInput,
  type DecisionQueueResult,
  type MonthlyUsageFacts,
  type ProviderCostFacts,
  type QueueFacts,
  type WorkspaceFacts,
} from './decision-queue'
import {
  DECISION_QUEUE_CREDIT_CAPACITY,
  DECISION_QUEUE_FEEDBACK_TRACKING,
  type CreditCapacityReader,
  type FeedbackTrackingReader,
} from './decision-queue-tokens'
import { ManualProvisioningService } from './manual-provisioning.service'

/**
 * L'environnement mesuré pour le coût fournisseur. MÊME littéral et MÊME
 * égalité stricte que `CostAlertService` : une égalité qui exclut naturellement
 * les lignes `environment IS NULL` (écrites avant la colonne), jamais un
 * `COALESCE(environment, 'production')` qui leur ferait porter un coût de
 * production qu'elles n'ont pas.
 */
const PRODUCTION_ENVIRONMENT = 'production'

/** La fenêtre du taux d'échec d'analyse : les vingt-quatre heures écoulées. */
const ANALYSIS_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * LA FILE DE DÉCISION, telle que le cockpit du back-office la lit (#1647).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE SERVICE N'ÉCRIT RIEN, ET NE POURRA JAMAIS ÉCRIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il n'a que des repositories en LECTURE et deux jetons de lecture. Chaque
 * ligne porte UNE action, qui est un LIEN vers l'écran où le geste existe déjà,
 * avec sa propre porte et son propre journal. Ce n'est pas une convention,
 * c'est l'absence de code.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUN TRAITEMENT PÉRIODIQUE — LA FILE SE CALCULE À LA LECTURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un `@Cron` qui figerait la file chaque nuit ajouterait une table, un verrou
 * d'unicité (GA-76), un interrupteur de coupure (GA-84) et une fenêtre pendant
 * laquelle l'écran montrerait les décisions d'hier à un opérateur qui vient
 * d'émettre la facture. Il n'y a rien à amortir : tout est agrégé en SQL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CHAQUE SOURCE EST LUE SÉPARÉMENT, ET SA PANNE ÉTEINT SA NATURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une source qui échoue rend `null`, et `null` REND SA NATURE MUETTE plutôt que
 * de la faire hurler. C'est la règle de #1647 appliquée aux pannes : ce qu'on ne
 * sait pas n'alerte jamais. La panne n'est pas silencieuse pour autant — elle
 * part en `logger.error` (donc Sentry), et l'écran lit dans `natures[].unmeasured`
 * la raison pour laquelle une nature ne dit rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'EST PAS RECALCULÉ ICI — une dérivation vit à un seul endroit
 * ─────────────────────────────────────────────────────────────────────────────
 *  - `billingHealth()` (via `listManualClients`) pour les trois natures de
 *    facturation, avec ses seuils 7 / 30 / 30 / 15 jours ;
 *  - `AdminClientHealthService` pour le DERNIER GESTE d'un espace — la même
 *    lecture que l'axe « activité » de `/revenus/clients` ;
 *  - `AdminQueuesService.listQueues` pour l'âge du plus vieux job en attente ;
 *  - `creditCapacity` (par jeton) pour le plafond du cycle ;
 *  - `FeedbackService.listAllWithIssues` (par jeton) pour l'état d'un retour.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QU'ON REFUSE DE MESURER, ET POURQUOI ON LE DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `user_suspended_long` est livrée SILENCIEUSE. La suspension d'un compte vit
 * chez le fournisseur d'identité (`banned_until`, posé par `suspendUser`) et
 * AUCUNE table du produit n'enregistre la DATE de la décision. Deux chemins ont
 * été pesés et écartés :
 *  - déduire la date de `banned_until − 876 000 h` supposerait que le bannissement
 *    a bien été posé par notre constante — un bannissement posé à la main donnerait
 *    une ancienneté fausse, et une ancienneté fausse est pire qu'absente ;
 *  - énumérer tous les comptes du fournisseur à chaque lecture de la file est un
 *    appel réseau paginé sur l'ensemble des utilisateurs, dans un chemin de
 *    lecture d'écran.
 * Ce qui l'allumerait : une colonne `suspended_at` écrite par `suspendUser`, ou
 * un événement daté au journal d'accès. Tant qu'elle n'existe pas, la nature dit
 * qu'elle ne sait pas — elle n'invente pas.
 */
@Injectable()
export class DecisionQueueService {
  private readonly logger = new Logger(DecisionQueueService.name)

  constructor(
    private readonly provisioning: ManualProvisioningService,
    private readonly clientHealth: AdminClientHealthService,
    private readonly queues: AdminQueuesService,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(CreditLedgerEntity)
    private readonly ledger: Repository<CreditLedgerEntity>,
    @InjectRepository(ProviderCostEntity)
    private readonly costs: Repository<ProviderCostEntity>,
    @InjectRepository(AnalysisRunEntity)
    private readonly runs: Repository<AnalysisRunEntity>,
    @Inject(DECISION_QUEUE_CREDIT_CAPACITY) private readonly creditCapacity: CreditCapacityReader,
    @Inject(DECISION_QUEUE_FEEDBACK_TRACKING) private readonly readFeedback: FeedbackTrackingReader,
  ) {}

  /**
   * La file. `now` est un PARAMÈTRE — le contrôleur lit l'horloge, ici et nulle
   * part ailleurs, ce qui rend le service testable sans figer le temps.
   */
  async list(now: Date): Promise<DecisionQueueResult> {
    const [billing, workspaces, providerCosts, queues, analyses, feedback] = await Promise.all([
      this.billingFacts(),
      this.workspaceFacts(now),
      this.providerCostFacts(now),
      this.queueFacts(now),
      this.analysisFacts(now),
      this.feedbackFacts(),
    ])

    const input: DecisionQueueInput = {
      ...emptyDecisionQueueInput(),
      billing,
      workspaces,
      providerCosts,
      queues,
      analyses,
      feedback,
      // ⚠️ Volontairement `null` — voir le docblock de la classe. Aucune date de
      // suspension n'est enregistrée dans le produit.
      suspensions: null,
    }
    return buildDecisionQueue(input, now)
  }

  /** Les clients sur facture, avec leur santé DÉJÀ dérivée par `billingHealth`. */
  private async billingFacts(): Promise<BillingSubjectFacts[] | null> {
    try {
      const clients = await this.provisioning.listManualClients()
      return clients.map(client => ({
        workspaceId: client.workspaceId,
        label: client.workspaceName,
        health: client.health,
      }))
    } catch (error) {
      this.logger.error('File de décision : contrats sur facture illisibles', {
        error,
        tags: { 'decision_queue.source': 'billing' },
      })
      return null
    }
  }

  /**
   * Les espaces : dernier geste, essai, crédits, et consommation des deux
   * derniers mois complets.
   *
   * Le dernier geste vient d'`AdminClientHealthService` — la MÊME lecture que
   * l'axe « activité » de `/revenus/clients`. Une seconde lecture ici finirait
   * par dire d'un espace qu'il dort pendant que l'autre écran le dit actif.
   */
  private async workspaceFacts(now: Date): Promise<WorkspaceFacts[] | null> {
    try {
      const report = await this.clientHealth.list({ now })
      if (report.rows.length === 0) return []

      const ownerIds = [...new Set(report.rows.map(row => row.ownerUserId))]
      const [subs, usage] = await Promise.all([
        this.subscriptions.find({ where: { user_id: In(ownerIds) } }),
        this.monthlyUsageByOwner(ownerIds, now),
      ])
      const subByOwner = new Map(subs.map(sub => [sub.user_id, sub]))

      return report.rows.map(row => {
        const sub = subByOwner.get(row.ownerUserId) ?? null
        return {
          workspaceId: row.workspaceId,
          label: row.name,
          plan: row.plan,
          trialEndsAt: sub?.trial_end ?? null,
          lastActivityAt: row.lastActivityAt,
          creditsUsed: sub ? sub.accounts_used : null,
          // ⚠️ LE plafond qui refuse une analyse, jamais une copie.
          creditsCapacity: sub ? this.creditCapacity(sub) : null,
          cycleStart: sub?.period_start ?? null,
          // L'OFFRE souscrite, hors recharge et hors report : `plan_mismatch`
          // demande si l'usage dépasse ce que le client a acheté, pas ce qu'il a
          // rechargé pour tenir le mois.
          planAllowance: sub ? sub.accounts_limit : null,
          monthlyUsage: usage?.get(row.ownerUserId) ?? null,
        }
      })
    } catch (error) {
      this.logger.error('File de décision : espaces clients illisibles', {
        error,
        tags: { 'decision_queue.source': 'workspaces' },
      })
      return null
    }
  }

  /**
   * La consommation d'analyses des {@link PLAN_MISMATCH_MONTHS} derniers mois
   * CIVILS révolus, par propriétaire d'espace.
   *
   * ⚠️ `null` pour tout le monde quand le journal des crédits ne porte AUCUNE
   * ligne sur la fenêtre : un espace sans mouvement serait alors indiscernable
   * d'un journal non alimenté, et compter « zéro consommé » ferait passer tout
   * le monde sous son offre — un faux calme, ce qui est le symétrique du faux
   * signalement que #1647 interdit. Dès qu'UNE ligne existe, l'absence de
   * mouvement d'un espace donné est un zéro MESURÉ.
   */
  private async monthlyUsageByOwner(ownerIds: string[], now: Date): Promise<Map<string, MonthlyUsageFacts[]> | null> {
    const months = lastCompleteMonths(now, PLAN_MISMATCH_MONTHS)
    const first = months[0]
    const last = months[months.length - 1]
    if (!first || !last || ownerIds.length === 0) return null

    const since = new Date(`${first}-01T00:00:00.000Z`)
    const until = new Date(`${nextMonth(last)}-01T00:00:00.000Z`)

    const rows = await this.ledger
      .createQueryBuilder('l')
      .select('l.owner_user_id', 'ownerId')
      .addSelect("to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM')", 'month')
      .addSelect("COUNT(*) FILTER (WHERE l.kind = 'consume_analysis')", 'consumed')
      .addSelect('COUNT(*)', 'total')
      .where('l.created_at >= :since', { since })
      .andWhere('l.created_at < :until', { until })
      .groupBy('l.owner_user_id')
      .addGroupBy('month')
      .getRawMany<{ ownerId: string; month: string; consumed: string; total: string }>()

    // Le journal est-il seulement alimenté ? Aucune ligne, tous propriétaires et
    // toutes natures confondues, veut dire « on ne mesure rien », pas « personne
    // n'a consommé ». La requête ne filtre pas sur `kind` PRÉCISÉMENT pour
    // pouvoir répondre à cette question-là.
    if (rows.length === 0) return null

    const consumedByKey = new Map(rows.map(row => [`${row.ownerId}|${row.month}`, count(row.consumed)]))
    const byOwner = new Map<string, MonthlyUsageFacts[]>()
    for (const ownerId of ownerIds) {
      byOwner.set(
        ownerId,
        months.map(month => ({ month, consumed: consumedByKey.get(`${ownerId}|${month}`) ?? 0 })),
      )
    }
    return byOwner
  }

  /**
   * Le coût TARIFÉ par fournisseur et par jour, sur le dernier jour COMPLET et
   * les {@link COST_SPIKE_BASELINE_DAYS} qui le précèdent.
   *
   * ⚠️ Le jour évalué est HIER, pas aujourd'hui. Comparer une journée entamée à
   * la médiane de journées entières ferait dire « le coût s'effondre » chaque
   * matin et « il explose » chaque soir.
   *
   * ⚠️ Les jours découpés en UTC, comme les sommes elles-mêmes. Un détecteur de
   * pic ne dépend pas de l'endroit où tombe la frontière du jour ; il dépend de
   * ce que les huit jours soient découpés de la MÊME façon.
   *
   * ⚠️ `cost_usd IS NULL` = fournisseur non tarifé, pas gratuit. Ces lignes sont
   * exclues, exactement comme les agrégats de coût du dépôt le font déjà — un
   * fournisseur à crédits n'a pas de médiane en dollars, donc pas d'alerte de
   * pic, et c'est la règle de #1647 et non une lacune.
   */
  private async providerCostFacts(now: Date): Promise<ProviderCostFacts[] | null> {
    const days = lastCompleteDays(now, COST_SPIKE_BASELINE_DAYS + 1)
    const first = days[0]
    const latestDay = days[days.length - 1]
    if (!first || !latestDay) return null

    try {
      const since = new Date(`${first}T00:00:00.000Z`)
      const rows = await this.costs
        .createQueryBuilder('c')
        .select('c.provider', 'provider')
        .addSelect("to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')", 'day')
        .addSelect('SUM(c.cost_usd)', 'total')
        .where('c.created_at >= :since', { since })
        .andWhere('c.environment = :env', { env: PRODUCTION_ENVIRONMENT })
        .andWhere('c.cost_usd IS NOT NULL')
        .groupBy('c.provider')
        .addGroupBy('day')
        .getRawMany<{ provider: string; day: string; total: string }>()

      const providers = [...new Set(rows.map(row => row.provider))]
      return providers.map(provider => {
        const forProvider = new Map(
          rows.filter(row => row.provider === provider).map(row => [row.day, Number(row.total)]),
        )
        return {
          provider,
          latestDay,
          // Un jour SANS ligne tarifée chez un fournisseur qu'on sait tarifer est
          // un jour à zéro dollar — un fait, pas une lacune. Et si la moitié de
          // la fenêtre est à zéro, la médiane l'est aussi : le module se tait.
          latestUsd: forProvider.get(latestDay) ?? 0,
          baselineUsd: days.slice(0, -1).map(day => forProvider.get(day) ?? 0),
        }
      })
    } catch (error) {
      this.logger.error('File de décision : coûts fournisseurs illisibles', {
        error,
        tags: { 'decision_queue.source': 'provider_costs' },
      })
      return null
    }
  }

  /** Les files BullMQ, par la MÊME lecture que l'écran `/queues`. */
  private async queueFacts(now: Date): Promise<QueueFacts[] | null> {
    try {
      const summaries = await this.queues.listQueues(now)
      return summaries.map(summary => ({
        name: summary.name,
        waiting: summary.waiting,
        // L'union d'`AdminQueuesService` (#1662) passe telle quelle : elle porte
        // déjà la distinction qui compte ici — vide (mesuré) contre illisible.
        // Sa `raison` est volontairement LAISSÉE de côté : elle sert à l'écran
        // `/queues`, pas à décider, et la file de décision n'a pas à recopier un
        // vocabulaire qu'elle ne contrôle pas.
        oldestWaiting:
          summary.oldestWaiting.etat === 'mesure'
            ? { etat: 'mesure' as const, plusVieuxMs: summary.oldestWaiting.plusVieuxMs }
            : { etat: summary.oldestWaiting.etat },
      }))
    } catch (error) {
      this.logger.error('File de décision : files d’exécution illisibles', {
        error,
        tags: { 'decision_queue.source': 'queues' },
      })
      return null
    }
  }

  /** Les analyses des vingt-quatre dernières heures — la plateforme entière. */
  private async analysisFacts(now: Date): Promise<{ total: number; errors: number } | null> {
    try {
      const since = new Date(now.getTime() - ANALYSIS_WINDOW_MS)
      const raw = await this.runs
        .createQueryBuilder('r')
        .select('COUNT(*)', 'total')
        .addSelect("COUNT(*) FILTER (WHERE r.status = 'error')", 'errors')
        .where('r.created_at >= :since', { since })
        .getRawOne<{ total: string; errors: string }>()
      return { total: count(raw?.total), errors: count(raw?.errors) }
    } catch (error) {
      this.logger.error('File de décision : analyses illisibles', {
        error,
        tags: { 'decision_queue.source': 'analyses' },
      })
      return null
    }
  }

  /** Les retours bêta et l'état de leur suivi, par jeton. */
  private async feedbackFacts(): Promise<DecisionQueueInput['feedback']> {
    try {
      return await this.readFeedback()
    } catch (error) {
      this.logger.error('File de décision : suivi des retours illisible', {
        error,
        tags: { 'decision_queue.source': 'feedback' },
      })
      return null
    }
  }
}

/** `COUNT(*)` revient en TEXTE de Postgres. Un `Number(undefined)` vaut `NaN`. */
function count(raw: string | number | null | undefined): number {
  const value = Number(raw ?? 0)
  return Number.isFinite(value) ? value : 0
}

/** Les `n` derniers mois CIVILS révolus, du plus ancien au plus récent (`YYYY-MM`). */
export function lastCompleteMonths(now: Date, n: number): string[] {
  const months: string[] = []
  for (let back = n; back >= 1; back -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    months.push(`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`)
  }
  return months
}

/** Les `n` derniers jours RÉVOLUS, du plus ancien au plus récent (`YYYY-MM-DD`). */
export function lastCompleteDays(now: Date, n: number): string[] {
  const days: string[] = []
  for (let back = n; back >= 1; back -= 1) {
    const date = new Date(now.getTime() - back * 86_400_000)
    days.push(date.toISOString().slice(0, 10))
  }
  return days
}

/** `2026-08` → `2026-09`. */
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  const date = new Date(Date.UTC(y, m, 1))
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}
