import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import {
  OBSERVABILITY_ALERT_SETTINGS,
  breaches,
  measureAbnormalRefundCount,
  measureAuthorizationDeniedCount,
  measureChatResponseP95Ms,
  measureErrorRatePercent,
  measureHallucinationRatePercent,
  measureLatencyP95Ms,
  measureLeakDetectedCount,
  measureMassExportCount,
  measureThreatSuspicionCount,
  measureNoOutcomeRatePercent,
  observabilityAlertsDisabled,
  readPositiveNumber,
  type AlertMeasure,
  type ChatTurnSample,
  type DataExportEventSample,
  type JudgeSample,
  type LeakEventSample,
  type RefundEventSample,
  type RunSample,
  type SecurityEventSample,
  type ThreatEventSample,
} from './observability-alerts'
import { REASONING_ALERT_WINDOW_DAYS, buildReasoningQualityReport } from './reasoning-quality'
import { readGenericJudgements, readReasoningTurns } from './reasoning-quality.service'

/** Fenêtre observée : la journée écoulée — la même que l'alerte de coût. */
const WINDOW_MS = 24 * 60 * 60 * 1000
/** Borne de lecture — une alerte ne doit pas devenir elle-même un coût. */
const MAX_ROWS = 20_000

/**
 * Les alertes portées par ce passage : les quatre exigées par
 * `LANGFUSE_OBSERVABILITY_REQUIREMENTS.md`, plus `chat_latency` — le
 * troisième seuil SLO du chat (#2441.4, LAU-FINAL-155), d'une source
 * DIFFÉRENTE, ajouté ici parce qu'il a la même forme (un p95 de durée) et le
 * même canal (Sentry via `logger.error`), pas parce qu'il appartenait à la
 * même liste.
 */
// Épopée #2879 (#2442.14 / #2442.15) — SIXIÈME clé, `authorization_denied` :
// le premier compteur de SÉCURITÉ du dépôt (accès refusés, 401/403), une unité
// neuve (`count`, jamais `%` ni `ms` — voir `measureAuthorizationDeniedCount`).
// SEPTIÈME, `abnormal_refund` (#2442.15) — même unité `count`, même chokepoint
// mécanique (une écriture unique, `credit_ledger.kind = 'refund_enrichment'`,
// voir `measureAbnormalRefundCount`).
// HUITIÈME, `leak_detected` (28/09/2026, lot V36) — même unité `count`, même
// chokepoint mécanique (une écriture unique, `security_events.kind =
// 'leak_detected'`, voir `measureLeakDetectedCount`).
type AlertKey =
  | 'latency'
  | 'error'
  | 'hallucination'
  | 'no_outcome'
  | 'chat_latency'
  | 'authorization_denied'
  | 'abnormal_refund'
  | 'leak_detected'
  | 'cross_tenant_suspected'
  | 'injection_suspected'
  // #3223.5 (#3198) — la QUALITÉ du raisonnement, sur 3 jours (voir `checkReasoning`).
  | 'reasoning_after_budget'
  | 'reasoning_dataforge_absent'
  | 'reasoning_internal_unused'
  | 'reasoning_nogo_no_alternative'
  | 'permission_escalated'
  | 'mass_export'
  | 'reasoning_false_success'
  | 'reasoning_wrong_zero'
  | 'reasoning_market_memory_uncited'
  // #3223 (lot R17) — reste de l'épopée #3223 : correction sans changement de
  // résultat, GO sur grand compte sans accès (voir `checkReasoning`).
  | 'reasoning_correction_without_result_change'
  | 'reasoning_go_large_account_without_access'
  // #3223 (décision Louis 11/10/2026) — juge IA évalué, muet tant qu'il est non fiable.
  | 'reasoning_generic_rise'

type AlertDefinition = {
  key: AlertKey
  /** Ce que l'opérateur lit dans Sentry. */
  label: string
  unit: 'ms' | '%' | 'count'
  measure: AlertMeasure
  threshold: number
}

