import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { BusinessMetricSnapshotEntity } from '../../database/entities/business-metric-snapshot.entity'
import { Correlated } from '../../correlation-id/background-correlation'

/**
 * LE RAPPORT HEBDOMADAIRE DU BACK-OFFICE (#1648).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est PAS `runWeeklySummaries` (`notifications.scheduler.ts`) : celui-là
 * est un résumé PAR UTILISATEUR du produit client, opt-in, sans rapport
 * d'exploitation. Celui-ci est un SEUL rapport, pour l'ÉQUIPE qui exploite
 * BellumAI, sur un cron distinct — `notifications.scheduler.ts` n'est ni lu ni
 * modifié par ce fichier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️⚠️ LES DEUX RÈGLES QUI SE RATENT (voir `ops-weekly-report.spec.ts`)
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. Aucune interprétation, aucun conseil. Des chiffres et des faits.
 *  2. Un chiffre NON MESURABLE est ABSENT de l'email, pas affiché à zéro.
 *     Et son INVERSE, qu'on rate le plus souvent : une section MESURÉE À ZÉRO
 *     (une vraie semaine sans activité) reste NOMMÉE — l'email PART quand même,
 *     avec « 0 nouveau compte » écrit noir sur blanc plutôt qu'une section
 *     absente qui se lirait comme une panne du rapport lui-même.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-07 EST AU PLAFOND — POURQUOI CE FICHIER N'IMPORTE AUCUN AUTRE SERVICE
 * ─────────────────────────────────────────────────────────────────────────────
 * Toute donnée vient d'une ENTITÉ TypeORM injectée directement
 * (`../../database/entities/...`, exemptée de GA-07 — un schéma partagé n'est
 * pas un service) : jamais de `BusinessMetricsService.currentPosition()` ni de
 * `DecisionQueueService` importés depuis ce module. Deux dépendances RESTENT
 * cross-module (l'envoi de mail, le verrou d'exécution unique) : elles
 * passent par un JETON D'INJECTION déclaré ICI et câblé dans
 * `notifications.module.ts` (un fichier `.module.ts`, exclu du balayage
 * GA-07) — exactement le patron déjà posé par
 * `business-metrics/module-tokens.ts` pour la même raison.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « CE QUI DEMANDE UNE DÉCISION » NE DUPLIQUE PAS LA FILE (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le calcul des douze natures vit dans `apps/api/src/modules/admin/
 * decision-queue.ts` — hors périmètre de ce lot, un autre agent y travaille en
 * même temps. Le recalculer ici à partir des mêmes tables serait une SECONDE
 * dérivation du même classement (GA-26), avec le risque réel de diverger de la
 * vraie file. Cette section pointe donc vers le cockpit plutôt que de
 * redériver quoi que ce soit.
 */

/** Le jeton du transport mail. Une interface minimale — jamais `MailerService`
 *  importé directement (cross-module, voir le docblock de tête). */
export const OPS_WEEKLY_REPORT_MAILER = 'OPS_WEEKLY_REPORT_MAILER'
export interface OpsWeeklyReportMailer {
  send(input: {
    to: string
    subject: string
    heading: string
    bodyLines: string[]
    ctaUrl: string
    ctaLabel: string
  }): Promise<void>
}

/** Le jeton du verrou d'exécution unique — même patron que `SINGLETON_LOCK`
 *  dans `business-metrics/module-tokens.ts`. */
export const OPS_WEEKLY_REPORT_LOCK = 'OPS_WEEKLY_REPORT_LOCK'
export type UnderSingletonLock = (name: string, run: () => Promise<void>) => Promise<void>

/* ─────────────────────────── Le calcul PUR, sans base ni horloge ─────────────────────────── */

type WeeklyRevenueFacts =
  | { mesure: false; raison: string }
  | {
      mesure: true
      month: string
      mrrEndCents: number
      customersEnd: number
      /** `null` = premier mois de la série, aucun terme de comparaison —
       *  RESTE `null` jusqu'à l'email : voir la règle n°2 du docblock de tête. */
      mrrNewCents: number | null
      mrrExpansionCents: number | null
      mrrContractionCents: number | null
      mrrChurnedCents: number | null
    }

interface WeeklyProductFacts {
  newAccounts7d: number
  completedAnalyses7d: number
  activeAccountsNow: number
}

interface WeeklyTechnicalFacts {
  totalRuns7d: number
  failedRuns7d: number
  canceledRuns7d: number
}

export interface WeeklyOpsFacts {
  weekLabel: string
  revenue: WeeklyRevenueFacts
  product: WeeklyProductFacts
  technical: WeeklyTechnicalFacts
  cockpitUrl: string
}

