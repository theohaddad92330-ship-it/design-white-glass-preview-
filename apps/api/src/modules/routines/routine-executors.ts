import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { MOVED_CHAMPION_TITLE, championEmploymentCheckLimit, employmentFromHits } from './employment-check'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, Repository } from 'typeorm'
import {
  type AgendaEvent,
  buildTriggerEvent,
  mailDraftHasProof,
  type MailThread,
  type NoReplyFollowUpDryRun,
  ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS,
  type RoutineKey,
  referencingWindowAlert,
  territoryChangeReading,
  territoryChanges,
  type TriggerEvent,
} from '@bellum/contracts'
import { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { TerritorySnapshotEntity } from '../../database/entities/territory-snapshot.entity'
import { TerritorySubscriptionEntity } from '../../database/entities/territory-subscription.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { AgendaService } from '../agenda/agenda.service'
import { AtsService } from '../ats/ats.service'
import { MISSION_ENDING_STAGES_DAYS, MISSION_ENDING_WINDOW_DAYS, missionEndingStage } from './mission-ending-cascade'
import { computeFreeSlots } from '../agenda/free-slots'
import { matchAccountByDomain } from '../agenda/meeting-account-domain-match'
import { BriefingService } from '../briefing/briefing.service'
import { CapitalisationService } from '../capitalisation/capitalisation.service'
import { ProviderCostRecorder } from '../analytics/provider-cost-recorder'
import { CreditsService } from '../credits/credits.service'
import { CrmService } from '../crm/crm.service'
import { DeliveryRoutinesService } from '../delivery/delivery-routines.service'
import { IA_COST_HEADER, IaClient } from '../ia/ia.client'
import { MailboxService } from '../mailbox/mailbox.service'
import { MissionFeedbackService } from '../delivery/mission-feedback.service'
import { accountsWithoutNextActionCountSql } from '../accounts/account-hygiene.sql'
import { CrmRoutinesService, type ContactMove, type EmploymentCheckTarget } from './crm-routines.service'
import { type L13Row, TalentRoutinesService } from './talent-routines.service'
import type { RoutineRead } from './routine-read'
import { ZeroLayerService } from '../zero-layer/zero-layer.service'

/**
 * Ce que fait chaque routine quand son heure arrive.
 *
 * Un exécuteur ne décide de rien : il regarde, et il rend soit une notification
 * à poster, soit la raison pour laquelle il n'y en a pas. C'est le service qui
 * écrit la trace et poste — un exécuteur qui écrirait lui-même rendrait
 * l'idempotence impossible à garantir en un seul endroit.
 *
 * Règle commune, tirée du garde-fou n°18 des méta-analyses (« limiter les
 * alertes pour éviter le bruit ») : **rien à dire ⇒ rien envoyé**. Une routine
 * qui poste « 0 relance en attente » tous les matins est désactivée en trois
 * jours, et avec elle les matins où elle avait quelque chose à dire.
 */

type RoutineNotification = { title: string; body: string; link: string }

type RoutineOutcome = {
  /** Faut-il poster une notification ? */
  notified: boolean
  /**
   * La priorité 0-100 du message (PDF 6 §7), quand l'exécuteur sait la calculer.
   *
   * `undefined` laisse le service décider : une routine qui ne sait pas dire
   * l'urgence de ce qu'elle a trouvé ne doit pas être pénalisée pour autant.
   * Ce qui compte, c'est que celles qui SAVENT le disent — « trois relevés
   * manquants » et « une mission à risque » n'ont pas la même urgence, et le
   * plafond doit garder la seconde.
   */
  priority?: number
  /** Ce qui s'est passé, en français lisible — écrit dans la trace. */
  outcome: string
  notification?: RoutineNotification
  /**
   * Routines CONTINUES : une occurrence par OBJET plutôt qu'une par jour.
   *
   * Un rendez-vous, un fil, une annulation. C'est ce qui permet de servir
   * « -1 h avant CHAQUE rendez-vous » sans rater le deuxième de la journée, et
   * sans re-notifier le premier tous les quarts d'heure.
   */
  items?: Array<{ objectId: string; outcome: string; notification: RoutineNotification; priority?: number }>
  /**
   * #2875/#2402.1 (vague F/G 27/09) — l'événement canonique construit par
   * `DeliveryRoutinesService` sur cette occurrence, quand elle en a détecté
   * un (jamais deviné, `undefined` sinon). `RoutinesService.runDueFor` le
   * recueille pour la corrélation multi-signal (#2402.14) : plusieurs
   * routines Delivery dues le même balayage, sur le MÊME espace.
   */
  triggerEvent?: TriggerEvent | null
  /**
   * #2205.54 (épopée #2843) — la PREUVE de ce que la routine a réellement
   * produit, jamais devinée : `undefined` tant que l'exécuteur n'a rien de
   * vérifiable à citer (routine qui ne fabrique rien de tangible, ou rien
   * trouvé ce passage) ; `null` quand elle a tenté quelque chose sans
   * obtenir de preuve VÉRIFIABLE (même garde que {@link mailDraftHasProof},
   * GA-26 : un identifiant seul, sans confirmation de où il a atterri, n'est
   * pas une preuve). Un lien (`webUrl`) quand le fournisseur en rend un,
   * l'identifiant sinon — jamais les deux, jamais un texte recomposé.
   */
  proofRef?: string | null
}

/**
 * Ce que chaque état cassé demande à l'utilisateur.
 *
 * Un message par état, et jamais un message générique : « vérifie la connexion »
 * ne dit pas s'il faut se reconnecter, accorder une portée ou attendre. Envoyer
 * quelqu'un chercher au mauvais endroit coûte plus cher que de se taire.
 */
/**
 * L'état de chaque capacité, tel que l'appelant l'a résolu.
 *
 * Les clés sont les CAPACITÉS du produit, pas les éditeurs : « ta messagerie »,
 * « ton agenda ». C'est la règle du dépôt, et elle vaut aussi dans une
 * notification.
 */
type ConnectorHealth = Record<string, string>

/** Le titre par capacité — jamais un nom d'éditeur (règle produit). */
const HEALTH_TITLES: Readonly<Record<string, string>> = {
  mailbox: 'Ta messagerie ne répond plus comme prévu',
  agenda: 'Ton agenda ne répond plus comme prévu',
  crm: 'Ton CRM ne répond plus comme prévu',
  ats: 'Ton ATS ne répond plus comme prévu',
}

const HEALTH_MESSAGES: Readonly<Record<string, string>> = {
  authorization_expired: 'L’autorisation a expiré. Reconnecte l’outil pour que les automatisations reprennent.',
  read_only: 'La connexion vit, mais le droit d’écriture n’est plus accordé : seule la lecture fonctionne.',
  degraded: 'Le fournisseur est en incident ou en limite de débit. Les envois reprendront tout seuls.',
}

/** Rien à signaler : la routine a tourné, et c'est une information. */
function quiet(outcome: string): RoutineOutcome {
  return { notified: false, outcome }
}

/** #3918.2 — le port vers `TriggerRegistryService.recordOnce` (câblé dans `routines.module.ts`). */
export const ROUTINE_TRIGGER_RECORD = Symbol('ROUTINE_TRIGGER_RECORD')
type RoutineRecordTrigger = (
  event: TriggerEvent,
  sourceModule: string,
  context: { accountId?: string | null; factOccurredAt?: string | null },
) => Promise<boolean>

@Injectable()
export class RoutineExecutors {
  private readonly logger = new Logger(RoutineExecutors.name)

  constructor(
    private readonly briefing: BriefingService,
    private readonly mailbox: MailboxService,
    private readonly agenda: AgendaService,
    private readonly ats: AtsService,
    private readonly crm: CrmService,
    // Les trois routines du Delivery passent par UN point d'entrée du module
    // qui possède la donnée : trois services importés ici traverseraient trois
    // fois une frontière que la règle §3.2 veut voir traversée le moins
    // possible.
    private readonly delivery: DeliveryRoutinesService,
    // Les cinq automatisations CRM du §13. Elles lisent le SCHÉMA plutôt que
    // cinq services d'autres modules — voir le docblock du service.
    private readonly crmRoutines: CrmRoutinesService,
    // Les lectures du vivier, même raison et même forme que ci-dessus : le
    // SCHÉMA plutôt qu'un service du module `consultants`.
    private readonly talentRoutines: TalentRoutinesService,
    // La surveillance de l'espace documentaire (D17). `@Optional()` : sans
    // connecteur documentaire, la routine se saute et l'écran le dit.
    // La veille territoriale lit le SCHÉMA — deux tables — et la fonction pure
    // `territoryChanges`, plutôt que le service du module `esn-directory`. Ce
    // n'est pas un contournement de la règle §3.2 : c'est exactement l'échappée
    // qu'elle nomme (« passe par un contrat partagé »), et ce qui décide ici
    // n'est pas une lecture de sources publiques mais une comparaison de deux
    // photos déjà prises.
    @InjectRepository(TerritorySubscriptionEntity)
    private readonly territories: Repository<TerritorySubscriptionEntity>,
    @InjectRepository(TerritorySnapshotEntity)
    private readonly territorySnapshots: Repository<TerritorySnapshotEntity>,
    @Optional() private readonly zeroLayer?: ZeroLayerService,
    // #2398.5 — le rappel de REX en attente lit `CapitalisationService`, qui
    // possède déjà `rexForWorkspace` (onglet Preuves & REX). `@Optional()` en
    // FIN de liste, même raison que `zeroLayer` : ne pas casser les cinq
    // fichiers de test qui construisent cet exécuteur par position.
    @Optional() private readonly capitalisation?: CapitalisationService,
    // Épopée #2873 (#2367.14, LOT c5 clôture 26/09) — le SCHÉMA plutôt qu'un
    // service du module `outreach`, même raison que la veille territoriale
    // ci-dessus (§3.2) : une lecture (séquences `completed` récentes), pas un
    // geste métier. `@Optional()` EN FIN de liste, même raison que
    // `zeroLayer`/`capitalisation` : ne pas casser les six fichiers de test
    // qui construisent cet exécuteur par position.
    @Optional()
    @InjectRepository(OutreachSequenceEntity)
    private readonly outreachSequences?: Repository<OutreachSequenceEntity>,
    // #2398.10 (épopée #2843) — « préparer les messages » de la routine
    // relances a besoin de générer un brouillon (`IaClient`, module global,
    // seul import service→service NEUF de ce lot — voir le relèvement jumeau
    // de `SERVICE_TO_SERVICE_AT_FREEZE` dans `module-boundaries.spec.ts`).
    // `@Optional()` EN FIN de liste, même raison que les précédents : ne pas
    // casser les fichiers de test qui construisent cet exécuteur par position.
    @Optional() private readonly ia?: IaClient,
    // #2390.18 (épopée #2926) — `meetingCancelled` ferme le rappel/événement
    // que le routeur d'actions a posé pour ce rendez-vous (`calendar_event_id`,
    // `action-router.service.ts`). `@Optional()` EN FIN de liste, même raison
    // que les précédents : ne pas casser les fichiers de test qui construisent
    // cet exécuteur par position.
    @Optional()
    @InjectRepository(UserActionEntity)
    private readonly userActions?: Repository<UserActionEntity>,
    // #2205.42/#2205.61 (épopée #2843) — « budget crédits » : `noReplyFollowUp`
    // appelait `IaClient.generateMessage` (un vrai coût) sans jamais vérifier
    // de solde. Réutilise la même lecture SANS DÉBIT que l'enrichissement
    // organigramme/contacts (`hasEnrichmentCredit`, « gate the UI before the
    // user even tries ») plutôt qu'un troisième mécanisme de facturation
    // inventé (GA-26) — AUCUN débit n'est ajouté ici, seulement un refus
    // avant appel modèle quand le solde est à zéro. `@Optional()` EN FIN de
    // liste, même raison que `ia` juste au-dessus : ne pas casser les
    // fichiers de test qui construisent cet exécuteur par position. Absent
    // (specs à constructeur nu) ⇒ aucune vérification ⇒ comportement
    // INCHANGÉ (celui d'avant ce lot).
    @Optional() private readonly credits?: CreditsService,
    // #2390.18 (épopée #2926) — les tâches de préparation d'un rendez-vous
    // annulé (`action_plan_items.target_kind = 'meeting'`) deviennent caduques.
    // `@Optional()` EN FIN de liste : ne pas casser les specs à constructeur
    // par position.
    @Optional()
    @InjectRepository(ActionPlanItemEntity)
    private readonly planItems?: Repository<ActionPlanItemEntity>,
    // #3413.2 — le point à sept jours. `@Optional()` EN FIN de liste, même
    // raison que `capitalisation` plus haut : ne pas casser les specs à
    // constructeur par position.
    @Optional() private readonly missionFeedback?: MissionFeedbackService,
    // #2205.53 (épopée #2843) — le COÛT FOURNISSEUR de l'appel modèle de
    // `noReplyFollowUp`, tracé comme le composeur manuel, `need_play` et le
    // chat (`provider_costs`). Jamais un débit de crédit : `message_generation`
    // reste INCLUSE (#2205.42/#2205.61). `@Optional()` EN FIN de liste, même
    // raison que les précédents : specs à constructeur par position.
    @Optional() private readonly providerCosts?: ProviderCostRecorder,
    // #2916 (#2399.2) — « comptes sans prochaine action », MODÈLE désactivé
    // par défaut de la bibliothèque LAU-FINAL-113.
    // #3851 (lot W01, GA-07) — interpole directement `accountsWithoutNextActionCountSql`
    // (`accounts/account-hygiene.sql.ts`) plutôt que d'injecter `DataHygieneService`
    // (module `pilotage`) : la requête n'a jamais eu besoin d'un service, seulement
    // d'une connexion — GA-07 ne compte pas `DataSource`, qui n'appartient à aucun
    // module. `@Optional()` EN FIN de liste, même raison que les précédents : ne pas
    // casser les fichiers de test qui construisent cet exécuteur par position. Absent
    // (specs à constructeur nu) ⇒ `quiet('Routine inconnue.')` ⇒ comportement INCHANGÉ.
    @Optional() @InjectDataSource() private readonly dataSource?: DataSource,
    // #3918.2 (lot M01) — le registre canonique des déclencheurs, par un PORT
    // (`ROUTINE_TRIGGER_RECORD`, câblé dans `routines.module.ts`) : ce fichier
    // n'importe pas `TriggerRegistryService` (frontières de modules, GA-07).
    // `@Optional()` EN FIN de liste, même raison que les précédents.
    @Optional() @Inject(ROUTINE_TRIGGER_RECORD) private readonly recordTrigger?: RoutineRecordTrigger,
  ) {}

  async run(
    key: RoutineKey,
    userId: string,
    now: Date,
    workspaceId = '',
    /** L'état des connecteurs, déjà résolu par l'appelant. */
    health: ConnectorHealth = {},
    /**
     * #2843 (#2205.45) — le plafond de destinataires réglé sur l'abonnement,
     * DISTINCT de la cible calculée. `null`/`undefined` (défaut) = aucun
     * plafond réglé, comportement d'avant ce champ. Lu par la SEULE routine
     * où le calcul de la cible est déjà séparé de l'écriture
     * (`no_reply_follow_up`) — les autres l'ignorent.
     */
    maxItemsPerRun?: number | null,
  ): Promise<RoutineOutcome> {
    switch (key) {
      case 'daily_briefing':
        return this.dailyBriefing(userId, now)
      case 'meeting_prep':
        return this.meetingPrep(userId, now, workspaceId)
      case 'no_reply_follow_up':
        return this.noReplyFollowUp(userId, maxItemsPerRun, workspaceId)
      case 'positive_replies':
        return this.positiveReplies(userId)
      case 'agenda_conflicts':
        return this.agendaConflicts(userId, now)
      case 'empty_pipeline_alert':
        return this.emptyPipeline(userId, now)
      case 'weekly_recap':
        return this.weeklyRecap(userId, now, workspaceId)
      case 'weekly_forecast':
        return this.weeklyForecast(userId, now, workspaceId)
      case 'mission_ending':
        return this.missionEnding(userId)
      case 'bench_alert':
        return this.benchAlert(userId)
      case 'availability_reconfirm':
        return this.availabilityReconfirm(workspaceId)
      case 'crm_followups':
        return this.crmFollowUps(userId)
      case 'meeting_checklist':
        return this.meetingChecklist(userId, now)
      case 'meeting_followup':
        return this.meetingFollowUp(userId, now)
      case 'meeting_cancelled':
        return this.meetingCancelled(userId, now)
      case 'tender_watch':
        return this.mailWatch(userId, 'tender', 'appel d’offres', '/mailbox')
      case 'contract_watch':
        return this.mailWatch(userId, 'contract', 'contrat en attente', '/mailbox')
      case 'invoice_watch':
        return this.mailWatch(userId, 'invoice', 'facture en souffrance', '/mailbox')
      case 'stalled_proposals':
        return this.stalledProposals(userId)
      case 'crm_duplicates':
        return this.crmDuplicates(userId)
      case 'cv_intake':
        return this.cvIntake(userId)
      case 'monday_kickstart':
        return this.mondayKickstart(userId, now)
      case 'crm_hygiene':
        return this.crmHygiene(userId)
      case 'quarterly_review':
        return this.quarterlyReview(userId)
      case 'timesheet_chase':
        return this.timesheetChase(workspaceId, now)
      case 'invoice_readiness':
        return this.invoiceReadiness(workspaceId, now)
      case 'margin_alert':
        return this.marginAlert(workspaceId)
      case 'stalled_projects':
        return this.stalledProjects(workspaceId)
      case 'stale_account_plans':
        return this.staleAccountPlans(workspaceId)
      case 'needs_without_shortlist':
        return this.needsWithoutShortlist(workspaceId)
      case 'parked_account_signal':
        return this.parkedAccountSignal(workspaceId)
      case 'contact_job_change':
        return this.contactJobChange(workspaceId, now)
      case 'territory_watch':
        return this.territoryWatch(workspaceId)
      case 'referencing_window':
        return this.referencingWindow(workspaceId)
      case 'cv_folder_watch':
        return this.cvFolderWatch(userId, now)
      case 'connector_health':
        // La santé vient de l'APPELANT : `routines.service` interroge déjà les
        // quatre connecteurs pour calculer les empêchements de chaque routine.
        // La lui redemander ici ferait deux lectures et, surtout, deux vérités.
        return this.connectorHealth(health)
      case 'evening_closure_prompt':
        return this.eveningClosurePrompt(userId, now)
      case 'end_of_week_closure_prompt':
        return this.endOfWeekClosurePrompt(userId, now)
      case 'pre_manager_review_closure_prompt':
        return this.preManagerReviewClosurePrompt(userId, now)
      case 'mission_rex_reminder':
        return this.missionRexReminder(workspaceId)
      case 'sequence_completed_crm_update':
        return this.sequenceCompletedCrmUpdate(workspaceId, now)
      case 'not_now_revalidation':
        return this.notNowRevalidation(workspaceId)
      case 'mission_checkin_j7_reminder':
        return this.missionCheckinJ7Reminder(workspaceId, now)
      case 'dormant_pool_resurface':
        return this.dormantPoolResurface(workspaceId)
      case 'accounts_without_next_action':
        return this.accountsWithoutNextAction(workspaceId)
      // #2916 (#2399.2, Louis 15/10/2026) — les cinq lectures du pipeline.
      case 'deal_close_date_soon':
        return this.dealCloseDateSoon(workspaceId)
      case 'deal_close_date_overdue':
        return this.dealCloseDateOverdue(workspaceId)
      case 'deal_without_close_date':
        return this.dealWithoutCloseDate(workspaceId)
      case 'won_deal_expansion':
        return this.wonDealExpansion(workspaceId)
      case 'lost_deal_revisit':
        return this.lostDealRevisit(workspaceId)
      // #2843.1-.6 / #2102.45 (lot L13) — les routines qui manquaient aux rôles.
      case 'interview_upcoming':
      case 'interview_feedback_missing':
      case 'team_mission_risks':
      case 'blocked_needs':
      case 'mission_documents_pending':
      case 'mission_start_deadlines':
      case 'mission_renewal_to_engage':
      case 'consultant_repositioning':
        return this.l13Read(key, workspaceId)
      case 'meeting_reminder_t1':
        return this.meetingReminderT1(userId, now)
      // #2916 / #2399.2 (c93) — déclenchée par l'ARRIVÉE d'un besoin
      // (`NeedArrivalSubscriber`), jamais par ce balayage : il n'a rien à faire.
      case 'incoming_need_matching':
        return quiet('Déclenchée à chaque besoin entrant, pas au balayage.')
      default:
        return quiet('Routine inconnue.')
    }
  }

  /**
   * Ce qui a bougé sur les territoires suivis, depuis la dernière photo.
   *
   * Deux règles portent l'honnêteté de cette routine, et elles sont dans la
   * fonction pure plutôt qu'ici : une semaine non mesurée ne produit AUCUNE
   * variation (sinon une maintenance de source se lit « −100 % d'offres »), et
   * une variation relative sur une petite base est du bruit.
   *
   * Rien à dire ⇒ rien envoyé, comme partout ailleurs. Un territoire calme est
   * le cas NORMAL : c'est ce silence qui donne du poids à la semaine où une ESN
   * inconnue se met à recruter cinquante personnes sur la ville.
   */
  private async territoryWatch(workspaceId: string): Promise<RoutineOutcome> {
    if (!workspaceId) return quiet('Aucun espace de travail résolu.')
    const followed = await this.territories.find({ where: { workspaceId }, order: { department: 'ASC' } })
    if (followed.length === 0) return quiet('Aucun territoire suivi.')

    const summaries: string[] = []
    for (const row of followed) {
      const photos = await this.territorySnapshots.find({
        where: { department: row.department },
        order: { takenOn: 'DESC' },
        take: 2,
      })
      if (photos.length < 2) continue
      const [latest, previous] = photos
      const changes = territoryChanges(
        {
          takenOn: previous?.takenOn ?? '',
          offers: previous?.offers ?? null,
          esnPresent: previous?.esnPresent ?? null,
          openTenders: previous?.openTenders ?? null,
          awardedContracts: previous?.awardedContracts ?? null,
          esnHiring: previous?.esnHiring ?? [],
        },
        {
          takenOn: latest?.takenOn ?? '',
          offers: latest?.offers ?? null,
          esnPresent: latest?.esnPresent ?? null,
          openTenders: latest?.openTenders ?? null,
          awardedContracts: latest?.awardedContracts ?? null,
          esnHiring: latest?.esnHiring ?? [],
        },
      )
      for (const change of changes) {
        // ⚠️ `${change.from ?? '—'} → ${change.to ?? '—'}` produisait « — → 1 »
        // sur une ENTRÉE : deux tirets cadratins pour dire « je ne sais pas
        // d'où ça vient », alors que c'est justement ce qu'il fallait nommer.
        // La forme du mouvement se lit dans les contrats, au même endroit que
        // pour l'écran — deux chemins qui la refont divergent.
        const reading = territoryChangeReading(change)
        const movement =
          reading.shape === 'entered'
            ? `nouvelle entrée — ${reading.to} offre(s)`
            : reading.shape === 'left'
              ? `n'apparaît plus — ${reading.from} offre(s) la semaine dernière`
              : reading.shape === 'moved'
                ? `${reading.from} → ${reading.to}`
                : 'mouvement non lisible'
        summaries.push(
          change.subject
            ? `${row.department} — ${change.subject} : ${change.label} (${movement})`
            : `${row.department} — ${change.label} : ${movement}`,
        )
      }
    }
    if (summaries.length === 0) return quiet('Rien de notable sur les territoires suivis.')

    return {
      notified: true,
      outcome: `${summaries.length} mouvement(s) sur tes territoires.`,
      notification: {
        title: `${summaries.length} mouvement(s) sur tes territoires`,
        body: summaries.slice(0, 3).join(' · '),
        link: '/accounts/marches', // #4359 — /pilotage/marche n'est plus une route
      },
    }
  }

  /**
   * Les référencements qui se rouvrent (tome 1, F08).
   *
   * L'échéance est lue dans une COLONNE (`access_facts.reopens_on`) et non dans
   * la phrase française du constat : relire de la prose pour retrouver une date
   * est exactement le raisonnement que le dépôt s'interdit ailleurs.
   *
   * Un seul jalon par compte à la fois — la fonction pure s'en charge. Les
   * trois d'un coup seraient trois notifications pour une seule information.
   */
  private async referencingWindow(workspaceId: string): Promise<RoutineOutcome> {
    if (!workspaceId) return quiet('Aucun espace de travail résolu.')
    const rows = (await this.territories.manager.query(
      `SELECT a.company_name AS name, f.reopens_on AS reopens_on
         FROM access_facts f
         JOIN accounts a ON a.id = f.account_id
        WHERE f.workspace_id = $1
          AND f.kind = 'lock'
          AND f.reopens_on IS NOT NULL
        ORDER BY f.reopens_on ASC
        LIMIT 200`,
      [workspaceId],
    )) as Array<{ name: string | null; reopens_on: string | Date | null }>

    const due: string[] = []
    for (const row of rows) {
      const day = row.reopens_on instanceof Date ? row.reopens_on.toISOString().slice(0, 10) : row.reopens_on
      const alert = referencingWindowAlert(day)
      if (!alert) continue
      due.push(`${row.name ?? 'Compte'} — dans ${alert.milestone} mois (${alert.reopensOn})`)
    }
    if (due.length === 0) return quiet('Aucun référencement dans la fenêtre.')

    return {
      notified: true,
      outcome: `${due.length} référencement(s) à préparer.`,
      notification: {
        title: `${due.length} référencement(s) se rouvrent`,
        body: due.slice(0, 3).join(' · '),
        link: '/accounts',
      },
    }
  }

  /**
   * Les relevés jamais arrivés sur le mois clos.
   *
   * Rien à dire ⇒ rien envoyé : une routine qui poste « 0 relevé manquant »
   * tous les matins est désactivée en trois jours, et avec elle les matins où
   * elle avait quelque chose à dire.
   */
  private async timesheetChase(workspaceId: string, now: Date): Promise<RoutineOutcome> {
    if (!workspaceId) return quiet('Aucun espace de travail résolu.')
    const { count, first, triggerEvent } = await this.delivery.missingTimesheets(workspaceId, now)
    // ⚠️ `null` AVANT `0`, et les deux phrases sont différentes : `0` est une
    // mesure vraie, `null` est l'aveu qu'on n'a pas su lire. Les confondre
    // écrit « tout est rentré » sur un mois où l'on n'a rien pu regarder — et
    // c'est cette trace-là que l'écran Réglages › Routines affiche.
    if (count === null) return quiet('Les relevés du mois clos n’ont pas pu être lus — rien n’a été mesuré.')
    if (count === 0) return quiet('Aucun relevé manquant sur le mois clos.')
    return {
      notified: true,
      outcome: `${count} relevé(s) d’activité manquant(s).`,
      notification: {
        title: `${count} relevé(s) d’activité manquant(s)`,
        body: first ? `À commencer par « ${first} ».` : 'Le mois est clos et des relevés ne sont pas arrivés.',
        link: '/missions/cra',
      },
      triggerEvent,
    }
  }

  private async invoiceReadiness(workspaceId: string, now: Date): Promise<RoutineOutcome> {
    if (!workspaceId) return quiet('Aucun espace de travail résolu.')
    const { count, blockedAmountCents, first, triggerEvent } = await this.delivery.blockedInvoicing(workspaceId, now)
    // Même distinction que ci-dessus. « Rien ne bloque la facturation » est la
    // phrase la plus rassurante de tout le module ; elle ne s'écrit que sur une
    // lecture qui a abouti.
    if (count === null) return quiet('La facturabilité du mois clos n’a pas pu être lue — rien n’a été mesuré.')
    if (count === 0) return quiet('Rien ne bloque la facturation du mois clos.')
    // Le montant BLOQUÉ est annoncé seul, jamais additionné au préparatoire :
    // c'est de l'argent qu'on ne peut PAS facturer.
    // `null` = le montant n'a pas pu être lu. La phrase s'écrit alors SANS lui
    // plutôt qu'avec « 0 € immobilisés », qui se lirait comme une bonne
    // nouvelle au-dessus de mois réellement bloqués.
    const amount =
      blockedAmountCents !== null && blockedAmountCents > 0
        ? ` — ${Math.round(blockedAmountCents / 100)} € immobilisés.`
        : ''
    return {
      notified: true,
      outcome: `${count} mois bloqué(s).${amount}`,
      notification: {
        title: `${count} mois ne peut pas encore être facturé`,
        body: `${first ? `À commencer par « ${first} ».` : 'Ouvre la vue pour voir ce qui bloque.'}${amount}`,
        link: '/missions/facturation',
      },
      triggerEvent,
    }
  }

  private async marginAlert(workspaceId: string): Promise<RoutineOutcome> {
    if (!workspaceId) return quiet('Aucun espace de travail résolu.')
    const { threshold, count, first, triggerEvent } = await this.delivery.marginsBelowThreshold(workspaceId)
    // ⚠️ Ce test passe AVANT celui du seuil, et l'ordre est tout le correctif.
    // Une lecture cassée rendait `threshold: null` comme un espace non réglé,
    // et la routine écrivait « Aucun seuil de marge réglé pour cet espace » :
    // non seulement elle annonçait qu'il n'y avait rien à signaler, mais elle
    // en donnait une cause — un oubli de l'opérateur — qui était fausse.
    if (count === null) return quiet('Les marges n’ont pas pu être lues — aucun seuil n’a pu être appliqué.')
    // Aucun seuil réglé = aucune alerte. Le DIRE, pour qu'un silence ne se
    // lise pas comme une panne.
    if (threshold === null) return quiet('Aucun seuil de marge réglé pour cet espace.')
    if (count === 0) return quiet(`Aucune mission sous le seuil de ${threshold} %.`)
    return {
      notified: true,
      outcome: `${count} mission(s) sous ${threshold} % de marge.`,
      notification: {
        title: `${count} mission(s) sous le seuil de marge`,
        body: first ? `À commencer par « ${first} ».` : `Le seuil de cet espace est de ${threshold} %.`,
        link: '/missions',
      },
      triggerEvent,
    }
  }

  /**
   * La santé des connecteurs (PDF 6 §4, famille G).
   *
   * Elle ne notifie que sur un CHANGEMENT d'état — c'est le G01 du document
   * (« notifier une fois »). Répéter tous les matins « ton jeton a expiré »
   * n'apprend rien de plus au deuxième jour, et apprend surtout à ne plus lire
   * les notifications de ce produit.
   *
   * L'idempotence porte donc sur l'ÉTAT, pas sur la date : la clé d'occurrence
   * est `outil:état`, ce qui laisse repasser une notification si l'outil se
   * dégrade à nouveau après avoir été réparé.
   */
  private connectorHealth(health: ConnectorHealth): RoutineOutcome {
    // Les états qui EMPÊCHENT de travailler. `sync_late` n'y est pas : une
    // synchronisation en retard se rattrape toute seule, et la signaler chaque
    // matin ferait du bruit pour un problème qui n'en est pas un.
    const broken = Object.entries(health).flatMap(([tool, state]) =>
      state === 'authorization_expired' || state === 'read_only' || state === 'degraded' ? [{ tool, state }] : [],
    )
    if (broken.length === 0) return quiet('Tous les outils connectés répondent.')

    return {
      notified: true,
      // Une capacité cassée empêche d'agir : impact et urgence hauts, et
      // l'utilisateur PEUT y remédier (reconnecter). D'où une priorité élevée.
      priority: 80,
      outcome: `${broken.length} outil(s) à reconnecter.`,
      items: broken.map(({ tool, state }) => ({
        // La clé porte l'ÉTAT : « ce jeton a expiré » ne se redit pas demain,
        // mais « il a expiré à nouveau après réparation » se redit.
        objectId: `${tool}:${state}`,
        outcome: `${tool} — ${state}`,
        priority: 80,
        notification: {
          title: HEALTH_TITLES[tool] ?? 'Un outil connecté ne répond plus comme prévu',
          body: HEALTH_MESSAGES[state] ?? 'Vérifie la connexion de cet outil.',
          link: '/integrations',
        },
      })),
    }
  }

  /**
   * #2392.2 — le rappel proactif de la clôture de fin de journée.
   *
   * Réutilise EXACTEMENT le même compilateur que la demande explicite à Laura
   * (`BriefingService.dayClosure`, GA-26) : jamais une seconde règle de
   * « qu'est-ce qui reste ouvert ». Une boucle ouverte, ici, c'est une tâche
   * qui attend une décision (`toDecide`) ou un fil sortant resté sans réponse
   * (`waitingOn.threads`) — les deux sections que #2392.1 nomme en premier.
   * `results`/`commitments`/`blocked` ne comptent pas comme ouverts : ce sont
   * des faits DU JOUR, pas des boucles qui attendent encore quelqu'un.
   */
  private async eveningClosurePrompt(userId: string, now: Date): Promise<RoutineOutcome> {
    const closure = await this.briefing.dayClosure(userId, now)
    const openLoops = closure.toDecide.length + closure.waitingOn.threads.length
    if (openLoops === 0) return quiet('Aucune boucle ouverte à clôturer ce soir.')

    return {
      notified: true,
      outcome: `${openLoops} boucle(s) ouverte(s) à clôturer.`,
      notification: {
        title: 'Ta journée a des boucles ouvertes',
        body: `${openLoops} chose${openLoops > 1 ? 's' : ''} à trancher avant de clôturer.`,
        link: '/chat',
      },
    }
  }

  /**
   * #2392.2 (lot clôture c1, 26/09) — même compilateur EXACT que
   * `eveningClosurePrompt` ci-dessus, seuls le moment (fin de semaine) et le
   * libellé changent. GA-26 : une dérivation vit à un seul endroit.
   */
  private async endOfWeekClosurePrompt(userId: string, now: Date): Promise<RoutineOutcome> {
    const closure = await this.briefing.dayClosure(userId, now)
    const openLoops = closure.toDecide.length + closure.waitingOn.threads.length
    if (openLoops === 0) return quiet('Aucune boucle ouverte à clôturer avant le week-end.')

    return {
      notified: true,
      outcome: `${openLoops} boucle(s) ouverte(s) à clôturer avant le week-end.`,
      notification: {
        title: 'Ta semaine a des boucles ouvertes',
        body: `${openLoops} chose${openLoops > 1 ? 's' : ''} à trancher avant le week-end.`,
        link: '/chat',
      },
    }
  }

  /** #2392.2 — voir `endOfWeekClosurePrompt` : même compilateur, positionné
   * juste avant `weeklyRecap`/`weeklyForecast` (le moment de la revue manager). */
  private async preManagerReviewClosurePrompt(userId: string, now: Date): Promise<RoutineOutcome> {
    const closure = await this.briefing.dayClosure(userId, now)
    const openLoops = closure.toDecide.length + closure.waitingOn.threads.length
    if (openLoops === 0) return quiet('Aucune boucle ouverte avant la revue manager.')

    return {
      notified: true,
      outcome: `${openLoops} boucle(s) ouverte(s) avant la revue manager.`,
      notification: {
        title: 'Clôture ta journée avant la revue',
        body: `${openLoops} chose${openLoops > 1 ? 's' : ''} à trancher avant ta revue avec ton manager.`,
        link: '/chat',
      },
    }
  }

  private async dailyBriefing(userId: string, now: Date): Promise<RoutineOutcome> {
    const briefing = await this.briefing.build(userId, now)
    if (!briefing.actions.length) {
      return quiet('Aucune action à proposer ce matin.')
    }
    const first = briefing.actions[0]
    return {
      notified: true,
      outcome: `${briefing.actions.length} action(s) proposée(s).`,
      notification: {
        title: briefing.firstName ? `${briefing.firstName}, voici ta journée` : 'Voici ta journée',
        // Le corps reste court : la notification amène à l'écran, elle ne le remplace pas.
        body: `${briefing.actions.length} action${briefing.actions.length > 1 ? 's' : ''} à traiter aujourd'hui.`,
        link: first?.href ?? '/briefing',
      },
    }
  }

  private async meetingPrep(userId: string, now: Date, workspaceId = ''): Promise<RoutineOutcome> {
    // La veille au soir : on regarde les 24 h qui suivent, pas la journée en cours.
    const tomorrowEnd = new Date(now.getTime() + 24 * 3600_000)
    const events = await this.agenda.listEvents(userId, {
      from: now.toISOString(),
      to: tomorrowEnd.toISOString(),
      limit: 50,
    })
    const external = events.filter(event => event.isExternal && !event.cancelled)
    if (!external.length) return quiet('Aucun rendez-vous client dans les 24 h.')

    // #2390.4/#2390.17 (épopée #2926) — l'ABSENCE de préparation devient une
    // proposition d'action, pas seulement un rappel qui se réaffiche chaque
    // soir : une tâche par rendez-vous (jamais deux, `target_id` déduplique),
    // et seulement pour un rendez-vous rattaché à un compte par DOMAINE
    // (preuve) — jamais par titre, trop faible pour écrire sans geste humain.
    const created = await this.createMissingMeetingPreparationTasks(userId, workspaceId, external)

    return {
      notified: true,
      outcome: `${external.length} rendez-vous client à préparer.${created ? ` ${created} tâche(s) de préparation proposée(s).` : ''}`,
      notification: {
        title: `${external.length} rendez-vous client à préparer`,
        body: external
          .slice(0, 3)
          .map(event => event.summary ?? 'Rendez-vous')
          .join(' · '),
        link: '/briefing',
      },
    }
  }

  /**
   * #2390.4/#2390.17 (épopée #2926) — propose UNE tâche de préparation par
   * rendez-vous externe encore sans dossier ouvert. `@Optional()` sur
   * `planItems` (comme le reste de cette classe) : sans dépôt branché, ce
   * bilan reste `0`, comportement inchangé d'avant ce point.
   *
   * `target_kind: 'meeting'` / `target_id: event.id` est le même couple que
   * `markPreparationTasksObsolete` (#2390.18) referme déjà à l'annulation —
   * cette méthode-ci est celle qui manquait pour que la ligne existe avant
   * d'être refermée. `source: 'pipeline'` : une décision automatique et
   * déterministe, ni saisie humaine, ni import connecteur, ni sortie modèle.
   */
  private async createMissingMeetingPreparationTasks(
    userId: string,
    workspaceId: string,
    events: readonly AgendaEvent[],
  ): Promise<number> {
    if (!this.planItems || !workspaceId) return 0
    const accounts = await this.briefing.accountsForMeetingDomainMatch(workspaceId)
    if (!accounts.length) return 0

    let created = 0
    for (const event of events) {
      const account = matchAccountByDomain(event, accounts)
      if (!account) continue

      const existing = await this.planItems.findOne({
        where: { user_id: userId, target_kind: 'meeting', target_id: event.id },
      })
      if (existing) continue

      await this.planItems.save(
        this.planItems.create({
          user_id: userId,
          account_id: account.id,
          source_plan_id: null,
          label: event.summary
            ? `Préparer le rendez-vous avec ${account.company_name} — ${event.summary}`
            : `Préparer le rendez-vous avec ${account.company_name}`,
          week_index: 0,
          step_index: 0,
          done: false,
          execution_status: 'todo',
          snoozed_until: null,
          assigned_to: null,
          owner_name: null,
          reason: null,
          expected_outcome: null,
          kpi: null,
          channel: 'meeting',
          contact_id: null,
          cadence_step: null,
          target_kind: 'meeting',
          target_id: event.id,
          target_label: event.summary ?? null,
          source: 'pipeline',
          source_at: new Date(),
          due_date: event.start ? event.start.slice(0, 10) : null,
          completed_at: null,
          last_reminded_on: null,
        }),
      )
      created += 1
    }
    return created
  }

  /**
   * #2843 (#2205.45) — LE PLAFOND, DISTINCT de la cible calculée. Bornée à UN
   * brouillon par passage jusqu'à ce lot (entier littéral) ; `maxItemsPerRun`
   * la rend réglable, 1 à `ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.max` — jamais « vider
   * toute la file en un tour » (chaque brouillon coûte un appel modèle,
   * #2205.42/.61). `null`/`undefined` (aucun plafond réglé) retombe sur `1` :
   * comportement BYTE-IDENTIQUE à avant ce champ, texte de sortie inclus.
   */
  private async noReplyFollowUp(
    userId: string,
    maxItemsPerRun?: number | null,
    workspaceId = '',
  ): Promise<RoutineOutcome> {
    const result = await this.mailbox.search(userId, {
      intent: 'no_reply',
      windowDays: 60,
      silenceDays: 7,
      limit: 20,
    })
    if (!result.threads.length) return quiet('Aucun fil en attente de réponse.')

    const oldest = result.threads[0]
    const cap = Math.min(Math.max(maxItemsPerRun ?? 1, 1), ROUTINE_MAX_ITEMS_PER_RUN_BOUNDS.max)
    const prepared: { thread: MailThread; proofRef: string | null }[] = []
    for (const thread of result.threads.slice(0, cap)) {
      const draft = await this.prepareFollowUpDraft(userId, thread, workspaceId)
      if (draft) prepared.push({ thread, proofRef: draft.proofRef })
    }
    const first = prepared[0]

    return {
      notified: true,
      outcome:
        prepared.length === 0
          ? `${result.threads.length} fil(s) sans réponse.`
          : prepared.length === 1
            ? `${result.threads.length} fil(s) sans réponse — une relance préparée pour ${first?.thread.counterpart}.`
            : `${result.threads.length} fil(s) sans réponse — ${prepared.length} relances préparées.`,
      notification: {
        title: `${result.threads.length} interlocuteur${result.threads.length > 1 ? 's' : ''} sans réponse`,
        body:
          prepared.length === 0
            ? oldest?.counterpart
              ? `Le plus ancien : ${oldest.counterpart}, silencieux depuis ${oldest.daysSinceLastMessage ?? '?'} jours.`
              : 'Ouvre ta messagerie pour préparer les relances.'
            : prepared.length === 1
              ? `Une relance est prête dans tes brouillons pour ${first?.thread.counterpart}, silencieux depuis ${first?.thread.daysSinceLastMessage ?? '?'} jours.`
              : `${prepared.length} relances sont prêtes dans tes brouillons.`,
        link: '/mailbox',
      },
      // #2205.54 — `undefined` quand rien n'a été tenté (aucun brouillon),
      // sinon la preuve du PREMIER brouillon préparé — même schéma qu'avant
      // ce lot (`proofRef` reste singulier, pas un tableau).
      ...(oldest ? { proofRef: first?.proofRef ?? null } : {}),
    }
  }

  /**
   * #2398.13/#2205.38 (épopée #2843) — « Test (dry-run avant activation) »
   * de `no_reply_follow_up`, SEULE routine où le calcul de la cible
   * (`mailbox.search`, lecture pure) est déjà séparé de l'écriture
   * ({@link prepareFollowUpDraft}). Reproduit exactement la lecture que
   * {@link noReplyFollowUp} ferait, sans jamais appeler `IaClient` ni
   * `MailboxService.createDraft` — même garantie ZÉRO écriture que
   * `PlaybooksService.dryRun` (§43/G5 du rapport).
   */
  async dryRunNoReplyFollowUp(userId: string): Promise<NoReplyFollowUpDryRun> {
    const result = await this.mailbox.search(userId, {
      intent: 'no_reply',
      windowDays: 60,
      silenceDays: 7,
      limit: 20,
    })
    const oldest = result.threads[0] ?? null
    if (!oldest) {
      return { threadsFound: 0, oldest: null, wouldPrepareDraft: false, blockedReason: 'no_thread' }
    }

    const base = {
      threadsFound: result.threads.length,
      oldest: { counterpart: oldest.counterpart, daysSinceLastMessage: oldest.daysSinceLastMessage },
    }
    if (!this.ia || !oldest.contactId || !oldest.counterpart) {
      return { ...base, wouldPrepareDraft: false, blockedReason: 'no_contact' }
    }
    const status = await this.mailbox.status(userId)
    if (!status.connected || !status.capabilities.draft) {
      return { ...base, wouldPrepareDraft: false, blockedReason: 'mailbox_not_ready' }
    }
    if (this.credits && !(await this.credits.hasEnrichmentCredit(userId))) {
      return { ...base, wouldPrepareDraft: false, blockedReason: 'no_credit' }
    }
    return { ...base, wouldPrepareDraft: true, blockedReason: null }
  }

  /**
   * #2398.10 (épopée #2843) — l'étape 4 de l'EXEMPLE routine relances de
   * l'issue (« préparer les messages ») : un brouillon RÉEL, jamais envoyé.
   * `createDraft` ne dépose que dans les Brouillons PERSONNELS de
   * l'utilisateur (D58) — aucun chemin d'envoi n'existe derrière cette
   * méthode, exactement comme pour la carte de chat `generate_message` /
   * `prepare_mail_draft` qu'elle réutilise ici sans en dupliquer la logique.
   *
   * Bornée à UN brouillon par passage (le fil le plus ancien) : la routine se
   * relance à son prochain horaire, elle n'a pas besoin de vider toute la
   * file en un tour, et un seul appel modèle par passage borde le coût.
   * Best-effort : `@Optional()`, capacité brouillon absente, fil sans contact
   * identifié ou génération en échec retombent tous sur `false` — la
   * notification retrouve alors son texte d'avant ce lot, jamais une routine
   * qui casse.
   *
   * Aucun garde de salle de démonstration ICI : `RoutinesService.runDueFor`
   * (le SEUL appelant, contrôleur et scheduler confondus) le pose déjà tout en
   * haut et ne descend jamais jusqu'à l'exécuteur pour un espace de
   * démonstration (GA-07 : ne pas importer un second service — ici
   * `WorkspaceContextService` — pour re-vérifier ce que l'appelant garantit
   * déjà).
   */
  private async prepareFollowUpDraft(
    userId: string,
    thread: MailThread,
    workspaceId: string,
  ): Promise<{ proofRef: string | null } | null> {
    if (!this.ia) return null
    if (!thread.contactId || !thread.counterpart) return null
    try {
      const status = await this.mailbox.status(userId)
      if (!status.connected || !status.capabilities.draft) return null
      // #2205.42/#2205.61 — même lecture SANS DÉBIT que l'enrichissement
      // organigramme/contacts : un solde épuisé refuse AVANT l'appel modèle,
      // jamais un appel payé pour un brouillon qui ne sert à personne.
      if (this.credits && !(await this.credits.hasEnrichmentCredit(userId))) return null
      // #3405.3 — jamais de relance automatique sur un compte en NO-GO : le
      // fil garde sa notification d'avant ce lot, sans brouillon.
      if (await this.crmRoutines.messageRefusalForContact(thread.contactId)) return null
      // #2205.53 — ce que l'appel a coûté, fournisseur par fournisseur, lu dans
      // l'en-tête de réponse (même patron que `need_play`). Écrit même si le
      // brouillon échoue ensuite : l'appel modèle, lui, a bien eu lieu.
      let costHeader: string | null = null
      const envelope = await this.ia.generateMessage(
        { userId, contactId: thread.contactId, channel: 'email' },
        { responseHeaderName: IA_COST_HEADER, onResponseHeader: (_name, value) => (costHeader = value) },
      )
      await this.providerCosts?.recordHeader(costHeader, {
        workspaceId,
        userId,
        feature: 'routine_no_reply_follow_up',
      })
      const body = envelope.data?.['body']
      if (!envelope.success || typeof body !== 'string' || !body.trim()) return null
      const subject = envelope.data?.['subject']
      const created = await this.mailbox.createDraft(userId, {
        to: thread.counterpart,
        cc: [],
        subject:
          typeof subject === 'string' && subject.trim()
            ? subject
            : `Relance — ${thread.subject ?? 'suite de notre échange'}`,
        body,
        threadId: thread.threadId,
        appendSignature: true,
        documentIds: [],
      })
      // #2205.54 — MÊME dérivation que `mailDraftHasProof` (GA-26,
      // `action-router.service.ts::dispatchMailDraft`) : un `draftId` seul,
      // sans `messageId`/`threadId`, n'est pas une preuve vérifiable. Le
      // brouillon reste PRÉPARÉ (comportement inchangé) ; seule la preuve,
      // absente, ne s'invente pas.
      // #4181.3 — consigné pour son contact : une réponse reçue ensuite retire ce
      // brouillon. Best-effort, le brouillon est déjà déposé.
      try {
        await this.mailbox.recordFollowUpDraft(userId, thread.contactId, created.draftId)
      } catch (cause) {
        this.logger.warn('routine relances : brouillon non consigné', { error: cause })
      }
      return { proofRef: mailDraftHasProof(created) ? (created.webUrl ?? created.draftId) : null }
    } catch (error) {
      this.logger.warn('routine relances : préparation du brouillon impossible', { error })
      return null
    }
  }

  private async positiveReplies(userId: string): Promise<RoutineOutcome> {
    const result = await this.mailbox.search(userId, {
      intent: 'positive_reply',
      windowDays: 14,
      silenceDays: 7,
      limit: 10,
    })
    if (!result.threads.length) return quiet('Aucune réponse favorable en attente.')

    return {
      notified: true,
      outcome: `${result.threads.length} réponse(s) favorable(s).`,
      notification: {
        title: `${result.threads.length} réponse${result.threads.length > 1 ? 's' : ''} favorable${result.threads.length > 1 ? 's' : ''}`,
        body: 'Enchaîne pendant que le sujet est chaud.',
        link: '/mailbox',
      },
    }
  }

  private async agendaConflicts(userId: string, now: Date): Promise<RoutineOutcome> {
    const conflicts = await this.agenda.conflicts(userId, {
      from: now.toISOString(),
      to: new Date(now.getTime() + 7 * 24 * 3600_000).toISOString(),
      limit: 200,
    })
    if (!conflicts.length) return quiet('Aucun chevauchement dans les sept jours.')

    const first = conflicts[0]
    return {
      notified: true,
      outcome: `${conflicts.length} chevauchement(s).`,
      notification: {
        title: `${conflicts.length} conflit${conflicts.length > 1 ? 's' : ''} d'agenda`,
        body: first
          ? `${first.first.summary ?? 'Rendez-vous'} et ${first.second.summary ?? 'rendez-vous'} se chevauchent de ${first.overlapMinutes} min.`
          : '',
        link: '/briefing',
      },
    }
  }

  private async emptyPipeline(userId: string, now: Date): Promise<RoutineOutcome> {
    const horizon = new Date(now.getTime() + 3 * 24 * 3600_000)
    const events = await this.agenda.listEvents(userId, {
      from: now.toISOString(),
      to: horizon.toISOString(),
      limit: 100,
    })
    const external = events.filter(event => event.isExternal && !event.cancelled)
    if (external.length) return quiet(`${external.length} rendez-vous client déjà prévus.`)

    return {
      notified: true,
      outcome: 'Aucun rendez-vous client dans les trois jours.',
      notification: {
        title: 'Aucun rendez-vous client dans les trois jours',
        body: 'Bloque des créneaux de prospection pendant que ton agenda est libre.',
        link: '/briefing',
      },
    }
  }

  /**
   * #2782 / #2392.6 — LA REVUE HEBDOMADAIRE, au-delà des rendez-vous TENUS.
   *
   * Le catalogue (`routine-catalog.ts`) promet « tes actions de la semaine et
   * l'état de tes comptes » ; cette routine ne lisait que l'agenda, un signal
   * qui ne dit rien de ce qui a RÉELLEMENT avancé. `projectsDecidedThisWeek`
   * apporte le second signal — jamais un compte d'e-mails, de clics ou
   * d'actions (#2392.7, doctrine « pas de vanity metrics ») : une DÉCISION
   * obtenue, gagnée ou perdue, nommée séparément — jamais un solde net qui les
   * confondrait.
   *
   * `measured` AVANT le test de vide, même patron que les cinq automatisations
   * CRM (`stalledProjects`, etc.) : une lecture cassée n'est pas « aucune
   * décision cette semaine », c'est « je n'ai pas pu vérifier ».
   */
  private async weeklyRecap(userId: string, now: Date, workspaceId = ''): Promise<RoutineOutcome> {
    const weekStart = new Date(now.getTime() - 5 * 24 * 3600_000)
    const events = await this.agenda.listEvents(userId, {
      from: weekStart.toISOString(),
      to: now.toISOString(),
      limit: 200,
    })
    const held = events.filter(event => event.isExternal && !event.cancelled)

    const decided = workspaceId
      ? await this.crmRoutines.projectsDecidedThisWeek(workspaceId, weekStart)
      : { measured: true, rows: [] }
    const wonRows = decided.rows.filter(row => row.stage === 'won')
    const lostRows = decided.rows.filter(row => row.stage === 'lost')

    if (!held.length && !decided.rows.length) {
      return quiet(
        decided.measured
          ? 'Aucun rendez-vous client tenu et aucune décision obtenue cette semaine.'
          : 'Aucun rendez-vous client tenu cette semaine — les décisions sur les dossiers n’ont pas pu être vérifiées.',
      )
    }

    // #2782 / #2392.6 — « besoins ouverts », séparément des dossiers décidés
    // ci-dessus. Lu SEULEMENT quand la routine notifie déjà (au moins un
    // rendez-vous tenu ou une décision) : un compte de besoins ouverts est un
    // état PERMANENT, pas un événement de la semaine — l'ajouter au portillon
    // « quiet » du dessus ferait notifier quasiment chaque vendredi, même sans
    // rien qui se soit passé.
    const openNeeds = workspaceId ? await this.crmRoutines.openNeeds(workspaceId) : { measured: true, rows: [] }

    const parts: string[] = []
    if (held.length) parts.push(`${held.length} rendez-vous client tenu${held.length > 1 ? 's' : ''}`)
    if (wonRows.length)
      parts.push(`${wonRows.length} dossier${wonRows.length > 1 ? 's' : ''} gagné${wonRows.length > 1 ? 's' : ''}`)
    if (lostRows.length)
      parts.push(`${lostRows.length} dossier${lostRows.length > 1 ? 's' : ''} perdu${lostRows.length > 1 ? 's' : ''}`)
    if (!decided.measured) parts.push('les décisions sur les dossiers n’ont pas pu être vérifiées')
    if (openNeeds.measured) {
      if (openNeeds.rows.length)
        parts.push(
          `${openNeeds.rows.length} besoin${openNeeds.rows.length > 1 ? 's' : ''} encore ouvert${openNeeds.rows.length > 1 ? 's' : ''}`,
        )
    } else {
      parts.push('les besoins ouverts n’ont pas pu être vérifiés')
    }

    return {
      notified: true,
      outcome: `${held.length} rendez-vous client tenus, ${wonRows.length} dossier(s) gagné(s), ${lostRows.length} dossier(s) perdu(s), ${openNeeds.rows.length} besoin(s) ouvert(s).`,
      notification: {
        title: 'Récapitulatif de la semaine',
        body: `${parts.join(', ')}. Le détail est dans « Aujourd’hui ».`,
        link: '/briefing',
      },
    }
  }

  /**
   * Fins de mission en CASCADE T-45 / T-30 / T-15 (§5.4 n°5, déclencheur n°13).
   *
   * #2398.5 (épopée #2843) — elle n'avait qu'un seuil de trente jours : même
   * notification à J-29 et à J-3. Les trois paliers vivent dans
   * `mission-ending-cascade.ts` ; la notification NOMME chaque palier non vide
   * (un palier vide ne fait aucune ligne).
   *
   * Une mission sans date de fin n'alerte jamais : on ne peut pas anticiper une
   * échéance qu'on ne connaît pas, et l'inventer ferait relancer un client au
   * hasard. La sélection est faite par `selectEndingMissions`, testée à part.
   */
  private async missionEnding(userId: string): Promise<RoutineOutcome> {
    const snapshot = await this.ats.snapshot(userId, { endingWithinDays: MISSION_ENDING_WINDOW_DAYS })
    // Le palier est recalculé ICI depuis `daysRemaining` : une mission sans palier ne compte pas.
    const staged = snapshot.endingMissions.filter(mission => missionEndingStage(mission.daysRemaining) !== null)
    if (!staged.length) return quiet('Aucune mission ne se termine dans les quarante-cinq jours.')

    const perStage = MISSION_ENDING_STAGES_DAYS.map(days => ({
      stage: `T-${days}`,
      count: staged.filter(mission => missionEndingStage(mission.daysRemaining) === `T-${days}`).length,
    })).filter(entry => entry.count > 0)
    const closest = staged[0]
    return {
      notified: true,
      outcome: `${staged.length} mission(s) à échéance (${perStage.map(entry => `${entry.stage} : ${entry.count}`).join(', ')}).`,
      notification: {
        title: `${staged.length} mission${staged.length > 1 ? 's' : ''} se termine${staged.length > 1 ? 'nt' : ''} bientôt`,
        body: `${perStage.map(entry => `${entry.stage} : ${entry.count}`).join(' · ')}. La plus proche : ${closest.consultantName ?? closest.title}${closest.companyName ? ` chez ${closest.companyName}` : ''}, dans ${closest.daysRemaining} jours.`,
        link: '/consultants',
      },
    }
  }

  /**
   * #2398.5 — missions terminées sans retour d'expérience (« REX ») recueilli.
   *
   * `rexForWorkspace` calcule déjà « REX en attente » pour l'onglet Preuves &
   * REX d'un compte — cette routine RAPPELLE la même liste à l'échelle de
   * l'espace, elle ne recalcule ni n'invente rien. Le retour lui-même ne se
   * fabrique jamais : sans lui, la mission reste nommée « en attente ».
   */
  private async missionRexReminder(workspaceId: string): Promise<RoutineOutcome> {
    if (!workspaceId) return quiet('Aucun espace de travail résolu.')
    if (!this.capitalisation) return quiet('La capitalisation n’est pas disponible.')
    const { pending } = await this.capitalisation.rexForWorkspace(workspaceId)
    if (!pending.length) return quiet('Aucun retour de mission en attente.')

    // La plus ANCIENNE d'abord — une mission sans date de fin connue ne
    // passe jamais devant une mission datée (on ne devine pas une échéance
    // qu'on ne connaît pas, même pour du tri).
    const oldest = [...pending].sort((a, b) => {
      if (!a.ended_on) return 1
      if (!b.ended_on) return -1
      return a.ended_on.localeCompare(b.ended_on)
    })[0]

    return {
      notified: true,
      outcome: `${pending.length} retour(s) de mission en attente.`,
      notification: {
        title: `${pending.length} retour${pending.length > 1 ? 's' : ''} de mission en attente`,
        body: oldest ? `À commencer par « ${oldest.label} ».` : 'Ouvre la capitalisation pour les recueillir.',
        link: '/pilotage/rex',
      },
    }
  }

  /** #2398.2 — le vivier dormant : elle NOTIFIE, le recruteur écrit lui-même. */
  private async dormantPoolResurface(workspaceId: string): Promise<RoutineOutcome> {
    const { measured, rows } = await this.talentRoutines.dormantPool(workspaceId)
    if (!measured) return quiet('Le vivier n’a pas pu être vérifié — rien n’a été mesuré.')
    if (!rows.length) return quiet('Aucun candidat dormant.')
    const oldest = rows[0]
    return {
      notified: true,
      outcome: `${rows.length} candidat(s) dormant(s).`,
      notification: {
        title: `${rows.length} candidat${rows.length > 1 ? 's' : ''} à recontacter`,
        body: oldest ? `Le plus ancien : ${oldest.full_name}, sans contact depuis ${oldest.days} jours.` : '',
        link: oldest ? `/consultants/${oldest.id}` : '/consultants',
      },
    }
  }

  /**
   * #3413.2 (beta:metier #3413, 30/09/2026) — LE POINT J+7, entre le
   * démarrage d'une mission (`mission_start_readiness.service.ts`) et sa fin
   * (`mission_end.service.ts`) : rien ne rappelait qu'un premier point avec
   * le client et le consultant restait à faire une semaine après le début.
   *
   * Elle ne collecte rien : le point lui-même reste écrit par un humain sur
   * le double pouls de satisfaction déjà existant
   * (`MissionFeedbackService.checkinJ7ForWorkspace`, #2412) — jamais une note
   * inventée. Même patron que `missionRexReminder` juste au-dessus : la plus
   * ANCIENNE d'abord.
   */
  private async missionCheckinJ7Reminder(workspaceId: string, now: Date): Promise<RoutineOutcome> {
    if (!workspaceId) return quiet('Aucun espace de travail résolu.')
    if (!this.missionFeedback) return quiet('Le suivi de mission n’est pas disponible.')
    const pending = await this.missionFeedback.checkinJ7ForWorkspace(workspaceId, now)
    if (!pending.length) return quiet('Aucun point à sept jours en attente.')

    const oldest = pending[0]
    return {
      notified: true,
      outcome: `${pending.length} point(s) à sept jours en attente.`,
      notification: {
        title: `${pending.length} point${pending.length > 1 ? 's' : ''} à sept jours en attente`,
        body: oldest ? `À commencer par « ${oldest.label} ».` : 'Ouvre la mission pour déposer le point.',
        link: oldest ? `/missions/${oldest.mission_id}` : '/missions',
      },
    }
  }

  /**
   * Épopée #2873 (#2367.14, LOT c5 clôture 26/09) — une séquence vient de
   * passer `completed` (`OutreachService.stepDone`) : SIGNALE une proposition
   * de mise à jour CRM sur le contact, jamais une écriture (doctrine « une
   * écriture CRM/ERP passe par une porte »). `items` (une occurrence par
   * SÉQUENCE), même patron que `meetingCancelled` : un événement, pas un état
   * qui dure, pour que l'idempotence par objet évite de re-signaler demain la
   * même séquence.
   *
   * Fenêtre de sept jours : assez large pour survivre à un run manqué (la
   * routine est `weekdays`), assez étroite pour rester « une séquence qui
   * vient de finir » plutôt qu'un historique.
   */
  private async sequenceCompletedCrmUpdate(workspaceId: string, now: Date): Promise<RoutineOutcome> {
    if (!workspaceId) return quiet('Aucun espace de travail résolu.')
    if (!this.outreachSequences) return quiet('Les séquences d’outreach ne sont pas disponibles.')

    const since = new Date(now.getTime() - 7 * 24 * 3600_000)
    const rows = await this.outreachSequences
      .createQueryBuilder('sequence')
      .innerJoin('contacts', 'contact', 'contact.id = sequence.contact_id')
      .where('sequence.workspace_id = :workspaceId', { workspaceId })
      .andWhere("sequence.status = 'completed'")
      .andWhere('sequence.completed_at IS NOT NULL AND sequence.completed_at >= :since', { since })
      .select(['sequence.id AS id', 'sequence.contact_id AS contact_id', 'sequence.completed_at AS completed_at'])
      .addSelect('contact.full_name', 'contact_name')
      .orderBy('sequence.completed_at', 'DESC')
      .getRawMany<{ id: string; contact_id: string; completed_at: Date; contact_name: string | null }>()

    if (!rows.length) return quiet('Aucune séquence terminée récemment.')

    return {
      notified: false,
      outcome: `${rows.length} séquence(s) terminée(s) — mise à jour CRM à proposer.`,
      items: rows.map(row => ({
        objectId: row.id,
        outcome: `Séquence terminée sur ${row.contact_name ?? 'un contact'} — CRM à mettre à jour.`,
        notification: {
          title: 'Séquence terminée',
          body: row.contact_name
            ? `${row.contact_name} a atteint la fin de sa séquence — propose une mise à jour de ton CRM.`
            : 'Un contact a atteint la fin de sa séquence — propose une mise à jour de ton CRM.',
          link: `/contacts/${row.contact_id}`,
        },
      })),
    }
  }

  /** Consultants sans mission depuis plus de trente jours (déclencheur n°14). */
  private async benchAlert(userId: string): Promise<RoutineOutcome> {
    const snapshot = await this.ats.snapshot(userId, { benchMinDays: 30 })
    if (!snapshot.benchedConsultants.length) return quiet('Aucun consultant en intercontrat prolongé.')

    const longest = snapshot.benchedConsultants[0]
    return {
      notified: true,
      outcome: `${snapshot.benchedConsultants.length} consultant(s) en intercontrat.`,
      notification: {
        title: `${snapshot.benchedConsultants.length} consultant${snapshot.benchedConsultants.length > 1 ? 's' : ''} en intercontrat`,
        body: longest
          ? `Le plus ancien : ${longest.fullName}, disponible depuis ${longest.daysWithoutMission} jours.`
          : '',
        link: '/consultants',
      },
    }
  }

  /**
   * Les disponibilités saisies il y a plus de soixante jours (PDF-02 §3.3).
   *
   * Le corps NOMME le profil le plus ancien, comme partout ailleurs ici :
   * « 6 disponibilités à reconfirmer » ne dit pas par où commencer, et une liste
   * sans point d'entrée ne se traite pas.
   *
   * ⚠️ Aucun nombre de jours n'est écrit ici : il vient de la ligne, qui le
   * tient de `AVAILABILITY_REVALIDATION_DAYS`. Le recopier dans la phrase le
   * ferait mentir le jour où le seuil bouge.
   */
  private async availabilityReconfirm(workspaceId: string): Promise<RoutineOutcome> {
    const { measured, rows } = await this.talentRoutines.availabilityToReconfirm(workspaceId)
    // ⚠️ `measured` AVANT le test de vide, et les deux phrases sont
    // différentes : une lecture cassée n'est pas « aucune disponibilité à
    // reconfirmer », c'est « je n'ai pas pu vérifier ». Les confondre
    // transforme une panne SQL en rapport rassurant — le même défaut que
    // celui corrigé côté CRM (D715/GA-196), même correctif (D733/GA-199).
    if (!measured) return quiet('Les disponibilités n’ont pas pu être vérifiées — rien n’a été mesuré.')
    if (!rows.length) return quiet('Aucune disponibilité à reconfirmer.')

    const oldest = rows[0]
    return {
      notified: true,
      outcome: `${rows.length} disponibilité(s) à reconfirmer.`,
      notification: {
        title: `${rows.length} disponibilité${rows.length > 1 ? 's' : ''} à reconfirmer`,
        body: oldest ? `La plus ancienne : ${oldest.full_name}, annoncée il y a ${oldest.days} jours.` : '',
        link: '/consultants',
      },
    }
  }

  /**
   * #3061 / #2374.19 — le seul reste de l'épopée, une fois le point d'ancrage
   * posé : rien ne faisait RESSURGIR une pause « pas maintenant » à échéance
   * SANS que quelqu'un ouvre la fiche contact. Même patron que
   * `availabilityReconfirm` : une notification qui NOMME, jamais une reprise —
   * la reprise reste `resume()`, un geste humain (#2381.8), qui revérifie déjà
   * le poste. Contexte/signal/pertinence ne sont PAS évalués par cette routine
   * (aucune mesure fiable n'existe) — nommés en toutes lettres plutôt que
   * tus, doctrine GA-18/GA-19.
   */
  private async notNowRevalidation(workspaceId: string): Promise<RoutineOutcome> {
    const { measured, rows } = await this.crmRoutines.notNowDeferredsDue(workspaceId)
    if (!measured) return quiet('Les pauses « pas maintenant » n’ont pas pu être vérifiées — rien n’a été mesuré.')
    if (!rows.length) return quiet('Aucune pause « pas maintenant » à revérifier.')

    const oldest = rows[0]
    return {
      notified: true,
      outcome: `${rows.length} pause(s) « pas maintenant » à revérifier.`,
      notification: {
        title: `${rows.length} pause${rows.length > 1 ? 's' : ''} « pas maintenant » à revérifier`,
        body: oldest
          ? `${oldest.full_name}, en pause depuis ${oldest.days} jours${
              oldest.poste_still_valid ? '' : ' — poste changé depuis'
            }. Contexte, signal et pertinence restent à revoir avant toute reprise.`
          : '',
        link: '/contacts',
      },
    }
  }

  /** Contacts CRM sans activité depuis trente jours (déclencheur n°15). */
  private async crmFollowUps(userId: string): Promise<RoutineOutcome> {
    const stale = await this.crm.listStaleContacts(userId, 30, 20)
    if (!stale.length) return quiet('Aucun contact CRM sans activité depuis trente jours.')

    const first = stale[0]
    return {
      notified: true,
      outcome: `${stale.length} contact(s) sans activité.`,
      notification: {
        title: `${stale.length} contact${stale.length > 1 ? 's' : ''} sans activité depuis un mois`,
        body: first?.name ? `Le plus ancien : ${first.name}.` : 'Ouvre ton CRM pour reprendre le fil.',
        link: '/contacts',
      },
    }
  }

  /**
   * Rendez-vous dans l'heure (déclencheur n°3).
   *
   * Une occurrence PAR rendez-vous : le deuxième de la journée doit être
   * annoncé lui aussi, et le premier ne doit pas l'être quatre fois.
   */
  private async meetingChecklist(userId: string, now: Date): Promise<RoutineOutcome> {
    const horizon = new Date(now.getTime() + 90 * 60_000)
    const events = await this.agenda.listEvents(userId, {
      from: now.toISOString(),
      to: horizon.toISOString(),
      limit: 20,
    })
    const soon = events.filter(event => event.isExternal && !event.cancelled)
    if (!soon.length) return quiet('Aucun rendez-vous client dans les 90 minutes.')

    return {
      notified: false,
      outcome: `${soon.length} rendez-vous imminent(s).`,
      items: soon.map(event => ({
        objectId: event.id,
        outcome: `Rendez-vous « ${event.summary ?? 'sans titre'} » annoncé.`,
        notification: {
          title: `Rendez-vous dans moins d'une heure : ${event.summary ?? 'client'}`,
          body: [
            event.attendees
              .filter(attendee => attendee.external)
              .map(attendee => attendee.displayName ?? attendee.email)
              .join(', '),
            event.conferenceUrl ? 'Lien visio prêt.' : 'Aucun lien visio sur cet évènement.',
          ]
            .filter(Boolean)
            .join(' · '),
          link: '/briefing',
        },
      })),
    }
  }

  /**
   * Après le rendez-vous (déclencheur n°4).
   *
   * On ouvre la fenêtre à 30 minutes après la fin et on la ferme à 4 heures :
   * au-delà, la notification arrive alors que le commercial est passé à autre
   * chose, et une relance tardive se fait couper.
   */
  private async meetingFollowUp(userId: string, now: Date): Promise<RoutineOutcome> {
    const events = await this.agenda.listEvents(userId, {
      from: new Date(now.getTime() - 6 * 3600_000).toISOString(),
      to: now.toISOString(),
      limit: 20,
    })
    const finished = events.filter(event => {
      if (!event.isExternal || event.cancelled || !event.end) return false
      const ended = Date.parse(event.end)
      if (Number.isNaN(ended)) return false
      const sinceEnd = now.getTime() - ended
      return sinceEnd >= 30 * 60_000 && sinceEnd <= 4 * 3600_000
    })
    if (!finished.length) return quiet('Aucun rendez-vous client vient de se terminer.')

    return {
      notified: false,
      outcome: `${finished.length} rendez-vous à conclure.`,
      items: finished.map(event => ({
        objectId: event.id,
        outcome: `Suivi proposé pour « ${event.summary ?? 'sans titre'} ».`,
        notification: {
          title: `Conclure : ${event.summary ?? 'rendez-vous client'}`,
          body: 'Écris la note, pose la tâche de suivi et prépare le récapitulatif pendant que c’est frais.',
          link: '/briefing',
        },
      })),
    }
  }

  /**
   * Rendez-vous annulé (déclencheur n°5).
   *
   * Les créneaux proposés sont calculés sur l'agenda RÉEL, pas suggérés au
   * hasard : proposer une heure déjà occupée fait perdre un second échange.
   */
  private async meetingCancelled(userId: string, now: Date): Promise<RoutineOutcome> {
    const events = await this.agenda.listEvents(userId, {
      from: new Date(now.getTime() - 24 * 3600_000).toISOString(),
      to: new Date(now.getTime() + 14 * 24 * 3600_000).toISOString(),
      limit: 100,
    })
    const cancelled = events.filter(event => event.cancelled && event.isExternal)
    if (!cancelled.length) return quiet('Aucune annulation détectée.')

    const slots = await this.agenda.freeSlots(userId, {
      from: now.toISOString(),
      to: new Date(now.getTime() + 10 * 24 * 3600_000).toISOString(),
      durationMinutes: 60,
      workdayStartHour: 9,
      workdayEndHour: 18,
      workdays: [1, 2, 3, 4, 5],
      timeZone: 'Europe/Paris',
      limit: 3,
    })

    const closed = await this.closeLinkedActions(
      userId,
      cancelled.map(event => event.id),
    )

    const obsolete = await this.markPreparationTasksObsolete(
      userId,
      cancelled.map(event => event.id),
    )

    return {
      notified: false,
      outcome: `${cancelled.length} annulation(s).${closed ? ` ${closed} rappel(s)/événement(s) lié(s) clôturé(s).` : ''}${obsolete ? ` ${obsolete} tâche(s) de préparation caduque(s).` : ''}`,
      items: cancelled.map(event => ({
        objectId: event.id,
        outcome: `Replanification proposée pour « ${event.summary ?? 'sans titre'} ».`,
        notification: {
          title: `Annulé : ${event.summary ?? 'rendez-vous client'}`,
          body: slots.length
            ? `${slots.length} créneau(x) libre(s) trouvé(s) pour reproposer une date.`
            : 'Aucun créneau libre dans les dix prochains jours ouvrés.',
          link: '/briefing',
        },
      })),
    }
  }

  /**
   * #2390.18 (épopée #2926) — la cascade côté PLAN : une action qui vise ce
   * rendez-vous (`target_kind = 'meeting'`, `target_id` = l'id de l'évènement)
   * et qui est encore ouverte passe `obsolete` (caduque). Tâche INTERNE :
   * jamais un envoi, jamais une écriture d'agenda externe. Marquée, jamais
   * supprimée ; une tâche déjà faite (`done`) ou déjà caduque n'est pas visée.
   */
  private async markPreparationTasksObsolete(userId: string, eventIds: string[]): Promise<number> {
    if (!this.planItems || !eventIds.length) return 0
    const result = await this.planItems.update(
      {
        user_id: userId,
        target_kind: 'meeting',
        target_id: In(eventIds),
        execution_status: In(['todo', 'prepared', 'snoozed']),
      },
      { execution_status: 'obsolete', snoozed_until: null },
    )
    return result.affected ?? 0
  }

  /**
   * #2390.18 (épopée #2926) — ferme le SEUL objet qui référence réellement un
   * évènement d'agenda dans ce dépôt : la ligne `user_actions` que le routeur
   * d'actions écrit avec `calendar_event_id` (`action-router.service.ts`)
   * quand un rappel ou un événement a été posé pour ce rendez-vous. Aucun
   * brief/tâche/notification n'a de lien équivalent ailleurs (recherché,
   * vide) — les fermer en plus inventerait un lien qui n'existe pas.
   *
   * On ARCHIVE (statut `Annulé` dans les métadonnées), on ne supprime jamais
   * la ligne — même règle que le reste du journal d'activité. Idempotent :
   * une ligne déjà `Annulé` ne se réécrit pas. `@Optional()` : sans dépôt
   * branché, le comportement reste EXACTEMENT celui d'avant (aucune
   * fermeture, la routine continue comme si ce dépôt n'existait pas).
   */
  private async closeLinkedActions(userId: string, eventIds: string[]): Promise<number> {
    if (!this.userActions || !eventIds.length) return 0
    let closed = 0
    for (const eventId of eventIds) {
      const rows = await this.userActions
        .createQueryBuilder('a')
        .where('a.user_id = :userId', { userId })
        .andWhere("a.metadata ->> 'calendar_event_id' = :eventId", { eventId })
        .getMany()
      for (const row of rows) {
        if (row.metadata?.['status'] === 'Annulé') continue
        row.metadata = { ...row.metadata, status: 'Annulé', cancelled_reason: 'Rendez-vous annulé dans l’agenda' }
        await this.userActions.save(row)
        closed += 1
      }
    }
    return closed
  }

  /**
   * Veille sur une intention de messagerie (déclencheurs n°10, 11, 12).
   *
   * Trois déclencheurs, un seul exécuteur : « appels d'offres », « contrats à
   * signer » et « factures en souffrance » sont la MÊME mécanique — une
   * intention de recherche, un décompte, une notification. Les dupliquer aurait
   * produit trois copies qui auraient divergé.
   */
  private async mailWatch(
    userId: string,
    intent: 'tender' | 'contract' | 'invoice',
    label: string,
    link: string,
  ): Promise<RoutineOutcome> {
    const result = await this.mailbox.search(userId, {
      intent,
      windowDays: 30,
      silenceDays: 7,
      limit: 15,
    })
    if (!result.threads.length) return quiet(`Aucun ${label} dans les trente derniers jours.`)

    const first = result.threads[0]
    return {
      notified: true,
      outcome: `${result.threads.length} fil(s) « ${label} ».`,
      notification: {
        title: `${result.threads.length} ${label}${result.threads.length > 1 ? 's' : ''} à traiter`,
        body: first?.subject ? `Le plus récent : ${first.subject}.` : 'Ouvre ta messagerie pour les traiter.',
        link,
      },
    }
  }

  /** Propositions sans suite depuis sept jours (déclencheur n°16). */
  private async stalledProposals(userId: string): Promise<RoutineOutcome> {
    const stale = await this.crm.listStaleContacts(userId, 7, 20)
    if (!stale.length) return quiet('Aucune proposition sans suite depuis sept jours.')

    return {
      notified: true,
      outcome: `${stale.length} proposition(s) sans suite.`,
      notification: {
        title: `${stale.length} échange${stale.length > 1 ? 's' : ''} sans suite depuis une semaine`,
        body: 'Une relance courte suffit souvent à rouvrir la conversation.',
        link: '/contacts',
      },
    }
  }

  /**
   * Doublons du CRM (déclencheur n°17).
   *
   * On PROPOSE, jamais on ne fusionne : fusionner est irréversible côté CRM et
   * un faux positif détruit l'historique d'un vrai client.
   */
  private async crmDuplicates(userId: string): Promise<RoutineOutcome> {
    const pairs = await this.crm.findDuplicates(userId, 25)
    if (!pairs.length) return quiet('Aucun doublon probable détecté.')

    const certain = pairs.filter(pair => pair.reason === 'same_email').length
    return {
      notified: true,
      outcome: `${pairs.length} paire(s) suspecte(s), dont ${certain} sur la même adresse.`,
      notification: {
        title: `${pairs.length} doublon${pairs.length > 1 ? 's' : ''} probable${pairs.length > 1 ? 's' : ''} dans ton CRM`,
        body: certain
          ? `${certain} partagent exactement la même adresse. Rien n'est fusionné : à toi de valider.`
          : 'Rapprochements par nom et société. Rien n’est fusionné : à toi de valider.',
        link: '/contacts',
      },
    }
  }

  /**
   * CV reçus en pièce jointe (déclencheur n°18).
   *
   * L'indexation passe par le pipeline RAG existant. Un fichier qu'on ne sait
   * pas extraire est SAUTÉ plutôt qu'ingéré vide : un document vide dans la base
   * de connaissance est pire qu'un document absent, parce qu'il répond.
   */
  private async cvIntake(userId: string): Promise<RoutineOutcome> {
    const result = await this.mailbox.search(userId, {
      intent: 'cv',
      windowDays: 7,
      silenceDays: 7,
      limit: 10,
    })
    if (!result.threads.length) return quiet('Aucun CV reçu cette semaine.')

    return {
      notified: true,
      outcome: `${result.threads.length} message(s) avec CV.`,
      notification: {
        title: `${result.threads.length} CV reçu${result.threads.length > 1 ? 's' : ''} cette semaine`,
        body: 'Ouvre le message pour ajouter le document à ta base de connaissance.',
        link: '/mailbox',
      },
    }
  }

  /** Lundi matin : la semaine qui commence (déclencheur n°23). */
  private async mondayKickstart(userId: string, now: Date): Promise<RoutineOutcome> {
    const weekEnd = new Date(now.getTime() + 5 * 24 * 3600_000)
    const events = await this.agenda.listEvents(userId, {
      from: now.toISOString(),
      to: weekEnd.toISOString(),
      limit: 100,
    })
    const meetings = events.filter(event => event.isExternal && !event.cancelled)
    const slots = await this.agenda.freeSlots(userId, {
      from: now.toISOString(),
      to: weekEnd.toISOString(),
      durationMinutes: 60,
      workdayStartHour: 9,
      workdayEndHour: 18,
      workdays: [1, 2, 3, 4, 5],
      timeZone: 'Europe/Paris',
      limit: 20,
    })

    return {
      notified: true,
      outcome: `${meetings.length} rendez-vous, ${slots.length} créneaux libres.`,
      notification: {
        title: 'La semaine qui commence',
        body: `${meetings.length} rendez-vous client prévus et ${slots.length} créneaux d'une heure encore libres.`,
        link: '/briefing',
      },
    }
  }

  /** Hygiène mensuelle du CRM (déclencheur n°24). */
  private async crmHygiene(userId: string): Promise<RoutineOutcome> {
    const incomplete = await this.crm.findIncomplete(userId, 100)
    if (!incomplete.length) return quiet('Aucune fiche incomplète.')

    const missingEmail = incomplete.filter(entry => entry.missing.includes('email')).length
    return {
      notified: true,
      outcome: `${incomplete.length} fiche(s) incomplète(s).`,
      notification: {
        title: `${incomplete.length} fiche${incomplete.length > 1 ? 's' : ''} incomplète${incomplete.length > 1 ? 's' : ''} dans ton CRM`,
        body: missingEmail
          ? `${missingEmail} sans adresse : impossible de leur écrire en l'état.`
          : 'Société ou nom manquants sur certaines fiches.',
        link: '/contacts',
      },
    }
  }

  /**
   * Les CV repérés dans l'espace documentaire (D17).
   *
   * Elle SIGNALE et n'ingère RIEN. Un CV avalé sans que personne le sache
   * créerait des fiches de vivier — avec les données personnelles qui vont
   * avec — sur la seule foi d'un nom de fichier. L'import reste un geste.
   */
  private async cvFolderWatch(userId: string, now: Date): Promise<RoutineOutcome> {
    if (!this.zeroLayer) return quiet('Aucun espace documentaire connecté.')
    const found = await this.zeroLayer.findRecentCvs(userId, 7, now)
    if (!found.length) return quiet('Aucun CV repéré cette semaine.')
    const first = found[0]
    return {
      notified: true,
      outcome: `${found.length} fichier(s) repéré(s).`,
      notification: {
        title: `${found.length} CV repéré${found.length > 1 ? 's' : ''} dans tes documents`,
        // Le NOM du premier fichier : « 4 CV repérés » n'aide pas à décider
        // s'il faut ouvrir. Et « repéré » reste le mot — rien n'a été lu.
        body: first ? `Dont « ${first.title} ». Rien n'a été importé : à toi de choisir.` : '',
        link: '/consultants',
      },
    }
  }

  /* ── Les cinq automatisations CRM du §13 (PDF 2) ────────────────────────── */
  //
  // Toutes en N1 : elles préparent et notifient. Aucune n'écrit, aucune
  // n'envoie — un projet immobile n'appelle pas un message automatique au
  // client, il appelle une décision du commercial.

  private async stalledProjects(workspaceId: string): Promise<RoutineOutcome> {
    const { measured, rows } = await this.crmRoutines.stalledProjects(workspaceId)
    // ⚠️ `measured` AVANT le test de vide, et les deux phrases sont
    // différentes : une lecture cassée n'est pas « aucun projet immobile »,
    // c'est « je n'ai pas pu vérifier ». Les confondre transforme une panne
    // SQL en rapport rassurant — exactement le défaut que ce chantier corrige.
    if (!measured) return quiet('Les projets immobiles n’ont pas pu être vérifiés — rien n’a été mesuré.')
    if (!rows.length) return quiet('Aucun projet immobile.')
    const oldest = rows[0]
    return {
      notified: true,
      outcome: `${rows.length} projet(s) immobile(s).`,
      notification: {
        title: `${rows.length} projet${rows.length > 1 ? 's' : ''} qui n'avance${rows.length > 1 ? 'nt' : ''} plus`,
        // Le plus ancien est NOMMÉ : « 6 projets immobiles » ne dit pas par où
        // commencer, et une liste sans point d'entrée ne se traite pas.
        body: oldest ? `Le plus ancien : ${oldest.label} — ${oldest.days} jours à la même étape.` : '',
        link: '/projects',
      },
    }
  }

  private async staleAccountPlans(workspaceId: string): Promise<RoutineOutcome> {
    const { measured, rows } = await this.crmRoutines.staleAccountPlans(workspaceId)
    if (!measured) return quiet('Les plans de compte n’ont pas pu être vérifiés — rien n’a été mesuré.')
    if (!rows.length) return quiet('Tous les plans sont à jour.')
    const oldest = rows[0]
    return {
      notified: true,
      outcome: `${rows.length} plan(s) à rafraîchir.`,
      notification: {
        title: `${rows.length} plan${rows.length > 1 ? 's' : ''} de compte à revoir`,
        body: oldest ? `Le plus ancien : ${oldest.company_name}, ${oldest.days} jours.` : '',
        link: '/accounts',
      },
    }
  }

  private async needsWithoutShortlist(workspaceId: string): Promise<RoutineOutcome> {
    const { measured, rows } = await this.crmRoutines.needsWithoutShortlist(workspaceId)
    if (!measured) return quiet('Les besoins sans shortlist n’ont pas pu être vérifiés — rien n’a été mesuré.')
    if (!rows.length) return quiet('Chaque besoin ouvert a sa shortlist.')
    const oldest = rows[0]
    return {
      notified: true,
      outcome: `${rows.length} besoin(s) sans shortlist.`,
      notification: {
        title: `${rows.length} besoin${rows.length > 1 ? 's' : ''} sans profil proposé`,
        body: oldest ? `Le plus ancien : ${oldest.title}, ouvert depuis ${oldest.days} jours.` : '',
        link: '/projects/needs',
      },
    }
  }

  private async parkedAccountSignal(workspaceId: string): Promise<RoutineOutcome> {
    // Deux déclencheurs, et le second manquait : un compte écarté ne se
    // rouvrait QUE si quelque chose bougeait, si bien qu'un « pas de budget »
    // de janvier restait fermé pour toujours dans un compte silencieux. Or
    // c'est exactement le cas du bêta testeur — un « non » a une durée de vie.
    //
    // Les deux lectures partent en parallèle et sont INDÉPENDANTES : si l'une
    // casse, l'autre continue de compter, et ce qu'elle a mesuré sort quand
    // même — la résilience du §13 ne recule pas sur une routine qui combine
    // deux calculs.
    const [movedResult, dueResult] = await Promise.all([
      this.crmRoutines.parkedAccountsWithSignal(workspaceId),
      this.crmRoutines.accountsDueForReexamination(workspaceId),
    ])
    const moved = movedResult.rows
    const due = dueResult.rows

    if (!moved.length && !due.length) {
      // Rien à montrer des deux côtés : encore faut-il savoir si c'est parce
      // que rien ne bouge, ou parce qu'on n'a pas pu regarder. Une seule des
      // deux lectures en échec suffit à rendre le silence suspect.
      if (!movedResult.measured || !dueResult.measured) {
        return quiet('Les comptes écartés n’ont pas pu être vérifiés — rien n’a été mesuré.')
      }
      return quiet('Aucun compte écarté à revoir.')
    }

    const first = moved[0] ?? due[0]
    const parts = [
      moved.length ? `${moved.length} avec du nouveau` : null,
      due.length ? `${due.length} dont le refus a fait son temps` : null,
    ].filter(Boolean)
    const total = moved.length + due.length

    return {
      notified: true,
      outcome: `${total} compte(s) écarté(s) à revoir : ${parts.join(', ')}.`,
      notification: {
        title: `${total} compte${total > 1 ? 's' : ''} écarté${total > 1 ? 's' : ''} à revoir`,
        // Le MOTIF de l'écart est rappelé : sans lui, on rouvre un compte sans
        // se souvenir de ce qui l'avait fait fermer.
        body: first
          ? `${first.company_name}${first.gate_reason ? ` — écarté pour « ${first.gate_reason} »` : ''}.`
          : '',
        link: '/accounts?gate=parked',
      },
    }
  }

  private async contactJobChange(workspaceId: string, now: Date = new Date()): Promise<RoutineOutcome> {
    // #4016.L2 — relire d'abord l'employeur courant des champions : la détection
    // ci-dessous compare ce que l'annuaire vient de dire au compte suivi.
    const movedChampionIds = await this.refreshChampionEmployment(workspaceId, now)
    const { measured, rows } = await this.crmRoutines.contactsWhoMayHaveMoved(workspaceId)
    // `rows` peut être non vide même si `measured` est `false` : une des deux
    // jointures (comptes, ESN) a pu casser pendant que l'autre trouvait
    // quelque chose — voir la résilience documentée sur
    // `contactsWhoMayHaveMoved`. Ce n'est QUE quand il n'y a rien à montrer
    // que la distinction « rien » / « pas pu vérifier » doit être écrite.
    if (!rows.length) {
      return measured
        ? quiet('Aucun changement de poste repéré.')
        : quiet('Les changements de poste n’ont pas pu être vérifiés — rien n’a été mesuré.')
    }
    const first = rows[0]

    // Le DOUBLE traitement du tome 1 §11.4 : le badge RISQUE reste sur le compte
    // d'origine — il dit une vérité, ne plus écrire à cette personne là-bas — et
    // une PORTE s'ouvre sur le nouveau compte quand celui-ci est déjà suivi.
    // Jusqu'ici la routine ne faisait que la première moitié, et le cas que le
    // tome appelle « le plus rentable des six » ne produisait rien.
    const { doors, paused } = await this.applyJobChanges(workspaceId, rows)

    // #4016.L2 — « ton champion a changé de boîte » : le premier contact repéré
    // est un champion dont l'annuaire vient de nommer un autre employeur.
    const championMoved = first !== undefined && movedChampionIds.has(first.contact_id)
    const extras = [
      doors > 0 ? `${doors} porte(s) ouverte(s)` : null,
      paused > 0 ? `${paused} séquence(s) mise(s) en pause` : null,
    ].filter((part): part is string => part !== null)

    return {
      notified: true,
      outcome: `${rows.length} contact(s) à vérifier${extras.length ? `, ${extras.join(', ')}` : ''}.`,
      notification: {
        title: championMoved
          ? MOVED_CHAMPION_TITLE
          : `${rows.length} contact${rows.length > 1 ? 's' : ''} a peut-être changé de poste`,
        // « peut-être » est dans le titre, et il y reste : la comparaison porte
        // sur des libellés, donc elle se trompe parfois.
        body: first
          ? [
              `${first.full_name}, rattaché à ${first.company_name}.`,
              doors > 0 ? `${doors} porte(s) créée(s) chez leur nouvel employeur.` : null,
              paused > 0 ? `${paused} séquence(s) en pause en attendant vérification.` : null,
            ]
              .filter(Boolean)
              .join(' ')
          : '',
        link: '/contacts',
      },
    }
  }

  /**
   * #2845 — l'employeur ne correspond plus au compte suivi : les séquences ACTIVES de ce contact se mettent en PAUSE
   * (cause `contact_to_verify`), tous porteurs confondus, en attendant qu'un humain vérifie. `openDoorFromMove`
   * couvre l'autre moitié (le nouvel employeur) ; les deux sont indépendantes l'une de l'autre.
   *
   * #4286.13 — extrait de `contactJobChange` pour que la relecture déclenchée par l'ouverture d'une fiche pose le
   * MÊME signal, la MÊME porte et la MÊME pause que la routine : un seul chemin.
   */
  private async applyJobChanges(
    workspaceId: string,
    moves: readonly ContactMove[],
  ): Promise<{ doors: number; paused: number }> {
    let doors = 0
    let paused = 0
    for (const move of moves) {
      if (await this.crmRoutines.openDoorFromMove(workspaceId, move)) doors += 1
      paused += await this.crmRoutines.pauseSequencesForJobChange(workspaceId, move.contact_id)
      await this.recordJobChange(workspaceId, move)
    }
    return { doors, paused }
  }

  /**
   * #4016.L2 / #4286.13 — LA relecture de l'employeur d'UN contact : un seul exemplaire, appelé par la routine
   * mensuelle ET par l'ouverture d'une fiche. `null` quand le fournisseur n'est pas configuré ou en panne (le passage
   * n'est pas daté, il sera retenté) ; sinon le contrôle est consigné et `changed` dit si l'employeur observé diffère
   * de celui connu.
   */
  private async rereadContactEmployment(
    workspaceId: string,
    target: EmploymentCheckTarget,
    now: Date,
  ): Promise<{ changed: boolean } | null> {
    if (!this.ia) return null
    const employerRef = (target.account_name ?? target.organization ?? '').trim()
    if (employerRef === '') return null
    // Apollo Professional (02/11) : People-Match (parcours DATÉ) remplace la recherche par nom — mesure du 01/11,
    // 20/20 justes contre 0/17 sur les départs. Payant (1 crédit, tracé D19) : un contact, un geste, jamais un balayage.
    const reading = await this.ia.employmentFreshness({ apolloId: target.apollo_id, employerRef })
    // Panne / sans identifiant : le passage n'est pas daté, il sera retenté. Jamais un échec pris pour un état.
    if (reading.status === 'unavailable' || reading.status === 'no_identifier') return null
    const organization = reading.organization ?? ''
    const accountName = target.account_name ?? null
    if (reading.status === 'ok' && reading.state === 'left') {
      // « Parti » seulement sur un parcours daté ; l'employeur actuel n'est écrit que s'il est nommé.
      const seen = organization ? { organization, title: '' } : null
      await this.crmRoutines.recordEmploymentCheck(workspaceId, target.contact_id, seen, now, accountName, {
        state: 'left',
        ...(reading.leftOn ? { leftOn: reading.leftOn } : {}),
      })
      return { changed: true }
    }
    if (reading.status === 'ok' && reading.state === 'in_post') {
      await this.crmRoutines.recordEmploymentCheck(
        workspaceId,
        target.contact_id,
        { organization: organization || employerRef, title: '' },
        now,
        accountName,
        { state: 'confirmed' },
      )
      return { changed: false }
    }
    // Inconnu (parcours muet) ou aucune correspondance : « non retrouvé », jamais « parti » ni une probabilité.
    await this.crmRoutines.recordEmploymentCheck(workspaceId, target.contact_id, null, now, accountName, {
      state: 'not_found',
    })
    return { changed: false }
  }

  /**
   * #4286.13 (Louis 22/10/2026) — « on relit le contact quand on va dessus sur sa fiche au bout d'un mois ». Appelée
   * par le worker de la file `employment-recheck`, jamais par la requête de la fiche. Même relecture que la routine
   * ({@link rereadContactEmployment}) ; si l'employeur a changé, le même signal, la même porte et la même pause
   * ({@link applyJobChanges}), pour CE contact seulement. Sans client IA ou sans clé côté annuaire : aucun effet.
   * Jamais fatale.
   */
  async recheckContactEmployment(workspaceId: string, contactId: string, now: Date = new Date()): Promise<void> {
    if (!this.ia || !workspaceId) return
    try {
      const target = await this.crmRoutines.employmentCheckTargetFor(workspaceId, contactId)
      if (!target) return
      const reread = await this.rereadContactEmployment(workspaceId, target, now)
      if (!reread?.changed) return
      const { rows } = await this.crmRoutines.contactsWhoMayHaveMoved(workspaceId)
      await this.applyJobChanges(
        workspaceId,
        rows.filter(row => row.contact_id === contactId),
      )
    } catch (error) {
      this.logger.warn('Relecture de l’employeur à l’ouverture de la fiche en échec (non fatal)', { error })
    }
  }

  /**
   * #4016.L2 — relit, au plus `CHAMPION_EMPLOYMENT_CHECK_PER_RUN` champions par
   * passage, leur employeur courant auprès de l'annuaire professionnel sous
   * contrat. Réglage absent ⇒ 0 ⇒ aucun appel (no-op strict). Un fournisseur non
   * configuré ou en panne ne date PAS le passage (il sera retenté) ; une réponse
   * vide ou sans la fiche le date, sans toucher l'employeur connu. Jamais fatal.
   */
  private async refreshChampionEmployment(workspaceId: string, now: Date): Promise<Set<string>> {
    const moved = new Set<string>()
    const limit = championEmploymentCheckLimit(process.env['CHAMPION_EMPLOYMENT_CHECK_PER_RUN'])
    if (limit === 0 || !this.ia || !workspaceId) return moved
    try {
      const targets = await this.crmRoutines.championsDueForEmploymentCheck(workspaceId, limit)
      for (const target of targets) {
        try {
          const reread = await this.rereadContactEmployment(workspaceId, target, now)
          // #4016.2c — seul un champion déclenche « ton champion a changé de boîte ».
          if (reread?.changed && target.is_champion) moved.add(target.contact_id)
        } catch (error) {
          this.logger.warn('Relecture de l’employeur d’un champion en échec (non fatal)', { error })
        }
      }
    } catch (error) {
      this.logger.warn('Relecture des champions en échec (non fatal)', { error })
    }
    return moved
  }

  /**
   * #3918.2 (lot M01, 09/10/2026) — « un contact connu a changé de poste »
   * rejoint le registre canonique (#2875) : le détecteur réel
   * (`contactsWhoMayHaveMoved`) existait, son appelant n'écrivait aucun
   * `TriggerEvent`. Le sujet est le CONTACT ; le fait nomme l'ancien
   * rattachement et l'employeur déclaré, comme la notification. Consigné une
   * fois par contact (`recordOnce`) : la routine repasse chaque jour.
   * Best-effort : un registre en échec ne fait jamais taire la routine.
   */
  private async recordJobChange(workspaceId: string, move: ContactMove): Promise<void> {
    if (!this.recordTrigger) return
    try {
      const event = buildTriggerEvent({
        type: 'contact_changement_poste',
        source: 'routines',
        subjectType: 'contact',
        subjectId: move.contact_id,
        workspaceId,
        ownerId: null,
        // Même prudence que le titre de la notification : la comparaison porte
        // sur des libellés, l'evidence dit ce qui est observé, pas une certitude.
        evidence:
          `${move.full_name} : employeur déclaré « ${move.new_employer} », rattaché jusqu'ici à ${move.company_name}.`.slice(
            0,
            500,
          ),
        confidence: 'estimee',
        now: new Date(),
      })
      await this.recordTrigger(event, 'routines/routine-executors.contactJobChange', {
        accountId: move.new_account_id,
        factOccurredAt: null,
      })
    } catch (error) {
      this.logger.warn('Événement canonique « contact_changement_poste » en échec (non fatal)', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /** Revue trimestrielle (déclencheur n°25). */
  private async quarterlyReview(userId: string): Promise<RoutineOutcome> {
    // Le brief du jour agrège déjà agenda, messagerie et comptes : on s'en sert
    // comme sonde plutôt que de recalculer un second jeu de chiffres qui
    // divergerait du premier.
    const briefing = await this.briefing.build(userId)
    return {
      notified: true,
      outcome: 'Revue trimestrielle annoncée.',
      notification: {
        title: 'Revue du trimestre',
        body: `${briefing.accountsToWatch.length} compte(s) suivis ont bougé. Le détail est dans Pilotage.`,
        link: '/pilotage',
      },
    }
  }

  /**
   * #2782 / #2392.8 — « LA REVUE PRÉPARE LES DONNÉES. ELLE NE FABRIQUE PAS UNE
   * PRÉVISION SI LES ÉLÉMENTS SONT INSUFFISANTS. »
   *
   * `projectsExpectedToCloseSoon` lit une date SAISIE par le commercial
   * (`expected_close_on`), jamais dérivée ni pondérée : cette routine NOMME les
   * dossiers dont l'échéance tombe dans la semaine et s'ARRÊTE là — aucune
   * probabilité, aucun montant pondéré, aucun taux. Quand personne n'a saisi
   * d'échéance, elle le DIT (« pas assez d'éléments ») plutôt que de rendre un
   * silence qui se lirait comme « rien à prévoir ».
   *
   * `measured` AVANT le test de vide, même patron que `weeklyRecap` : une
   * lecture cassée n'est pas « pas assez d'éléments », c'est « je n'ai pas pu
   * vérifier ».
   */
  private async weeklyForecast(userId: string, now: Date, workspaceId = ''): Promise<RoutineOutcome> {
    const start = new Date(now.getTime() + 3 * 24 * 3600_000)
    const end = new Date(start.getTime() + 7 * 24 * 3600_000)
    const events = await this.agenda.listEvents(userId, {
      from: start.toISOString(),
      to: end.toISOString(),
      limit: 200,
    })
    const slots = computeFreeSlots(
      events,
      { from: start, to: end },
      {
        durationMinutes: 60,
        workdayStartHour: 9,
        workdayEndHour: 18,
        workdays: [1, 2, 3, 4, 5],
        timeZone: 'Europe/Paris',
        limit: 20,
      },
    )
    const external = events.filter(event => event.isExternal && !event.cancelled)

    const expected = workspaceId
      ? await this.crmRoutines.projectsExpectedToCloseSoon(workspaceId, start, end)
      : { measured: true, rows: [] }
    const nearest = expected.rows[0]
    const forecastLine = !expected.measured
      ? 'Les échéances de dossiers n’ont pas pu être vérifiées.'
      : expected.rows.length === 0
        ? 'Aucune échéance de dossier saisie cette semaine — pas assez d’éléments pour préparer un forecast.'
        : `${expected.rows.length} dossier${expected.rows.length > 1 ? 's' : ''} attendu${expected.rows.length > 1 ? 's' : ''} à échéance${nearest ? `, à commencer par « ${nearest.label} »` : ''}.`

    return {
      notified: true,
      outcome: `${external.length} rendez-vous, ${slots.length} créneaux libres, ${expected.rows.length} dossier(s) attendu(s).`,
      notification: {
        title: 'La semaine prochaine',
        body: `${external.length} rendez-vous client prévus, ${slots.length} créneaux d'une heure encore libres. ${forecastLine}`,
        link: '/briefing',
      },
    }
  }

  /**
   * #2916 (#2399.2, LAU-FINAL-113) — « Signaler un compte sans prochaine
   * action ». Interpole `accountsWithoutNextActionCountSql` (le MÊME prédicat
   * que le compteur de tête du portefeuille et la ligne Qualité des données,
   * GA-26) plutôt que de recompter les comptes ici une quatrième fois — et,
   * depuis #3851 (lot W01), sans passer par `DataHygieneService` : la requête
   * s'exécute directement sur `dataSource`, exactement comme le fait le
   * cockpit lui-même. `dataSource` absent (specs à constructeur nu) ⇒ `quiet` :
   * comportement identique à une lecture non mesurée. Une requête qui échoue
   * (connexion coupée) rend la même chose — jamais un faux zéro.
   */
  private async accountsWithoutNextAction(workspaceId: string): Promise<RoutineOutcome> {
    if (!this.dataSource) return quiet('La qualité des données n’a pas pu être vérifiée — rien n’a été mesuré.')
    let count: number | null
    try {
      const [row] = await this.dataSource.query<{ n: string; total: string | null }[]>(
        accountsWithoutNextActionCountSql(),
        [workspaceId],
      )
      count = row ? Number(row.n ?? 0) : null
    } catch {
      count = null
    }
    if (count === null) {
      return quiet('La qualité des données n’a pas pu être vérifiée — rien n’a été mesuré.')
    }
    if (count === 0) return quiet('Chaque compte suivi a une prochaine action.')
    return {
      notified: true,
      outcome: `${count} compte(s) suivi(s) sans prochaine action.`,
      notification: {
        title: `${count} compte${count > 1 ? 's' : ''} sans prochaine action`,
        body: `${count} compte${count > 1 ? 's' : ''} suivi${count > 1 ? 's' : ''} n'a${count > 1 ? 'nt' : ''} aucune tâche ouverte à échéance.`,
        link: '/accounts',
      },
    }
  }

  /**
   * #2916 (#2399.2, Louis 15/10/2026) — LES CINQ LECTURES DU PIPELINE. Elles NOTIFIENT, n'écrivent rien,
   * n'envoient rien. `measured` AVANT le test de vide (une panne SQL n'est pas « rien à signaler »).
   */
  private async dealCloseDateSoon(workspaceId: string): Promise<RoutineOutcome> {
    const { measured, rows } = await this.crmRoutines.dealCloseDatesSoon(workspaceId)
    if (!measured) return quiet('Les échéances de décision n’ont pas pu être vérifiées — rien n’a été mesuré.')
    const closest = rows[0]
    if (!closest) return quiet('Aucune affaire ouverte n’a de clôture prévue dans les quatorze jours.')
    return {
      notified: true,
      outcome: `${rows.length} affaire(s) à échéance proche.`,
      notification: {
        title: `${rows.length} affaire${rows.length > 1 ? 's' : ''} à décider d’ici deux semaines`,
        body: `La plus proche : ${closest.label} — clôture prévue ${closest.days === 0 ? 'aujourd’hui' : `dans ${closest.days} jour${closest.days > 1 ? 's' : ''}`}.`,
        link: '/projects',
      },
    }
  }

  private async dealCloseDateOverdue(workspaceId: string): Promise<RoutineOutcome> {
    const { measured, rows } = await this.crmRoutines.dealCloseDatesOverdue(workspaceId)
    if (!measured) return quiet('Les dates de clôture n’ont pas pu être vérifiées — rien n’a été mesuré.')
    const latest = rows[0]
    if (!latest) return quiet('Aucune affaire ouverte n’a dépassé sa date de clôture prévue.')
    return {
      notified: true,
      outcome: `${rows.length} affaire(s) au-delà de leur date de clôture.`,
      notification: {
        title: `${rows.length} affaire${rows.length > 1 ? 's' : ''} au-delà de leur date de clôture`,
        body: `La plus en retard : ${latest.label} — ${latest.days} jour${latest.days > 1 ? 's' : ''} de retard, toujours ouverte.`,
        link: '/projects',
      },
    }
  }

  private async dealWithoutCloseDate(workspaceId: string): Promise<RoutineOutcome> {
    const { measured, rows } = await this.crmRoutines.dealsWithoutCloseDate(workspaceId)
    if (!measured) return quiet('Les dates de clôture n’ont pas pu être vérifiées — rien n’a été mesuré.')
    if (!rows.length) return quiet('Chaque affaire proche de signer a une date de clôture prévue.')
    return {
      notified: true,
      outcome: `${rows.length} affaire(s) proche(s) de signer sans date de clôture.`,
      notification: {
        title: `${rows.length} affaire${rows.length > 1 ? 's' : ''} proche${rows.length > 1 ? 's' : ''} de signer sans date de clôture`,
        body: `Sans date, ${rows.length > 1 ? 'elles ne figurent' : 'elle ne figure'} pas dans le prévisionnel.`,
        link: '/projects',
      },
    }
  }

  private async wonDealExpansion(workspaceId: string): Promise<RoutineOutcome> {
    const { measured, rows } = await this.crmRoutines.wonDealsToExpand(workspaceId)
    if (!measured) return quiet('Les affaires gagnées n’ont pas pu être vérifiées — rien n’a été mesuré.')
    const oldest = rows[0]
    if (!oldest) return quiet('Aucun compte gagné récemment n’est sans affaire en cours.')
    return {
      notified: true,
      outcome: `${rows.length} compte(s) gagné(s) sans suite ouverte.`,
      notification: {
        title: `${rows.length} compte${rows.length > 1 ? 's' : ''} gagné${rows.length > 1 ? 's' : ''} sans suite en cours`,
        body: `Le plus ancien : ${oldest.company_name} — affaire gagnée il y a ${oldest.days} jours, aucune autre ouverte.`,
        link: '/accounts',
      },
    }
  }

  private async lostDealRevisit(workspaceId: string): Promise<RoutineOutcome> {
    const { measured, rows } = await this.crmRoutines.lostDealsToRevisit(workspaceId)
    if (!measured) return quiet('Les affaires perdues n’ont pas pu être vérifiées — rien n’a été mesuré.')
    const oldest = rows[0]
    if (!oldest) return quiet('Aucune affaire perdue n’arrive au moment d’être reprise.')
    // Le motif n'est nommé que s'il a été DÉCLARÉ : jamais « motif : non renseigné » en guise de motif.
    const reason = oldest.loss_reason?.trim() ? ` (motif déclaré : ${oldest.loss_reason.trim()})` : ''
    return {
      notified: true,
      outcome: `${rows.length} affaire(s) perdue(s) à reprendre.`,
      notification: {
        title: `${rows.length} affaire${rows.length > 1 ? 's' : ''} perdue${rows.length > 1 ? 's' : ''} à reprendre`,
        body: `La plus ancienne : ${oldest.company_name} — perdue il y a ${oldest.days} jours${reason}, aucune affaire ouverte depuis.`,
        link: '/accounts',
      },
    }
  }
  /**
   * #2843.1-.6 (lot L13) — UN exécuteur pour les huit lectures neuves : lire,
   * se taire sur un fait mesuré, dire « non mesuré » sur un échec, sinon
   * nommer l'objet le plus urgent. Rien n'est écrit, rien n'est envoyé.
   */
  private async l13Read(key: L13ReadKey, workspaceId: string): Promise<RoutineOutcome> {
    if (!workspaceId) return quiet('Aucun espace de travail résolu.')
    const copy = L13_COPY[key]
    const { measured, rows } = await copy.read(this.talentRoutines, workspaceId)
    if (!measured) return quiet(`${copy.subject} : lecture en échec — rien n’a été mesuré.`)
    const first = rows[0]
    if (!first) return quiet(copy.none)
    return {
      notified: true,
      outcome: `${rows.length} ${copy.unit(rows.length)}.`,
      notification: {
        title: `${rows.length} ${copy.unit(rows.length)}`,
        body: copy.body(first),
        link: copy.link(first),
      },
    }
  }

  /**
   * #2102.45 — le rappel T-1 : la veille, à l'heure réglée par l'abonnement,
   * les rendez-vous EXTERNES du lendemain. Il prépare, il n'écrit à personne.
   */
  private async meetingReminderT1(userId: string, now: Date): Promise<RoutineOutcome> {
    const from = new Date(now.getTime() + 24 * 3600_000)
    from.setUTCHours(0, 0, 0, 0)
    const to = new Date(from.getTime() + 24 * 3600_000)
    const events = await this.agenda.listEvents(userId, { from: from.toISOString(), to: to.toISOString(), limit: 20 })
    const tomorrow = events.filter(event => event.isExternal && !event.cancelled)
    if (!tomorrow.length) return quiet('Aucun rendez-vous externe demain.')
    return {
      notified: true,
      outcome: `${tomorrow.length} rendez-vous externe(s) demain.`,
      notification: {
        title: `${tomorrow.length} rendez-vous demain`,
        body: `${tomorrow.map(event => event.summary ?? 'Rendez-vous sans titre').join(' · ')} — la préparation t’attend.`,
        link: '/briefing',
      },
    }
  }
}

type L13ReadKey =
  | 'interview_upcoming'
  | 'interview_feedback_missing'
  | 'team_mission_risks'
  | 'blocked_needs'
  | 'mission_documents_pending'
  | 'mission_start_deadlines'
  | 'mission_renewal_to_engage'
  | 'consultant_repositioning'

const plural = (n: number, one: string, many: string): string => (n > 1 ? many : one)
const named = (row: L13Row): string => row.full_name ?? row.label ?? row.title ?? row.name ?? 'sans nom'
const inDays = (row: L13Row): string => (row.days === null || row.days === undefined ? '' : ` (${row.days} j)`)

/** #2843 (L13) — le texte de chaque lecture, à un seul endroit. */
const L13_COPY: Record<
  L13ReadKey,
  {
    read: (talent: TalentRoutinesService, workspaceId: string) => Promise<RoutineRead<L13Row>>
    subject: string
    none: string
    unit: (n: number) => string
    body: (row: L13Row) => string
    link: (row: L13Row) => string
  }
> = {
  interview_upcoming: {
    read: (talent, ws) => talent.interviewsUpcoming(ws),
    subject: 'Les entretiens',
    none: 'Aucun entretien dans les 48 heures.',
    unit: n => plural(n, 'entretien à préparer', 'entretiens à préparer'),
    body: row => `Le prochain : ${named(row)}.`,
    link: row => (row.submission_id ? `/submissions/${row.submission_id}` : '/consultants/recrutement'),
  },
  interview_feedback_missing: {
    read: (talent, ws) => talent.interviewsWithoutFeedback(ws),
    subject: 'Les retours d’entretien',
    none: 'Aucun entretien passé sans retour.',
    unit: n => plural(n, 'retour d’entretien à recueillir', 'retours d’entretien à recueillir'),
    body: row => `Le plus ancien : ${named(row)}${inDays(row)}.`,
    link: row => (row.submission_id ? `/submissions/${row.submission_id}` : '/consultants/recrutement'),
  },
  team_mission_risks: {
    read: (talent, ws) => talent.missionsWithDeclaredRisks(ws),
    subject: 'Les risques de mission',
    none: 'Aucun risque déclaré sur les missions en cours.',
    unit: n => plural(n, 'mission avec un risque déclaré', 'missions avec un risque déclaré'),
    body: row => `À regarder d’abord : ${row.label ?? named(row)}${row.full_name ? ` (${row.full_name})` : ''}.`,
    link: row => `/missions/${row.id}`,
  },
  blocked_needs: {
    read: (talent, ws) => talent.blockedNeeds(ws),
    subject: 'Les besoins ouverts',
    none: 'Aucun besoin ouvert sans mouvement.',
    unit: n => plural(n, 'besoin bloqué', 'besoins bloqués'),
    body: row => `Le plus ancien : ${named(row)}${inDays(row)}.`,
    link: row => `/projects/needs/${row.id}`,
  },
  mission_documents_pending: {
    read: (talent, ws) => talent.pendingMissionDocuments(ws),
    subject: 'Les pièces de mission',
    none: 'Aucune pièce de mission en attente.',
    unit: n => plural(n, 'pièce de mission en attente', 'pièces de mission en attente'),
    body: row => `La plus ancienne : ${row.name ?? 'pièce'}${row.label ? ` — ${row.label}` : ''}${inDays(row)}.`,
    link: row => (row.mission_id ? `/missions/${row.mission_id}` : '/missions/adv'),
  },
  mission_start_deadlines: {
    read: (talent, ws) => talent.missionStartsWithoutSignedContract(ws),
    subject: 'Les démarrages de mission',
    none: 'Aucun démarrage proche sans contrat signé.',
    unit: n => plural(n, 'démarrage sans contrat signé', 'démarrages sans contrat signé'),
    body: row => `Le plus proche : ${named(row)}${inDays(row)}.`,
    link: row => `/missions/${row.id}`,
  },
  mission_renewal_to_engage: {
    read: (talent, ws) => talent.renewalsToEngage(ws),
    subject: 'Les renouvellements',
    none: 'Aucun renouvellement à engager.',
    unit: n => plural(n, 'renouvellement à engager', 'renouvellements à engager'),
    body: row => `La plus proche : ${named(row)}${inDays(row)}.`,
    link: row => `/missions/${row.id}`,
  },
  consultant_repositioning: {
    read: (talent, ws) => talent.consultantsToReposition(ws),
    subject: 'Les fins d’affectation',
    none: 'Aucun consultant à repositionner.',
    unit: n => plural(n, 'consultant à repositionner', 'consultants à repositionner'),
    body: row => `Le plus proche : ${named(row)}${inDays(row)}, sans suite planifiée.`,
    link: row => `/consultants/${row.id}`,
  },
}