/**
 * Les quatre alertes d'observabilité qui manquaient — **latence, erreur,
 * hallucination, no-outcome** — plus une CINQUIÈME ajoutée le 24/09
 * (`chat_latency`, #2441.4) : le troisième seuil SLO du chat
 * (LAU-FINAL-155), d'une source différente de
 * `LANGFUSE_OBSERVABILITY_REQUIREMENTS.md` mais rangée ici parce qu'elle a la
 * même forme (un p95 de durée sur 24 h) et le même canal (Sentry).
 *
 * SIXIÈME, ajoutée le 26/09 (`authorization_denied`, épopée #2879 /
 * #2442.14-.15) : le premier compteur de SÉCURITÉ du dépôt, d'une NATURE
 * différente des cinq précédentes — un COMPTE, jamais un taux (voir
 * `measureAuthorizationDeniedCount`) — rangée ici pour le même canal.
 *
 * Le coût, lui, est porté par {@link CostAlertService} depuis le
 * 03/08 et n'est PAS repris ici : un réglage et une dérivation vivent à un
 * seul endroit (GA-26). Les cinq exigences de
 * `LANGFUSE_OBSERVABILITY_REQUIREMENTS.md` sont donc couvertes par deux
 * passages, pas par un service qui recopierait le premier.
 *
 * ## Ce que ce service ajoute, et ce qu'il n'ajoute pas
 *
 * Il n'invente **aucun calcul** : la latence, le taux d'erreur et le verdict du
 * juge existaient déjà dans le dépôt. Ils étaient lisibles au back-office, et
 * seulement là — c'est-à-dire qu'il fallait aller les CHERCHER. Ce service pose
 * la question manquante : **quelqu'un est-il PRÉVENU ?**
 *
 * ## Pourquoi `logger.error`, et pas une notification
 *
 * Convention du dépôt : `logger.error` est le chemin de capture Sentry (jamais
 * `Sentry.captureException` en direct), et Sentry envoie déjà un e-mail sur une
 * erreur neuve. Un `warn` ne partirait pas — c'est la leçon du bloc agenda resté
 * « vide » pendant des jours. Aucune notification côté application : la qualité
 * mesurée est une donnée d'exploitation (arbitrage Louis du 03/08), affichée à
 * un utilisateur elle deviendrait une promesse chiffrée.
 *
 * ## Ce qui n'a pas pu être mesuré est DIT — et par le canal qui PRÉVIENT
 *
 * Une alerte muette se lit « tout va bien ». À chaque passage, les mesures
 * impossibles sortent en une ligne `log` NOMMÉE, avec leur raison et leur
 * échantillon — pour qu'un opérateur qui ne voit aucune alerte sache si c'est
 * parce que tout va bien, ou parce qu'on n'a rien pu regarder.
 *
 * ⚠️ **Cette ligne `log` ne suffisait pas, et c'est la correction du 30/08.**
 * `SentryWinstonTransport` est instancié sans options (`logger.service.ts`),
 * donc à `level: 'error'` : un `log` (winston `info`) ne franchit jamais le
 * transport. La ligne qui devait distinguer « tout va bien » de « on n'a rien
 * pu regarder » n'était donc lisible qu'en OUVRANT les journaux — c'est-à-dire
 * en allant la chercher, le geste exact que ce service existe pour supprimer.
 * Sous vingt observations par jour, les quatre alertes se taisent toutes ; sur
 * un produit jeune c'est le cas NOMINAL, et personne ne le savait.
 *
 * La cécité part donc aussi en `logger.error`, avec deux précautions reprises
 * de {@link StatusMonitorService}, qui a déjà tranché le même arbitrage :
 *
 *  - **une fois par CHANGEMENT d'état** ({@link lastBlindSignature}), jamais à
 *    chaque passage — une alerte identique tous les matins apprend à ignorer
 *    les alertes ;
 *  - **un message STABLE**, sans aucun chiffre. Sentry regroupe par texte : un
 *    échantillon dans le message créerait une issue neuve et un e-mail de plus
 *    chaque matin, et l'anti-bruit se retournerait en bruit. Les chiffres vont
 *    au `contexts`, qui n'entre pas dans le regroupement.
 *
 * La mémoire est PAR PROCESSUS, comme celle du moniteur de statut : après un
 * redéploiement, une cécité en cours se redit une fois. C'est voulu — un signal
 * frais après un redémarrage est exactement ce qu'un opérateur veut.
 *
 * ## Pourquoi ce service n'a NI `@Cron` NI verrou
 *
 * Il est appelé par le passage du matin de {@link CostAlertService} (07:05
 * Europe/Paris), sous LE MÊME verrou singleton. Trois raisons, dans cet ordre :
 *
 * 1. **Les cinq alertes sont un seul paquet d'exigences.** Un passage unique,
 *    un verrou, une corrélation : deux passages à quinze minutes d'écart, avec
 *    deux verrous Redis, auraient été plus de pièces pour le même résultat.
 * 2. **Une alerte en double s'ignore aussi vite qu'une alerte fausse.** Le
 *    verrou est obligatoire, et il en existe déjà un qui couvre exactement
 *    cette fenêtre.
 * 3. **GA-07 gèle les imports de service à service entre modules** : prendre
 *    `withSingletonLock` ici en aurait ajouté un. Ce n'est pas la raison
 *    principale, mais la garde a posé la bonne question — et la réponse est
 *    qu'un second passage n'apportait rien.
 */