function euros(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(
    cents / 100,
  )
}

function pluriel(n: number, mot: string): string {
  return `${n} ${mot}${n > 1 ? 's' : ''}`
}

/**
 * Construit le rapport — RIEN QUE des chiffres et des faits (règle n°1), un
 * chiffre non mesurable ABSENT plutôt qu'à zéro, une section mesurée à zéro
 * NOMMÉE plutôt qu'absente (règle n°2). Pur : testé dans
 * `ops-weekly-report.spec.ts` sans base ni horloge ni envoi.
 */
export function buildWeeklyOpsEmail(facts: WeeklyOpsFacts): {
  subject: string
  heading: string
  bodyLines: string[]
  ctaUrl: string
  ctaLabel: string
} {
  const revenueLines: string[] = ['REVENUS']
  if (!facts.revenue.mesure) {
    revenueLines.push(facts.revenue.raison)
  } else {
    const r = facts.revenue
    revenueLines.push(`MRR : ${euros(r.mrrEndCents)} — ${pluriel(r.customersEnd, 'client')} (mois de ${r.month}).`)
    // Un seul terme mesuré suffit à rendre TOUS les autres mesurables — ils
    // sont calculés ensemble, au même instant, par le même instantané.
    if (
      r.mrrNewCents !== null &&
      r.mrrExpansionCents !== null &&
      r.mrrContractionCents !== null &&
      r.mrrChurnedCents !== null
    ) {
      revenueLines.push(
        `Nouveau : ${euros(r.mrrNewCents)} · Expansion : ${euros(r.mrrExpansionCents)} · ` +
          `Contraction : ${euros(r.mrrContractionCents)} · Attrition : ${euros(r.mrrChurnedCents)}.`,
      )
    }
  }

  const productLines: string[] = [
    'PRODUIT',
    `${pluriel(facts.product.newAccounts7d, 'nouveau compte')} cette semaine.`,
    `${pluriel(facts.product.completedAnalyses7d, 'analyse terminée')} cette semaine.`,
    `${pluriel(facts.product.activeAccountsNow, 'compte actif')} au total.`,
  ]

  const technicalLines: string[] = [
    'TECHNIQUE',
    `${pluriel(facts.technical.totalRuns7d, 'analyse lancée')} cette semaine.`,
    `${pluriel(facts.technical.failedRuns7d, 'échec')}, ${pluriel(facts.technical.canceledRuns7d, 'annulation')}.`,
  ]

  const decisionLines: string[] = [
    'CE QUI DEMANDE UNE DÉCISION',
    'Le détail vit sur le cockpit — ce rapport ne le duplique pas.',
  ]

  return {
    subject: `BellumAI — rapport hebdomadaire — ${facts.weekLabel}`,
    heading: `Rapport hebdomadaire — ${facts.weekLabel}`,
    bodyLines: [...revenueLines, ...productLines, ...technicalLines, ...decisionLines],
    ctaUrl: facts.cockpitUrl,
    ctaLabel: 'Ouvrir le cockpit',
  }
}

