import { Injectable, Logger, Optional } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  AWAITING_TIMESHEET_STATUSES,
  buildTriggerEvent,
  columnForProject,
  combineTriggerEvents,
  INTERVENTION_THRESHOLDS,
  MISSION_BOARD_STALE_DAYS,
  NEED_OPEN_STATUSES,
  projectStageInSql,
  taskStillOpenSql,
  triggerPeriodQualifier,
  UNDECIDED_STAGES,
  type StaffingCollisionCandidate,
  type TriggerEvent,
} from '@bellum/contracts'
import { InterventionEntity } from '../../database/entities/intervention.entity'
import { Correlated } from '../../correlation-id/background-correlation'
import { SingletonLockService, withSingletonLock } from '../locks/singleton-lock.service'
import { TriggerRegistryService } from '../trigger-registry/trigger-registry.service'
import {
  detectAccountsWithoutNextAction,
  detectBlockedInvoicing,
  detectCreditsExhausted,
  detectInactiveReps,
  detectMissingTimesheets,
  detectMissionsWithoutEndDate,
  detectNeedsWithoutShortlist,
  detectOverduePayments,
  detectProjectsWithoutDecision,
  detectRenewalsAtRisk,
  detectStaffingCollisionInterventions,
  detectStalledSubmissions,
  detectUntouchedAccounts,
  type AccountWithoutNextActionRow,
  type CreditsRow,
  type InterventionDraft,
  type InvoicingRow,
  type MissingTimesheetRow,
  type MissionWithoutEndDateRow,
  type NeedWithoutShortlistRow,
  type OverduePaymentRow,
  type RenewalRow,
  type RepRow,
  type StalledSubmissionRow,
  type UndecidedProjectRow,
  type UntouchedAccountRow,
} from './intervention-rules'
import { PlaybooksService } from './playbooks.service'
import { killSwitchCut } from '../../common/kill-switches'
import { unsettledInvoiceSql } from '../../common/invoice-settlement'

/**
 * La plus PETITE durée type parmi les étapes de projet qui en ont une.
 *
 * Sert de borne GROSSIÈRE au SQL de `project_no_decision` : la règle applique
 * ensuite la durée type de CHAQUE étape. Elle est DÉRIVÉE de la même table que
 * la règle et jamais écrite à la main — un nombre recopié ici deviendrait faux
 * en silence le jour où quelqu'un règle une colonne du board, et la nature la
 * plus courte cesserait de remonter sans qu'aucun test ne le voie.
 */
const SHORTEST_PROJECT_STALE_DAYS = Math.min(
  ...UNDECIDED_STAGES.map(stage => columnForProject(stage))
    .map(column => (column === null ? null : MISSION_BOARD_STALE_DAYS[column]))
    .filter((days): days is number => typeof days === 'number'),
)

/**
 * Ce qui REMPLIT la file d'intervention du responsable.
 *
 * La file existait au complet — table, contrat, service, écran, traductions —
 * sauf la partie qui la rend vivante : `PlaybooksService.open()` n'était appelé
 * de nulle part. Le cockpit affichait donc une file vide en production, ce qui
 * se lit « tout va bien » alors que ça voulait dire « personne ne regarde ».
 * C'est le même défaut que le dépôt a déjà rencontré ailleurs (un écran livré,
 * un seed qui ne le remplit pas) et qu'aucune suite de tests verte ne voit.
 *
 * Un seul balayage quotidien, onze requêtes GLOBALES groupées par espace plutôt
 * qu'un tour par espace : le coût ne dépend pas du nombre de clients.
 *
 * Robustesse, dans l'ordre où elle protège :
 *  - `@Cron` part sur chaque replica → corps sous verrou singleton ;
 *  - le verrou échoue OUVERT, et la deuxième couche d'idempotence est l'index
 *    unique `(espace, nature, sujet)` de la table : un même problème ne
 *    réapparaît pas à chaque balayage, même si deux replicas passent ;
 *  - chaque nature est isolée — une requête en échec n'emporte pas les dix
 *    autres, sinon un seul index manquant viderait toute la file.
 *
 * Interrupteur d'urgence : `INTERVENTIONS_SWEEP_DISABLED=true`.
 */