@Injectable()
export class ObservabilityAlertsService {
  private readonly logger = new Logger(ObservabilityAlertsService.name)

  /**
   * Les alertes aveugles du dernier passage, `null` quand tout était mesurable.
   * Sert UNIQUEMENT à ne pas redire la même cécité — jamais à décider si une
   * alerte part.
   */
  private lastBlindSignature: string | null = null

  constructor(@InjectRepository(AnalysisRunEntity) private readonly runs: Repository<AnalysisRunEntity>) {}

  /**
   * Le passage quotidien — appelé par le tick du matin, DÉJÀ sous verrou.
   *
   * `now` est passé par l'appelant : deux mesures de la même journée doivent
   * regarder la même fenêtre.
   */
  async runDailyCheck(now: Date = new Date()): Promise<void> {
    if (observabilityAlertsDisabled()) {
      this.logger.log('Alertes d’observabilité désactivées (OBSERVABILITY_ALERTS_DISABLED=true) — passage ignoré')
      return
    }
    await this.check(now)
  }

  /** Le passage lui-même — exposé pour être déclenché à la main en recette. */
  async check(now: Date = new Date()): Promise<void> {
    const since = new Date(now.getTime() - WINDOW_MS)
    const minSample = readPositiveNumber(
      process.env[OBSERVABILITY_ALERT_SETTINGS.minSample.env],
      OBSERVABILITY_ALERT_SETTINGS.minSample.fallback,
    )

    const runs = await this.readRuns(since)
    const judges = await this.readJudgeVerdicts(since)
    const chatTurns = await this.readChatTurns(since)
    const securityEvents = await this.readSecurityEvents(since)
    const refundEvents = await this.readRefundEvents(since)
    const leakEvents = await this.readLeakEvents(since)
    const crossTenantEvents = await this.readThreatEvents('cross_tenant_suspected', since)
    const injectionEvents = await this.readThreatEvents('injection_suspected', since)
    const escalationEvents = await this.readThreatEvents('permission_escalated', since)
    const dataExportEvents = await this.readDataExportEvents(since)

    const definitions: AlertDefinition[] = [
      {
        key: 'latency',
        label: 'Latence des analyses (p95 sur 24 h)',
        unit: 'ms',
        measure: measureLatencyP95Ms(runs, minSample),
        threshold:
          readPositiveNumber(
            process.env[OBSERVABILITY_ALERT_SETTINGS.latencyP95Seconds.env],
            OBSERVABILITY_ALERT_SETTINGS.latencyP95Seconds.fallback,
          ) * 1000,
      },
      {
        key: 'error',
        label: 'Analyses en échec (sur 24 h)',
        unit: '%',
        measure: measureErrorRatePercent(runs, minSample),
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.errorRatePercent.env],
          OBSERVABILITY_ALERT_SETTINGS.errorRatePercent.fallback,
        ),
      },
      {
        key: 'hallucination',
        label: 'Dossiers signalés par le juge anti-hallucination (sur 24 h)',
        unit: '%',
        measure: measureHallucinationRatePercent(judges, minSample),
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.hallucinationRatePercent.env],
          OBSERVABILITY_ALERT_SETTINGS.hallucinationRatePercent.fallback,
        ),
      },
      {
        key: 'no_outcome',
        label: 'Analyses sans aucune issue (sur 24 h)',
        unit: '%',
        measure: measureNoOutcomeRatePercent(runs, now, minSample),
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.noOutcomeRatePercent.env],
          OBSERVABILITY_ALERT_SETTINGS.noOutcomeRatePercent.fallback,
        ),
      },
      {
        // #2441.4 — le troisième seuil SLO du chat (LAU-FINAL-155) ; les deux
        // autres (`ack`, `firstStatus`) se mesurent PAR TOUR dans
        // `apps/ia/app/services/chat_slo.py`, celui-ci est une statistique de
        // population, calculée ici où `measureLatencyP95Ms` existe déjà.
        key: 'chat_latency',
        label: 'Réponse du chat (p95 sur 24 h)',
        unit: 'ms',
        measure: measureChatResponseP95Ms(chatTurns, minSample),
        threshold:
          readPositiveNumber(
            process.env[OBSERVABILITY_ALERT_SETTINGS.chatResponseP95Seconds.env],
            OBSERVABILITY_ALERT_SETTINGS.chatResponseP95Seconds.fallback,
          ) * 1000,
      },
      {
        // Épopée #2879 (#2442.14 / #2442.15) — premier compteur de SÉCURITÉ :
        // pas un taux (voir `measureAuthorizationDeniedCount`), donc jamais
        // `unmeasured` sauf lecture impossible — un zéro ici est un zéro vrai.
        key: 'authorization_denied',
        label: 'Accès refusés — 401/403 (sur 24 h)',
        unit: 'count',
        measure: measureAuthorizationDeniedCount(securityEvents),
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.authorizationDeniedCount.env],
          OBSERVABILITY_ALERT_SETTINGS.authorizationDeniedCount.fallback,
        ),
      },
      {
        // Épopée #2879 (#2442.15) — remboursement anormal : pas un taux (voir
        // `measureAbnormalRefundCount`), même famille que `authorization_denied`
        // ci-dessus.
        key: 'abnormal_refund',
        label: 'Remboursements nocturnes de crédits (sur 24 h)',
        unit: 'count',
        measure: measureAbnormalRefundCount(refundEvents),
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.abnormalRefundCount.env],
          OBSERVABILITY_ALERT_SETTINGS.abnormalRefundCount.fallback,
        ),
      },
      {
        // Épopée #2879 (#2442.15) — fuite d'identité détectée : pas un taux
        // (voir `measureLeakDetectedCount`), même famille que
        // `authorization_denied`/`abnormal_refund` ci-dessus.
        key: 'leak_detected',
        label: 'Fuites d’identité détectées dans un corpus partagé (sur 24 h)',
        unit: 'count',
        measure: measureLeakDetectedCount(leakEvents),
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.leakDetectedCount.env],
          OBSERVABILITY_ALERT_SETTINGS.leakDetectedCount.fallback,
        ),
      },
      {
        // #2879 (#2442.14) — un résultat d'outil portait un identifiant d'espace.
        key: 'cross_tenant_suspected',
        label: 'Soupçons cross-tenant : identifiant d’espace dans un résultat d’outil (sur 24 h)',
        unit: 'count',
        measure: measureThreatSuspicionCount(crossTenantEvents),
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.crossTenantSuspectedCount.env],
          OBSERVABILITY_ALERT_SETTINGS.crossTenantSuspectedCount.fallback,
        ),
      },
      {
        // #2879 (#2442.14) — consigne d'injection suspectée (heuristique).
        key: 'injection_suspected',
        label: 'Soupçons d’injection dans un résultat d’outil (sur 24 h)',
        unit: 'count',
        measure: measureThreatSuspicionCount(injectionEvents),
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.injectionSuspectedCount.env],
          OBSERVABILITY_ALERT_SETTINGS.injectionSuspectedCount.fallback,
        ),
      },
      {
        // #2879 (#2442.14) — un membre a demandé un geste que son rôle refuse.
        key: 'permission_escalated',
        label: 'Tentatives d’escalade de permission : rôle insuffisant (sur 24 h)',
        unit: 'count',
        measure: measureThreatSuspicionCount(escalationEvents),
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.permissionEscalatedCount.env],
          OBSERVABILITY_ALERT_SETTINGS.permissionEscalatedCount.fallback,
        ),
      },
      {
        // #2879 (#2442.14, lot X17) — un espace a fait sortir ses données en masse.
        key: 'mass_export',
        label: 'Export massif : sorties de données d’un même espace (sur 24 h)',
        unit: 'count',
        measure: measureMassExportCount(dataExportEvents),
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.massExportCount.env],
          OBSERVABILITY_ALERT_SETTINGS.massExportCount.fallback,
        ),
      },
    ]

    const unmeasured: string[] = []
    const blind: Array<{ key: AlertKey; reason: string; sample: number }> = []
    for (const definition of definitions) {
      if (definition.measure.state !== 'measured') {
        unmeasured.push(`${definition.key} (${definition.measure.reason}, ${definition.measure.sample} obs.)`)
        blind.push({ key: definition.key, reason: definition.measure.reason, sample: definition.measure.sample })
        continue
      }
      if (!breaches(definition.measure, definition.threshold)) continue
      this.emit(definition, definition.measure)
    }

    if (unmeasured.length > 0) {
      // NON MESURÉ n'est pas MESURÉ À ZÉRO : sans cette ligne, un opérateur qui
      // ne voit aucune alerte ne peut pas distinguer « tout va bien » de « on
      // n'a rien pu regarder » — et un service mort rendrait le même silence
      // qu'un service parfait.
      this.logger.log(`Alertes d’observabilité non mesurables sur cette fenêtre : ${unmeasured.join(' · ')}`)
    }
    this.announceBlindness(blind)
    await this.checkReasoning(now)
  }

  /**
   * #3223.5 (#3198) — les alertes de QUALITÉ du raisonnement commercial, d'une
   * famille distincte de la sécurité/opérations ci-dessus, lues sur le trafic
   * réel (contextes persistés des tours, `reasoning-quality.ts`) et sur TROIS
   * jours : « sur plusieurs jours » est la demande de l'épopée.
   *
   * Une mesure impossible (trop peu de tours) ne déclenche RIEN et n'entre pas
   * dans l'annonce de cécité : ces trois alertes naissent sur un trafic encore
   * mince, les compter « aveugles » réveillerait l'opérateur chaque matin.
   */
  private async checkReasoning(now: Date): Promise<void> {
    const since = new Date(now.getTime() - REASONING_ALERT_WINDOW_DAYS * 86_400_000)
    const report = buildReasoningQualityReport(
      await readReasoningTurns(this.runs, since, this.logger),
      REASONING_ALERT_WINDOW_DAYS,
      { judgements: await readGenericJudgements(this.runs, since, this.logger) },
    )
    // `null` = juge non fiable : aucune alerte sur un chiffre que l'écran n'affiche pas.
    const generic = report.genericRecommendation.measure
    const definitions: AlertDefinition[] = [
      {
        key: 'reasoning_after_budget',
        label: 'Réponses finales sans mention dégradée après budget épuisé (sur 3 jours)',
        unit: '%',
        measure: report.metrics.finalAnswerAfterBudgetRate,
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.reasoningAfterBudgetPercent.env],
          OBSERVABILITY_ALERT_SETTINGS.reasoningAfterBudgetPercent.fallback,
        ),
      },
      {
        key: 'reasoning_dataforge_absent',
        label: 'DataForge indisponible sur la plupart des tours (sur 3 jours)',
        unit: '%',
        measure: report.metrics.dataforgeUnavailableRate,
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.reasoningDataforgeAbsentPercent.env],
          OBSERVABILITY_ALERT_SETTINGS.reasoningDataforgeAbsentPercent.fallback,
        ),
      },
      {
        key: 'reasoning_internal_unused',
        label: 'Tours sans aucune source interne consultée (sur 3 jours)',
        unit: '%',
        measure: report.metrics.internalSourceUnusedRate,
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.reasoningInternalUnusedPercent.env],
          OBSERVABILITY_ALERT_SETTINGS.reasoningInternalUnusedPercent.fallback,
        ),
      },
      {
        key: 'reasoning_nogo_no_alternative',
        label: 'Verdicts NO_GO sans aucune alternative proposée (sur 3 jours)',
        unit: '%',
        measure: report.metrics.noGoWithoutAlternativesRate,
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.reasoningNoGoNoAlternativePercent.env],
          OBSERVABILITY_ALERT_SETTINGS.reasoningNoGoNoAlternativePercent.fallback,
        ),
      },
      {
        // #2442.15 (lot X17) — « fausse réussite » : action déclarée sans preuve.
        key: 'reasoning_false_success',
        label: 'Fausse réussite : action déclarée faite sans preuve (sur 3 jours)',
        unit: '%',
        measure: report.metrics.falseSuccessRate,
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.reasoningFalseSuccessPercent.env],
          OBSERVABILITY_ALERT_SETTINGS.reasoningFalseSuccessPercent.fallback,
        ),
      },
      {
        // #2442.15 (lot X17) — « mauvais zéro » : un inconnu converti en zéro.
        key: 'reasoning_wrong_zero',
        label: 'Mauvais zéro : une valeur inconnue présentée comme zéro (sur 3 jours)',
        unit: '%',
        measure: report.metrics.wrongZeroRate,
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.reasoningWrongZeroPercent.env],
          OBSERVABILITY_ALERT_SETTINGS.reasoningWrongZeroPercent.fallback,
        ),
      },
      {
        // #3223 (lot E12) — la mémoire marché a rendu des entreprises, la réponse n'en cite aucune.
        key: 'reasoning_market_memory_uncited',
        label: 'Mémoire marché lue mais non citée dans la réponse (sur 3 jours)',
        unit: '%',
        measure: report.metrics.marketMemoryUncitedRate,
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.reasoningMarketMemoryUncitedPercent.env],
          OBSERVABILITY_ALERT_SETTINGS.reasoningMarketMemoryUncitedPercent.fallback,
        ),
      },
      {
        // #3223 (lot R17) — une correction suivie d'un rerun dont le verdict ne change pas.
        key: 'reasoning_correction_without_result_change',
        label: 'Correction suivie d’un rerun sans changement de verdict (sur 3 jours)',
        unit: '%',
        measure: report.metrics.correctionWithoutResultChangeRate,
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.reasoningCorrectionWithoutResultChangePercent.env],
          OBSERVABILITY_ALERT_SETTINGS.reasoningCorrectionWithoutResultChangePercent.fallback,
        ),
      },
      {
        // #3223 (lot R17) — GO_AFTER_PROOF sur un grand compte (5000 salariés et plus).
        key: 'reasoning_go_large_account_without_access',
        label: 'GO après preuve sur un grand compte sans accès connu (sur 3 jours)',
        unit: '%',
        measure: report.metrics.goLargeAccountWithoutAccessRate,
        threshold: readPositiveNumber(
          process.env[OBSERVABILITY_ALERT_SETTINGS.reasoningGoLargeAccountWithoutAccessPercent.env],
          OBSERVABILITY_ALERT_SETTINGS.reasoningGoLargeAccountWithoutAccessPercent.fallback,
        ),
      },
      ...(generic
        ? [
            {
              key: 'reasoning_generic_rise' as const,
              label: 'Hausse des réponses génériques, selon le juge évalué (sur 3 jours)',
              unit: '%' as const,
              measure: generic,
              threshold: readPositiveNumber(
                process.env[OBSERVABILITY_ALERT_SETTINGS.reasoningGenericPercent.env],
                OBSERVABILITY_ALERT_SETTINGS.reasoningGenericPercent.fallback,
              ),
            },
          ]
        : []),
    ]
    for (const definition of definitions) {
      if (definition.measure.state !== 'measured' || !breaches(definition.measure, definition.threshold)) continue
      this.emit(definition, definition.measure)
    }
  }

  /**
   * L'annonce de la cécité — le seul message de ce service qui ne parle pas
   * d'un seuil franchi, mais d'un seuil qu'on n'a pas pu regarder.
   *
   * Il part en `error`, donc dans Sentry (le `log` ci-dessus n'y va pas), et il
   * ne part QUE lorsque l'ensemble des alertes aveugles change. Le message est
   * volontairement sans chiffre : Sentry regroupe par texte, et un échantillon
   * dans le titre créerait une issue neuve chaque matin.
   */
  private announceBlindness(blind: ReadonlyArray<{ key: AlertKey; reason: string; sample: number }>): void {
    if (blind.length === 0) {
      if (this.lastBlindSignature !== null) {
        this.logger.log('Alertes d’observabilité de nouveau toutes mesurables')
        this.lastBlindSignature = null
      }
      return
    }

    // La signature ne retient que ce qui CHANGE l'état : quelle alerte, et pour
    // quelle raison. L'échantillon en est exclu — il bouge tous les jours et
    // ferait re-alerter sur une situation identique.
    const signature = blind.map(entry => `${entry.key}:${entry.reason}`).join('|')
    if (this.lastBlindSignature === signature) return
    this.lastBlindSignature = signature

    // #4458 (Louis, tri Sentry 22/10/2026) — `no_observation` / `sample_too_small`
    // disent le VOLUME d'un produit jeune, pas une panne : WARN (journaux), plus
    // une exception Sentry chaque matin. Les alertes MESURÉES restent en error.
    this.logger.warn(
      `Alertes d’observabilité aveugles — ${blind.map(entry => `${entry.key} (${entry.reason})`).join(' · ')}`,
      {
        tags: { feature: 'observability-alert', 'alert.key': 'unmeasurable' },
        contexts: {
          observability: {
            // Les chiffres vivent ICI, hors du regroupement Sentry.
            blind: blind.map(entry => ({ alert: entry.key, reason: entry.reason, sample: entry.sample })),
          },
        },
      },
    )
  }

  private emit(definition: AlertDefinition, measure: Extract<AlertMeasure, { state: 'measured' }>): void {
    const rendered =
      definition.unit === 'ms'
        ? `${Math.round(measure.value / 1000)} s`
        : definition.unit === '%'
          ? `${measure.value} %`
          : `${measure.value}`
    const threshold =
      definition.unit === 'ms'
        ? `${Math.round(definition.threshold / 1000)} s`
        : definition.unit === '%'
          ? `${definition.threshold} %`
          : `${definition.threshold}`
    // ERROR = capture Sentry via le transport Winston (convention du dépôt : ne
    // jamais appeler Sentry.captureException en direct — la meta passe par le
    // logger).
    this.logger.error(`${definition.label} : ${rendered} (seuil ${threshold})`, {
      tags: { feature: 'observability-alert', 'alert.key': definition.key },
      contexts: {
        observability: {
          alert: definition.key,
          value: measure.value,
          unit: definition.unit,
          threshold: definition.threshold,
          sample: measure.sample,
          // Ce qui n'a pas pu entrer dans le calcul. Le chiffre annoncé porte
          // donc sur `sample` observations, pas sur toute la fenêtre — et il le
          // dit, comme les lignes non tarifées de l'alerte de coût.
          excluded: measure.excluded,
        },
      },
    })
  }

  /** Les runs lancés dans la fenêtre. Une lecture qui échoue ne mesure RIEN. */
  private async readRuns(since: Date): Promise<RunSample[]> {
    try {
      const rows = await this.runs.query(
        `SELECT status, created_at, completed_at, workspace_id
           FROM analysis_runs
          WHERE created_at >= $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [since, MAX_ROWS],
      )
      return (rows as Array<Record<string, unknown>>).map(row => ({
        status: String(row['status'] ?? ''),
        createdAt: new Date(row['created_at'] as string),
        completedAt: row['completed_at'] == null ? null : new Date(row['completed_at'] as string),
        workspaceId: (row['workspace_id'] as string | null) ?? null,
      }))
    } catch (error) {
      // Une lecture impossible rend une liste VIDE, ce que les mesures traduisent
      // en « non mesuré » — jamais en « aucune erreur, aucune lenteur ».
      this.logger.warn(
        'Runs d’analyse illisibles — les alertes de latence / erreur / no-outcome restent non mesurées',
        {
          error: error instanceof Error ? error.message : String(error),
        },
      )
      return []
    }
  }

  /**
   * Le verdict du juge pour chaque dossier PRODUIT dans la fenêtre.
   *
   * Un dossier compte une fois, même ré-analysé deux fois dans la journée : le
   * verdict est écrasé à chaque run (`raw_analysis.judge`), donc c'est le
   * DERNIER qui est lisible, et compter le compte deux fois attribuerait ce
   * verdict à un run qu'il ne décrit pas.
   *
   * Un dossier dont le bloc `judge` est absent rend `verdict: null` — le juge
   * n'a pas parlé, ce n'est pas un dossier propre.
   */
  private async readJudgeVerdicts(since: Date): Promise<JudgeSample[]> {
    try {
      const rows = await this.runs.query(
        `SELECT DISTINCT ON (r.account_id) r.account_id,
                a.raw_analysis -> 'judge' ->> 'verdict' AS verdict
           FROM analysis_runs r
           JOIN accounts a ON a.id = r.account_id
          WHERE r.created_at >= $1
            AND r.status = 'completed'
          ORDER BY r.account_id, r.created_at DESC
          LIMIT $2`,
        [since, MAX_ROWS],
      )
      return (rows as Array<Record<string, unknown>>).map(row => ({
        accountId: String(row['account_id'] ?? ''),
        verdict: (row['verdict'] as string | null) ?? null,
      }))
    } catch (error) {
      this.logger.warn('Verdicts du juge illisibles — l’alerte d’hallucination reste non mesurée', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  /**
   * #2441.4 — un tour de chat par `turn_id`, réduit au délai user→assistant.
   *
   * Un tour dont le message de l'utilisateur est ANTÉRIEUR à la fenêtre (donc
   * absent des lignes lues) ne peut pas se distinguer d'un tour sans réponse —
   * les deux rendent `user_at: null` ici et sortent du calcul via
   * {@link measureChatResponseP95Ms}, exactement comme un tour réellement sans
   * réponse. C'est la même discipline que `excluded` ailleurs dans ce fichier :
   * une observation dont on ne sait pas dire la durée ne se compte JAMAIS
   * comme une durée nulle.
   */
  private async readChatTurns(since: Date): Promise<ChatTurnSample[]> {
    try {
      const rows = await this.runs.query(
        `SELECT MIN(created_at) FILTER (WHERE role = 'user') AS user_at,
                MIN(created_at) FILTER (WHERE role = 'assistant') AS assistant_at
           FROM chat_messages
          WHERE turn_id IS NOT NULL
            AND created_at >= $1
          GROUP BY turn_id
          LIMIT $2`,
        [since, MAX_ROWS],
      )
      return (rows as Array<Record<string, unknown>>)
        .filter(row => row['user_at'] != null)
        .map(row => ({
          userAt: new Date(row['user_at'] as string),
          assistantAt: row['assistant_at'] == null ? null : new Date(row['assistant_at'] as string),
        }))
    } catch (error) {
      // Une lecture impossible rend une liste VIDE — traduite en « non mesuré »,
      // jamais en « Laura répond toujours dans les temps ».
      this.logger.warn('Tours de chat illisibles — l’alerte de latence chat reste non mesurée', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  /**
   * Épopée #2879 (#2442.14 / #2442.15) — les accès refusés (401/403) écrits par
   * `GlobalExceptionFilter` dans la fenêtre.
   *
   * ⚠️ Une lecture impossible rend `null`, jamais `[]` : contrairement aux
   * autres méthodes de lecture de ce fichier, `[]` est ici une valeur
   * OBSERVABLE légitime (aucun accès refusé), donc `measureAuthorizationDeniedCount`
   * doit pouvoir distinguer « zéro constaté » de « rien lu ».
   */
  private async readSecurityEvents(since: Date): Promise<SecurityEventSample[] | null> {
    try {
      const rows = await this.runs.query(
        `SELECT created_at
           FROM security_events
          WHERE kind = 'authorization_denied'
            AND created_at >= $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [since, MAX_ROWS],
      )
      return (rows as Array<Record<string, unknown>>).map(row => ({
        createdAt: new Date(row['created_at'] as string),
      }))
    } catch (error) {
      this.logger.warn('Accès refusés illisibles — l’alerte de sécurité reste non mesurée', {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Épopée #2879 (#2442.15) — les remboursements de crédits (`credit_ledger.kind
   * = 'refund_enrichment'`) dans la fenêtre. Écrits par `RefreshRefundService.run`
   * (appelé chaque nuit par `RefreshRefundSweepService`, et à la main par
   * `RefreshRefundController`) — la SEULE source de cette écriture, même
   * chokepoint mécanique que `security_events` pour `authorization_denied`.
   *
   * ⚠️ Une lecture impossible rend `null`, jamais `[]` : même distinction que
   * {@link readSecurityEvents} entre « zéro constaté » et « rien lu ».
   */
  private async readRefundEvents(since: Date): Promise<RefundEventSample[] | null> {
    try {
      const rows = await this.runs.query(
        `SELECT created_at
           FROM credit_ledger
          WHERE kind = 'refund_enrichment'
            AND created_at >= $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [since, MAX_ROWS],
      )
      return (rows as Array<Record<string, unknown>>).map(row => ({
        createdAt: new Date(row['created_at'] as string),
      }))
    } catch (error) {
      this.logger.warn('Remboursements illisibles — l’alerte de remboursement anormal reste non mesurée', {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Épopée #2879 (#2442.15) — les fuites d'identité détectées
   * (`security_events.kind = 'leak_detected'`) dans la fenêtre. Écrites par
   * `guard_shared_corpus_pii_reporting_leak` côté IA (`apps/ia/app/services/
   * shared_corpus_pii_guard.py`), le seul site qui rédige un outil du corpus
   * partagé entre espaces — même chokepoint mécanique que `security_events`
   * pour `authorization_denied`.
   *
   * ⚠️ Une lecture impossible rend `null`, jamais `[]` : même distinction que
   * {@link readSecurityEvents} entre « zéro constaté » et « rien lu ».
   */
  private async readLeakEvents(since: Date): Promise<LeakEventSample[] | null> {
    try {
      const rows = await this.runs.query(
        `SELECT created_at
           FROM security_events
          WHERE kind = 'leak_detected'
            AND created_at >= $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [since, MAX_ROWS],
      )
      return (rows as Array<Record<string, unknown>>).map(row => ({
        createdAt: new Date(row['created_at'] as string),
      }))
    } catch (error) {
      this.logger.warn('Fuites détectées illisibles — l’alerte de fuite d’identité reste non mesurée', {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Épopée #2879 (#2442.14) — les soupçons cross-tenant / injection de la
   * fenêtre (`security_events`, écrits par `chat_tools.execute_chat_tool`).
   * `kind` est une constante typée du code, jamais une entrée. `null` = rien
   * lu (jamais `[]`), même distinction que {@link readLeakEvents}.
   */
  private async readThreatEvents(
    kind: 'cross_tenant_suspected' | 'injection_suspected' | 'permission_escalated',
    since: Date,
  ): Promise<ThreatEventSample[] | null> {
    try {
      const rows = await this.runs.query(
        `SELECT created_at
           FROM security_events
          WHERE kind = '${kind}'
            AND created_at >= $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [since, MAX_ROWS],
      )
      return (rows as Array<Record<string, unknown>>).map(row => ({
        createdAt: new Date(row['created_at'] as string),
      }))
    } catch (error) {
      this.logger.warn(`Soupçons ${kind} illisibles — l’alerte reste non mesurée`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }
  /**
   * #2879 (#2442.14, lot X17) — les sorties de données de la fenêtre
   * (`security_events.kind = 'data_export'`, écrites par `WorkspacePermissionGuard`
   * via `WorkspaceContextService.recordDataExit`). Seul l'espace est lu, jamais une
   * personne ni un contenu. `null` = rien lu (jamais `[]`).
   */
  private async readDataExportEvents(since: Date): Promise<DataExportEventSample[] | null> {
    try {
      const rows = await this.runs.query(
        `SELECT created_at, workspace_id
           FROM security_events
          WHERE kind = 'data_export'
            AND created_at >= $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [since, MAX_ROWS],
      )
      return (rows as Array<Record<string, unknown>>).map(row => ({
        createdAt: new Date(row['created_at'] as string),
        workspaceId: (row['workspace_id'] as string | null) ?? null,
      }))
    } catch (error) {
      this.logger.warn('Sorties de données illisibles — l’alerte d’export massif reste non mesurée', {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }
}