/** `JJ/MM` (Europe/Paris) d'une date, pour des bornes de semaine lisibles. */
function frDate(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' }).format(date)
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/* ─────────────────────────── Le service NestJS ─────────────────────────── */

@Injectable()
export class OpsWeeklyReportService {
  private readonly logger = new Logger(OpsWeeklyReportService.name)

  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(AnalysisRunEntity) private readonly runs: Repository<AnalysisRunEntity>,
    @InjectRepository(BusinessMetricSnapshotEntity)
    private readonly snapshots: Repository<BusinessMetricSnapshotEntity>,
    @Inject(OPS_WEEKLY_REPORT_MAILER) private readonly mailer: OpsWeeklyReportMailer,
    @Inject(OPS_WEEKLY_REPORT_LOCK) private readonly underLock: UnderSingletonLock,
  ) {}

  /**
   * Les deux adresses fixes d'exploitation, JAMAIS codées en dur : voir
   * `OPS_WEEKLY_REPORT_RECIPIENTS` dans `agent_docs/env-reference.md`.
   * **Sans valeur = no-op STRICT** : `run()` s'arrête ici, avant toute lecture
   * de base et avant tout envoi — zéro appel réseau.
   */
  private recipients(): string[] {
    const raw = process.env['OPS_WEEKLY_REPORT_RECIPIENTS'] ?? ''
    return raw
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0)
  }

  /** Lundi 08:20 Europe/Paris — après `weekly-summary` (08:00), sur son PROPRE
   *  verrou : un rapport d'exploitation n'a pas besoin d'attendre les résumés
   *  clients, et une panne de l'un n'entraîne jamais l'autre. */
  @Cron('20 8 * * 1', { name: 'ops-weekly-report', timeZone: 'Europe/Paris' })
  @Correlated('cron:notifications.runOpsWeeklyReport')
  async runOpsWeeklyReport(): Promise<void> {
    await this.underLock('ops-weekly-report', async () => {
      await this.run(new Date())
    })
  }

  /** Public pour le test et pour un futur déclenchement manuel. `now` est un
   *  paramètre, jamais l'horloge lue à l'intérieur (mêmes raisons que
   *  `monthToFreeze`/`freezeLastMonth` ailleurs dans ce dépôt). */
  async run(now: Date): Promise<'sent' | 'no_recipients'> {
    const recipients = this.recipients()
    if (recipients.length === 0) {
      this.logger.log('Rapport hebdomadaire du back-office : OPS_WEEKLY_REPORT_RECIPIENTS absente — no-op.')
      return 'no_recipients'
    }

    const facts = await this.gatherFacts(now)
    const email = buildWeeklyOpsEmail(facts)

    // #1648 — ENVOYÉ MÊME SI TOUT VA BIEN : aucune condition sur le contenu.
    for (const to of recipients) {
      await this.mailer.send({ to, ...email })
    }
    this.logger.log(`Rapport hebdomadaire du back-office envoyé à ${recipients.length} destinataire(s).`)
    return 'sent'
  }

  private async gatherFacts(now: Date): Promise<WeeklyOpsFacts> {
    const weekAgo = new Date(now.getTime() - WEEK_MS)
    const weekLabel = `Semaine du ${frDate(weekAgo)} au ${frDate(now)}`

    const [revenue, product, technical] = await Promise.all([
      this.revenueFacts(),
      this.productFacts(weekAgo),
      this.technicalFacts(weekAgo),
    ])

    return {
      weekLabel,
      revenue,
      product,
      technical,
      cockpitUrl: process.env['BACKOFFICE_URL'] || 'http://localhost:3005',
    }
  }

  private async revenueFacts(): Promise<WeeklyRevenueFacts> {
    const [dernier] = await this.snapshots.find({ order: { month: 'DESC' }, take: 1 })
    if (!dernier) {
      return { mesure: false, raison: 'Aucun mois figé — voir /revenus sur le cockpit.' }
    }
    return {
      mesure: true,
      month: dernier.month,
      mrrEndCents: dernier.mrr_end_cents,
      customersEnd: dernier.customers_end,
      mrrNewCents: dernier.mrr_new_cents,
      mrrExpansionCents: dernier.mrr_expansion_cents,
      mrrContractionCents: dernier.mrr_contraction_cents,
      mrrChurnedCents: dernier.mrr_churned_cents,
    }
  }

  /**
   * Comptes NEUFS et analyses TERMINÉES cette semaine, plus le total actif.
   *
   * Filtré EN MÉMOIRE (comme `buildSummary` le fait déjà dans
   * `notifications.scheduler.ts` pour le même genre de compte hebdomadaire) :
   * une clause `where: { created_at: MoreThan(weekAgo) }` demanderait
   * d'importer l'opérateur TypeORM ici pour un gain minime, sur une table dont
   * la taille reste celle d'un back-office.
   */
  private async productFacts(weekAgo: Date): Promise<WeeklyProductFacts> {
    const rows = await this.accounts.find({ select: { status: true, created_at: true, updated_at: true } })
    const active = rows.filter(a => a.status !== 'deleted' && a.status !== 'archived')
    const nouveauxCetteSemaine = rows.filter(a => a.created_at instanceof Date && a.created_at >= weekAgo).length
    const analysesTermineesCetteSemaine = rows.filter(
      a => a.status === 'completed' && a.updated_at instanceof Date && a.updated_at >= weekAgo,
    ).length

    return {
      newAccounts7d: nouveauxCetteSemaine,
      completedAnalyses7d: analysesTermineesCetteSemaine,
      activeAccountsNow: active.length,
    }
  }

  private async technicalFacts(weekAgo: Date): Promise<WeeklyTechnicalFacts> {
    const rows = await this.runs.find({ select: { id: true, status: true, created_at: true } })
    const recent = rows.filter(r => r.created_at instanceof Date && r.created_at >= weekAgo)
    return {
      totalRuns7d: recent.length,
      failedRuns7d: recent.filter(r => r.status === 'error').length,
      canceledRuns7d: recent.filter(r => r.status === 'canceled').length,
    }
  }
}