@Injectable()
export class InterventionsSweeper {
  private readonly logger = new Logger(InterventionsSweeper.name)

  constructor(
    @InjectRepository(InterventionEntity)
    private readonly interventions: Repository<InterventionEntity>,
    private readonly playbooks: PlaybooksService,
    @Optional() private readonly locks?: SingletonLockService,
    // #2875/#2402.1 (vague F/G 27/09) — le registre canonique persistait déjà
    // les événements de `GovernanceService`, mais jamais ceux-ci : la
    // construction (`toTriggerEvent`) existait pour la corrélation #2402.14,
    // l'appel à `record` manquait. `@Optional()` : sans lui, le balayage
    // ouvre les interventions à l'identique, il ne persiste rien de plus.
    @Optional() private readonly triggers?: TriggerRegistryService,
  ) {}

  /** 06:10 Europe/Paris — après la veille de 05:20, avant que les équipes
   *  n'ouvrent leur cockpit. */
  @Cron('10 6 * * *', { name: 'interventions-sweep', timeZone: 'Europe/Paris' })
  @Correlated('cron:interventions.sweep')
  async runDailySweep(): Promise<void> {
    await withSingletonLock(this.locks, 'interventions-sweep', async () => {
      await this.sweep()
    })
  }

  /**
   * Balaye et ouvre ce qui doit l'être. Public pour être testable et pour
   * pouvoir servir un « relancer maintenant » côté back-office.
   *
   * Rend le nombre d'interventions RÉELLEMENT ouvertes — pas le nombre de
   * problèmes détectés. L'écart entre les deux est le nombre de problèmes déjà
   * connus, et c'est une information : un balayage qui détecte 40 anomalies et
   * n'en ouvre aucune veut dire que rien de neuf n'est arrivé, pas qu'il est en
   * panne.
   */
  async sweep(now: Date = new Date()): Promise<number> {
    if (killSwitchCut('playbooks.interventions_sweep')) {
      this.logger.log('Balayage des interventions désactivé (INTERVENTIONS_SWEEP_DISABLED=true)')
      return 0
    }

    let opened = 0
    // #2402.1/.2/.9 — chaque draft détecté construit AUSSI un TriggerEvent
    // canonique (packages/contracts), accumulé ici pour la corrélation de fin
    // de balayage (#2402.14). C'est l'appelant réel du catalogue : le premier
    // des cinq pipelines nommés par le registre du 23/09 à être migré.
    const events: TriggerEvent[] = []
    for (const [kind, collect] of this.collectors(now)) {
      try {
        const found = await collect()
        for (const { workspaceId, draft } of found) {
          // La construction canonique est protégée SÉPARÉMENT : un bug dans
          // cette tranche neuve ne doit jamais empêcher l'ouverture réelle de
          // l'intervention, qui reste le comportement qui prime.
          try {
            const event = this.toTriggerEvent(workspaceId, draft, now)
            events.push(event)
            // #2875/#2402.1 — persiste au registre canonique, en plus de
            // l'ouverture réelle ci-dessous : best-effort, jamais sur le
            // chemin critique (même patron que `GovernanceService`).
            void this.triggers?.recordOnceByDedupeKey(event, 'playbooks/interventions.sweeper')
          } catch (error) {
            this.logger.error(`Événement canonique « ${kind} » en échec`, { error })
          }
          if (await this.playbooks.open({ workspaceId, ...draft })) opened += 1
        }
      } catch (error) {
        // Une nature isolée : un index manquant sur les positionnements ne doit
        // pas vider la file des renouvellements.
        this.logger.error(`Balayage « ${kind} » en échec`, { error })
      }
    }
    this.logCombinedSignals(events)
    this.logger.log(`Balayage des interventions terminé — ${opened} nouvelle(s) intervention(s)`)
    return opened
  }

  /** Le seul point de construction attendu (#2402.2) — un appelant qui
   *  composerait l'objet à la main contournerait la garde d'architecture
   *  GA-389. `source: 'playbooks'` : `intervention-rules.ts` est le pipeline
   *  qui détecte. */
  private toTriggerEvent(workspaceId: string, draft: InterventionDraft, now: Date): TriggerEvent {
    return buildTriggerEvent({
      type: draft.kind,
      source: 'playbooks',
      subjectType: draft.subjectType,
      subjectId: draft.subjectId,
      workspaceId,
      ownerId: draft.ownerId,
      evidence: draft.detail,
      now,
      // #2875 — un problème encore ouvert revient à chaque balayage quotidien :
      // une ligne par semaine ISO, pas une par jour.
      dedupeQualifier: triggerPeriodQualifier(now, 'week'),
    })
  }

  /**
   * #2402.14 — plusieurs signaux sur le MÊME sujet, dans le MÊME balayage,
   * forment un cas plus fort. Journalisé seulement : « un événement n'est pas
   * encore une notification » (règle de l'issue #2402) — aucune ligne
   * d'intervention ni notification supplémentaire n'en sort ici, c'est un
   * arbitrage humain qui manque encore, pas cette tranche.
   */
  private logCombinedSignals(events: readonly TriggerEvent[]): void {
    const groups = new Map<string, TriggerEvent[]>()
    for (const event of events) {
      const key = `${event.scope.workspaceId}:${event.object.subjectType}:${event.object.subjectId}`
      const group = groups.get(key)
      if (group) group.push(event)
      else groups.set(key, [event])
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const combined = combineTriggerEvents(group)
      this.logger.log(
        `Signaux combinés sur ${combined.subjectType}/${combined.subjectId} : ${combined.triggerTypes.join(' + ')}`,
      )
    }
  }

  private collectors(now: Date): [string, () => Promise<{ workspaceId: string; draft: InterventionDraft }[]>][] {
    return [
      ['submission_stalled', () => this.stalledSubmissions(now)],
      ['renewal_at_risk', () => this.renewalsAtRisk(now)],
      ['invoicing_blocked', () => this.blockedInvoicing(now)],
      ['account_untouched', () => this.untouchedAccounts(now)],
      ['rep_inactive', () => this.inactiveReps(now)],
      ['credits_exhausted', () => this.creditsExhausted()],
      // Les cinq natures du cockpit du COMMERCIAL. Elles étaient déjà détectées
      // et mesurées ailleurs pour quatre d'entre elles — sans jamais écrire une
      // ligne d'intervention.
      ['account_no_next_action', () => this.accountsWithoutNextAction(now)],
      ['project_no_decision', () => this.projectsWithoutDecision(now)],
      ['need_without_shortlist', () => this.needsWithoutShortlist(now)],
      ['timesheet_missing', () => this.missingTimesheets()],
      ['payment_overdue', () => this.overduePayments(now)],
      // `MIS-12` du PDF 5 §12. Le produit COMPTAIT déjà les missions sans date
      // de fin — c'est le rappel qui manquait, et c'est lui que la source
      // demande « unique ».
      ['mission_without_end_date', () => this.missionsWithoutEndDate(now)],
      // #2206.12 — la sixième nature du cockpit du RESPONSABLE : « collision
      // équipe ». Réutilise un calcul déjà pur et testé (`staffing-collision.ts`)
      // qui n'ouvrait encore aucune ligne d'intervention.
      ['staffing_collision', () => this.staffingCollisions()],
    ]
  }

  /** Le SQL rend déjà le sous-ensemble grossier ; la RÈGLE tranche. Le partage
   *  est délibéré : la base filtre le volume, le code pur porte la décision —
   *  et c'est la décision qu'on veut pouvoir relire et tester.
   *
   *  Les ONZE requêtes excluent les espaces de démonstration. Une salle traversée
   *  par des inconnus doit montrer une file vide parce qu'il n'y a rien à
   *  signaler, pas une alerte fabriquée par le passage du balayeur de la nuit —
   *  et le dossier d'exemple, lui, n'a par construction aucun cas à signaler. */
  private query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return this.interventions.manager.query<T[]>(sql, params)
  }

  private async stalledSubmissions(now: Date) {
    const rows = await this.query<StalledSubmissionRow & { workspace_id: string }>(
      `SELECT s.id, s.workspace_id, s.submitted_at, s.first_feedback_at, s.closed_at, s.owner_id,
              c.full_name AS consultant_name, a.company_name AS account_name
         FROM submissions s
         JOIN workspaces w ON w.id = s.workspace_id AND w.is_demo = false
         LEFT JOIN consultants c ON c.id = s.consultant_id
         -- La table du Projet s'appelle "opportunities" : T1 a unifié la
         -- SÉMANTIQUE (types, routes, écran « Projets ») sans renommer la table,
         -- parce que le mot voyage aussi comme clé de charge utile depuis le
         -- service IA. Écrire "projects" ici passait la revue et cassait à
         -- l'exécution — erreur avalée par le try/catch par nature, si bien que
         -- ce collecteur n'a jamais rien remonté en production.
         LEFT JOIN opportunities p ON p.id = s.project_id
         LEFT JOIN accounts a ON a.id = p.account_id
        WHERE s.first_feedback_at IS NULL
          AND s.closed_at IS NULL
          AND s.submitted_at IS NOT NULL
          AND s.submitted_at < now() - ($1 || ' days')::interval
          -- #2335.7 — la fenêtre haute : passé le délai maximal, ce n'est plus
          -- un rappel, une décision humaine manque. Même borne que la fonction
          -- pure detectStalledSubmissions, en double ici pour ne pas ramener
          -- deux mois d'historique à chaque balayage.
          AND s.submitted_at > now() - ($2 || ' days')::interval
        LIMIT 500`,
      [INTERVENTION_THRESHOLDS.submissionSilenceDays, INTERVENTION_THRESHOLDS.submissionSilenceMaxDays],
    )
    return detectStalledSubmissions(rows, now).map(draft => ({
      workspaceId: rows.find(row => row.id === draft.subjectId)!.workspace_id,
      draft,
    }))
  }

  private async renewalsAtRisk(now: Date) {
    // « Un renouvellement est ouvert » = une AUTRE mission sur le même compte
    // démarre après la fin de celle-ci. Volontairement littéral : c'est ce que
    // les données savent dire avec certitude. Un projet au pipe pourrait aussi
    // valoir renouvellement, mais rien ne le relie formellement à la mission —
    // le deviner produirait des silences là où il faut alerter.
    const rows = await this.query<RenewalRow & { workspace_id: string }>(
      `SELECT m.id, m.workspace_id, m.label, m.ends_on, m.user_id,
              EXISTS (
                SELECT 1 FROM missions n
                 WHERE n.account_id = m.account_id
                   AND n.id <> m.id
                   AND n.started_on IS NOT NULL
                   AND m.ends_on IS NOT NULL
                   AND n.started_on >= m.ends_on
              ) AS has_open_renewal
         FROM missions m
         JOIN workspaces w ON w.id = m.workspace_id AND w.is_demo = false
        WHERE m.status IN ('active', 'onboarding', 'paused')
          AND m.ends_on IS NOT NULL
          AND m.ends_on <= (now() + ($1 || ' days')::interval)::date
        LIMIT 500`,
      [INTERVENTION_THRESHOLDS.renewalHorizonDays],
    )
    return detectRenewalsAtRisk(rows, now).map(draft => ({
      workspaceId: rows.find(row => row.id === draft.subjectId)!.workspace_id,
      draft,
    }))
  }

  private async blockedInvoicing(now: Date) {
    const rows = await this.query<InvoicingRow & { workspace_id: string }>(
      `SELECT r.id, r.workspace_id, r.period_month, r.state, r.invoiced_at, r.blockers,
              m.label AS mission_label, m.user_id AS owner_id
         FROM invoice_readiness r
         JOIN workspaces w ON w.id = r.workspace_id AND w.is_demo = false
         LEFT JOIN missions m ON m.id = r.mission_id
        WHERE r.state = 'blocked'
          AND r.invoiced_at IS NULL
          AND r.period_month < (now() - ($1 || ' days')::interval)::date
        LIMIT 500`,
      [INTERVENTION_THRESHOLDS.invoicingBlockedDays],
    )
    return detectBlockedInvoicing(rows, now).map(draft => ({
      workspaceId: rows.find(row => row.id === draft.subjectId)!.workspace_id,
      draft,
    }))
  }

  private async untouchedAccounts(now: Date) {
    const rows = await this.query<UntouchedAccountRow & { workspace_id: string }>(
      `SELECT a.id, a.workspace_id, a.company_name AS name, a.user_id AS owner_id,
              (SELECT max(ua.created_at) FROM user_actions ua WHERE ua.account_id = a.id) AS last_action_at
         FROM accounts a
         JOIN workspaces w ON w.id = a.workspace_id AND w.is_demo = false
        WHERE a.commercial_status IN ('watching', 'opportunity', 'customer')
        LIMIT 2000`,
    )
    return detectUntouchedAccounts(rows, now).map(draft => ({
      workspaceId: rows.find(row => row.id === draft.subjectId)!.workspace_id,
      draft,
    }))
  }

  private async inactiveReps(now: Date) {
    // On ne surveille QUE les rôles qui prospectent. Un `viewer` ou un
    // `tech_admin` sans action n'est pas un commercial inactif — c'est un
    // compte qui fait exactement ce pour quoi il existe.
    const rows = await this.query<RepRow & { workspace_id: string }>(
      `SELECT wm.user_id, wm.workspace_id, wm.created_at AS joined_at,
              COALESCE(NULLIF(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email, 'Un membre') AS name,
              (SELECT max(ua.created_at) FROM user_actions ua WHERE ua.user_id = wm.user_id) AS last_action_at
         FROM workspace_members wm
         LEFT JOIN profiles p ON p.user_id = wm.user_id
         LEFT JOIN workspaces w ON w.id = wm.workspace_id
        WHERE wm.role IN ('owner', 'admin', 'sales_ops', 'sales', 'member')
          AND COALESCE(w.is_demo, false) = false
        LIMIT 2000`,
    )
    return detectInactiveReps(rows, now).map(draft => ({
      workspaceId: rows.find(row => row.user_id === draft.subjectId)!.workspace_id,
      draft,
    }))
  }

  private async creditsExhausted() {
    // L'enveloppe d'un espace vit sur la ligne de crédits de son PROPRIÉTAIRE
    // (c'est lui qui porte le plan et les sièges). Les espaces de démonstration
    // sont exclus : ils ne débitent rien, une alerte de blocage y serait fausse.
    const rows = await this.query<CreditsRow & { workspace_id: string }>(
      `SELECT w.id AS workspace_id, w.owner_user_id AS "ownerId",
              COALESCE(uc.accounts_used, 0)::int AS used,
              (COALESCE(uc.accounts_limit, 0)
                 + COALESCE(uc.topup_analyses, 0)
                 + CASE WHEN uc.rollover_expires_at > now() THEN COALESCE(uc.rollover_credits, 0) ELSE 0 END)::int AS limit
         FROM workspaces w
         JOIN subscriptions uc ON uc.user_id = w.owner_user_id
        WHERE w.is_demo = false
        LIMIT 2000`,
    )
    return detectCreditsExhausted(rows).map(draft => ({
      workspaceId: rows.find(row => row.workspace_id === draft.subjectId)!.workspace_id,
      draft,
    }))
  }

  /* ───────────── Les cinq natures du cockpit du commercial ───────────── */

  /**
   * Un compte suivi sans la moindre tâche ouverte.
   *
   * Le prédicat est celui de la sonde de Laura (`accountsWithoutNextAction`),
   * repris par sa SOURCE et non par recopie : `taskStillOpenSql` engendre la
   * liste des statuts ouverts depuis l'énumération. Un statut ajouté demain
   * entre dans les deux lectures sans qu'on en touche une.
   *
   * La population est celle d'`account_untouched` — les comptes SUIVIS. Alerter
   * sur les autres reviendrait à ouvrir une intervention pour chaque société
   * jamais reprise après une analyse, et une file de huit cents lignes n'est
   * pas une file.
   */
  private async accountsWithoutNextAction(now: Date) {
    const rows = await this.query<AccountWithoutNextActionRow & { workspace_id: string }>(
      `SELECT a.id, a.workspace_id, a.company_name AS name, a.user_id AS owner_id, a.created_at
         FROM accounts a
         JOIN workspaces w ON w.id = a.workspace_id AND w.is_demo = false
        WHERE a.commercial_status IN ('watching', 'opportunity', 'customer')
          AND a.created_at < now() - ($1 || ' days')::interval
          AND NOT EXISTS (
            SELECT 1 FROM tasks t WHERE t.account_id = a.id AND ${taskStillOpenSql('t')}
          )
        LIMIT 2000`,
      [INTERVENTION_THRESHOLDS.accountNoNextActionDays],
    )
    return detectAccountsWithoutNextAction(rows, now).map(draft => ({
      workspaceId: rows.find(row => row.id === draft.subjectId)!.workspace_id,
      draft,
    }))
  }

  /**
   * Un projet dont l'issue n'est pas tranchée et qui n'a pas bougé d'étape.
   *
   * La borne SQL est la plus PETITE durée type parmi les étapes concernées ; la
   * règle applique ensuite celle de CHAQUE étape. Écrire la plus grande ici
   * ferait rater les étapes courtes, écrire un nombre à la main en ferait une
   * seconde vérité — c'est pourquoi elle est DÉRIVÉE de la même table.
   *
   * Le rattachement de vérité est celui du COMPTE : `opportunities.workspace_id`
   * peut être transitoirement nulle, et c'est la portée que toutes les lectures
   * du pipe utilisent déjà.
   */
  private async projectsWithoutDecision(now: Date) {
    const rows = await this.query<UndecidedProjectRow & { workspace_id: string }>(
      `SELECT o.id, COALESCE(o.workspace_id, a.workspace_id) AS workspace_id,
              o.label, o.stage, o.stage_entered_at, o.owner_id
         FROM opportunities o
         JOIN accounts a ON a.id = o.account_id
         JOIN workspaces w ON w.id = a.workspace_id AND w.is_demo = false
        WHERE ${projectStageInSql('o.stage', UNDECIDED_STAGES)}
          AND a.status <> 'deleted'
          AND o.outcome IS NULL
          AND o.stage_entered_at IS NOT NULL
          AND o.stage_entered_at < now() - ($1 || ' days')::interval
        LIMIT 2000`,
      [SHORTEST_PROJECT_STALE_DAYS],
    )
    return detectProjectsWithoutDecision(rows, now).map(draft => ({
      workspaceId: rows.find(row => row.id === draft.subjectId)!.workspace_id,
      draft,
    }))
  }

  /**
   * Un besoin ouvert depuis trop longtemps sans le moindre profil positionné.
   *
   * Le prédicat est celui de la sonde de Laura (`needsOpenWithoutShortlist`),
   * y compris son `status_changed_at IS NOT NULL` — un besoin qui n'a jamais
   * franchi de transition n'a pas d'âge d'étape.
   *
   * ⚠️ **Une condition en plus, et elle ne fait que RETIRER des lignes** : un
   * besoin déclaré NON staffable (porte G3) ne remonte pas. La question a déjà
   * reçu sa réponse, et la reposer chaque matin apprendrait à ignorer la file.
   * C'est la même exclusion que la routine « besoins sans shortlist », écrite
   * ici contre la colonne telle qu'elle existe — `staffable` est un `text`
   * (`unknown` | `yes` | `no`), jamais un booléen.
   */
  private async needsWithoutShortlist(now: Date) {
    const rows = await this.query<NeedWithoutShortlistRow & { workspace_id: string }>(
      `SELECT n.id, n.workspace_id, n.title, n.status_changed_at, n.owner_id
         FROM project_needs n
         JOIN workspaces w ON w.id = n.workspace_id AND w.is_demo = false
        WHERE n.status = ANY($1)
          AND n.staffable <> 'no'
          AND n.status_changed_at IS NOT NULL
          AND n.status_changed_at < now() - ($2 || ' days')::interval
          AND NOT EXISTS (SELECT 1 FROM submissions sub WHERE sub.need_id = n.id)
        LIMIT 2000`,
      [[...NEED_OPEN_STATUSES], INTERVENTION_THRESHOLDS.needWithoutShortlistDays],
    )
    return detectNeedsWithoutShortlist(rows, now).map(draft => ({
      workspaceId: rows.find(row => row.id === draft.subjectId)!.workspace_id,
      draft,
    }))
  }

  /**
   * Un relevé de temps qui n'est toujours pas arrivé après les relances.
   *
   * `AWAITING_TIMESHEET_STATUSES` est la définition partagée de « rien n'est
   * encore arrivé » : un relevé validé, en litige ou rejeté-puis-redéposé n'est
   * pas manquant, et le compter ferait relancer quelqu'un qui a rendu.
   *
   * La table ne porte pas d'espace : c'est la MISSION qui le porte, et c'est
   * aussi elle qui porte le commercial responsable.
   */
  private async missingTimesheets() {
    const rows = await this.query<MissingTimesheetRow & { workspace_id: string }>(
      `SELECT ts.id, m.workspace_id, ts.period_month, ts.reminders_sent,
              m.label AS mission_label, m.user_id AS owner_id
         FROM mission_timesheets ts
         JOIN missions m ON m.id = ts.mission_id
         JOIN workspaces w ON w.id = m.workspace_id AND w.is_demo = false
        WHERE ts.status = ANY($1)
          AND ts.reminders_sent >= $2
        LIMIT 2000`,
      [[...AWAITING_TIMESHEET_STATUSES], INTERVENTION_THRESHOLDS.timesheetRemindersBeforeAlert],
    )
    return detectMissingTimesheets(rows).map(draft => ({
      workspaceId: rows.find(row => row.id === draft.subjectId)!.workspace_id,
      draft,
    }))
  }

  /**
   * Une facture émise dont l'échéance est passée sans encaissement.
   *
   * Le prédicat est celui de la sonde de Laura (`invoicesOverdueBeyondGrace`),
   * litige compris. Le SQL borne le volume ; c'est la règle qui retranche les
   * lignes payées entre-temps et les litiges non levés.
   */
  private async overduePayments(now: Date) {
    const rows = await this.query<OverduePaymentRow & { workspace_id: string }>(
      // #2419.4 — un paiement partiel ne sort pas de la file : le SQL bornait
      // la population sur `paid_at IS NULL`, donc une facture réglée à moitié
      // n'atteignait même pas la règle. Deux endroits pour un seul effet, et
      // celui-ci est le plus traître — il décide avant que la règle pure n'ait
      // son mot à dire. Les deux montants remontent aussi, puisque la règle en
      // a désormais besoin.
      `SELECT r.id, r.workspace_id, r.period_month, r.due_on, r.paid_at,
              r.paid_amount_cents, r.invoiced_amount_cents,
              r.disputed_at, r.dispute_resolved_at,
              m.label AS mission_label, m.user_id AS owner_id
         FROM invoice_readiness r
         JOIN workspaces w ON w.id = r.workspace_id AND w.is_demo = false
         LEFT JOIN missions m ON m.id = r.mission_id
        WHERE r.invoiced_at IS NOT NULL
          AND ${unsettledInvoiceSql('r')}
          AND r.due_on IS NOT NULL
          AND r.due_on < (current_date - ($1 || ' days')::interval)::date
        LIMIT 2000`,
      [INTERVENTION_THRESHOLDS.paymentOverdueDays],
    )
    return detectOverduePayments(rows, now).map(draft => ({
      workspaceId: rows.find(row => row.id === draft.subjectId)!.workspace_id,
      draft,
    }))
  }

  /**
   * Une mission en cours qui n'a toujours pas de date de fin (`MIS-12`).
   *
   * La borne SQL est GROSSIÈRE — « démarrée avant aujourd'hui moins le seuil » —
   * et c'est la règle qui tranche, comme partout ici : la base filtre le volume,
   * le code pur porte la décision, et c'est la décision qu'on veut pouvoir
   * relire.
   *
   * ⚠️ `m.user_id` et non `m.owner_id`, comme les onze autres collecteurs de ce
   * fichier. La colonne `missions.owner_id` existe et se dit « le porteur, celui
   * qu'on alerte » — mais RIEN ne l'écrit aujourd'hui côté Delivery. Poser ici
   * la seule lecture divergente des douze donnerait une file adressée à
   * personne sur onze natures et à quelqu'un sur la douzième. Le sujet se
   * tranche pour les douze à la fois, pas dans ce collecteur.
   *
   * ⚠️ `contract_kind` sort TEL QUEL, sans filtre SQL : la colonne est un `text`
   * sans contrainte, et c'est la règle qui refuse ce qui n'appartient pas à
   * l'énumération. Écrire `contract_kind = 'regie'` ici mettrait la même
   * décision à deux endroits — et le jour où une valeur s'ajoute, l'un des deux
   * l'ignorerait.
   */
  private async missionsWithoutEndDate(now: Date) {
    const rows = await this.query<MissionWithoutEndDateRow & { workspace_id: string }>(
      `SELECT m.id, m.workspace_id, m.label, m.ends_on, m.started_on, m.contract_kind, m.user_id
         FROM missions m
         JOIN workspaces w ON w.id = m.workspace_id AND w.is_demo = false
        WHERE m.ends_on IS NULL
          AND m.status IN ('active', 'onboarding', 'paused')
          AND m.started_on IS NOT NULL
          AND m.started_on <= (now() - ($1 || ' days')::interval)::date
        LIMIT 2000`,
      [INTERVENTION_THRESHOLDS.missionWithoutEndDateDays],
    )
    return detectMissionsWithoutEndDate(rows, now).map(draft => ({
      workspaceId: rows.find(row => row.id === draft.subjectId)!.workspace_id,
      draft,
    }))
  }

  /**
   * #2206.12 — « collision équipe ». Une seule requête GLOBALE, groupée par
   * espace AVANT d'appeler la fonction pure : `detectStaffingCollisions`
   * n'a aucune notion d'espace, et une collision entre consultants de DEUX
   * espaces différents n'existe pas — le pool de consultants d'un espace
   * n'a rien à voir avec celui d'un autre (concurrents, `GA-43`).
   */
  private async staffingCollisions() {
    const rows = await this.query<StaffingCollisionCandidate & { workspace_id: string }>(
      `SELECT s.id, s.workspace_id, s.need_id AS "needId", s.consultant_id AS "consultantId",
              c.full_name AS "consultantName", s.stage
         FROM submissions s
         JOIN workspaces w ON w.id = s.workspace_id AND w.is_demo = false
         LEFT JOIN consultants c ON c.id = s.consultant_id
        WHERE s.stage NOT IN ('accepted', 'rejected', 'withdrawn')
          AND s.need_id IS NOT NULL
        LIMIT 5000`,
    )
    const byWorkspace = new Map<string, (StaffingCollisionCandidate & { workspace_id: string })[]>()
    for (const row of rows) {
      const bucket = byWorkspace.get(row.workspace_id)
      if (bucket) bucket.push(row)
      else byWorkspace.set(row.workspace_id, [row])
    }
    const results: { workspaceId: string; draft: InterventionDraft }[] = []
    for (const [workspaceId, workspaceRows] of byWorkspace) {
      for (const draft of detectStaffingCollisionInterventions(workspaceRows)) {
        results.push({ workspaceId, draft })
      }
    }
    return results
  }
}
