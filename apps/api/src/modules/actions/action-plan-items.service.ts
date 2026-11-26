import {
  actionTargetKindSchema,
  dueDateForPhase,
  evidenceFieldSourceSchema,
  isCalendarDate,
  MANUAL_ACTION_WEEK_INDEX,
  METHOD_CORPUS_V1,
  parseLearnedRuleRef,
  planActionChannelSchema,
  METHOD_RULE_PLAN_STEP,
} from '@bellum/contracts'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import {
  findContactByName,
  findContactNamedIn,
  readPlanSignal,
  relanceHistoryOf,
  STALE_ACTION_DAYS,
  type CloseStalePlanItemsResult,
} from '@bellum/contracts'
import { ACCOUNT_FACTS_READER, type AccountFactsReader } from '../account-facts/module-tokens'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import type {
  AccountPlanMutationResponse,
  ActionExecutionStatus,
  ActionPlanOutcome,
  ActionPlanItem,
  ActionProvenance,
  ActionTarget,
  ActionType,
  CreatePlanAction,
  CreatedPlanAction,
  MyPlanAction,
  AwaitingOutcomeAction,
  PersonalRelance,
  RelanceHistory,
  PlanActionChannel,
  PrepareContactPlan,
  UpdateActionPlanItem,
  UserPlanAction,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { workspaceGestureWhere } from '../workspace/workspace-scoping'
import { ActionPlanEntity } from '../../database/entities/action-plan.entity'
import { ActionPlanItemEntity } from '../../database/entities/action-plan-item.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { TaskEntity } from '../../database/entities/task.entity'
import { WorkspaceMethodRuleEntity } from '../../database/entities/workspace-method-rule.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { TeamNotificationsService } from '../notifications/team/team-notifier.service'
// #2715.1 — LE classifieur partagé (cockpit, dashboard manager) : la nature
// vérifiée/déclarée d'un envoi ne se décide jamais deux fois.
import { classifyMessageSend } from './message-send-provenance'
import { SprintProgressionBus } from '../sprints/sprint-progression.bus'
import { actionOutcomeEffect, contactStatusMayMove, outcomeTimelineLabel } from './action-outcome-effect'
import { nameKey, unambiguousContact } from './plan-contact-match'

/**
 * The user-owned action-plan checklist.
 *
 * `action_plans` holds the *generated* plan (immutable phases/actions).
 * `action_plan_items` is the trackable overlay: `done` / `due_date` and the
 * executable lifecycle (`execution_status` / `snoozed_until` / `assigned_to`)
 * per action. Items are seeded lazily from the latest `action_plans` row the
 * first time an account's list is read (no separate "materialize" call needed),
 * keyed by the action's 0-based (phase, step) position — the same position the
 * web board renders from `raw_analysis`, so persisted state lines up 1:1 with
 * the UI.
 *
 * Executable actions (Théo P1/P2 — "les actions doivent être exécutables :
 * fait, snooze, assigner") flow through {@link update}. Assigning validates the
 * assignee is a member of the caller's active workspace; every lifecycle change
 * is recorded in the `user_actions` team feed (best-effort).
 */
/** #4416 — les libellés des étapes ciblées sur un contact, dans la langue de l'appelant. */
const CONTACT_PLAN_COPY = {
  fr: {
    label: {
      email: (who: string) => `Envoyer un e-mail à ${who}`,
      linkedin: (who: string) => `Écrire à ${who} sur LinkedIn`,
      phone: (who: string) => `Appeler ${who}`,
    },
    reason: (who: string) => `Prendre contact avec ${who} par un canal que son profil porte.`,
    // #2395.8 — le résultat attendu s'écrit aussi pour la création automatique (jamais un verbe seul).
    expectedOutcome: (who: string) => `Une réponse de ${who}, ou un prochain échange fixé.`,
  },
  en: {
    label: {
      email: (who: string) => `Email ${who}`,
      linkedin: (who: string) => `Message ${who} on LinkedIn`,
      phone: (who: string) => `Call ${who}`,
    },
    reason: (who: string) => `Reach out to ${who} through a channel their profile carries.`,
    expectedOutcome: (who: string) => `A reply from ${who}, or a next conversation scheduled.`,
  },
} as const

@Injectable()
export class ActionPlanItemsService {
  private readonly logger = new Logger(ActionPlanItemsService.name)

  constructor(
    @InjectRepository(ActionPlanItemEntity)
    private readonly items: Repository<ActionPlanItemEntity>,
    @InjectRepository(ActionPlanEntity)
    private readonly plans: Repository<ActionPlanEntity>,
    @InjectRepository(UserActionEntity)
    private readonly actions: Repository<UserActionEntity>,
    // #2123.46 — LECTURE SEULE : la porte d'écriture du plan vérifie que le
    // compte visé appartient bien à l'espace de la personne qui écrit. Sans
    // cette vérification, un identifiant de compte deviné dans la requête
    // produirait une ligne rattachée à un compte qui n'est pas le sien.
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    // #2123.46 — LECTURE SEULE : un contact visé n'est lié à l'action que s'il
    // appartient au compte (voir `contactOfAccount`).
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    // #3416.4 — le board du compte, le même bus que `ContactsService`. Optionnel :
    // sans lui (tests, module retiré) la propagation au board est un no-op.
    @Optional() private readonly sprintBus?: SprintProgressionBus,
    // #3416.2b — la relance datée d'une issue « à rappeler » est une TÂCHE ouverte.
    @Optional() @InjectRepository(TaskEntity) private readonly taskRows?: Repository<TaskEntity>,
    // #3295 — LECTURE SEULE : une action ne cite une règle APPRISE que si elle est
    // activée dans l'espace de celui qui écrit (voir `assertKnownMethodRule`).
    @Optional()
    @InjectRepository(WorkspaceMethodRuleEntity)
    private readonly learnedRules?: Repository<WorkspaceMethodRuleEntity>,
    // #4072.2 — le lecteur UNIQUE des faits du compte (#4069.1) : l'historique
    // d'échanges (métadonnées) et les faits récents d'une relance. En dernier,
    // optionnel : absent, la liste est byte-identique.
    @Optional() @Inject(ACCOUNT_FACTS_READER) private readonly accountFacts?: AccountFactsReader,
    // #4158.16 — la délégation prévient le délégataire. En dernier, optionnel.
    @Optional() private readonly teamNotifications?: TeamNotificationsService,
  ) {}

  /** #4072.2 — bornes : comptes distincts lus par appel, lectures simultanées. */
  private static readonly HISTORY_MAX_ACCOUNTS = 40
  private static readonly HISTORY_BATCH = 5

  /** #4521.1 — nom et fonction des contacts des comptes visés, en UNE requête. Illisible → aucun contact résolu. */
  private async contactsByAccount(accountIds: readonly string[]): Promise<Map<string, PlanMailContact[]>> {
    const byAccount = new Map<string, PlanMailContact[]>()
    const ids = [...new Set(accountIds)]
    if (ids.length === 0) return byAccount
    try {
      const rows = await this.contacts.find({
        where: { account_id: In(ids) },
        select: ['id', 'account_id', 'full_name', 'title'],
      })
      for (const row of rows) {
        if (!row.account_id) continue
        const list = byAccount.get(row.account_id) ?? []
        list.push({ id: row.id, full_name: row.full_name ?? null, title: row.title ?? null })
        byAccount.set(row.account_id, list)
      }
    } catch (err) {
      this.logger.warn('contactsByAccount failed', { error: err instanceof Error ? err.message : String(err) })
    }
    return byAccount
  }

  private async historyByAccount(
    workspaceId: string,
    userId: string,
    accountIds: readonly string[],
  ): Promise<Map<string, RelanceHistory>> {
    const out = new Map<string, RelanceHistory>()
    const reader = this.accountFacts
    if (!reader) return out
    const ids = [...new Set(accountIds)].slice(0, ActionPlanItemsService.HISTORY_MAX_ACCOUNTS)
    for (let i = 0; i < ids.length; i += ActionPlanItemsService.HISTORY_BATCH) {
      await Promise.all(
        ids.slice(i, i + ActionPlanItemsService.HISTORY_BATCH).map(async accountId => {
          try {
            const read = await reader.forAccount({ workspaceId, userId, accountId })
            const history = relanceHistoryOf(read?.facts ?? [])
            if (history) out.set(accountId, history)
          } catch (err) {
            this.logger.warn('historique de relance illisible', {
              error: err instanceof Error ? err.message : String(err),
            })
          }
        }),
      )
    }
    return out
  }

  /**
   * List a user's items for one account.
   *
   * #2395.1 (épopée #2871) — la LECTURE n'écrit plus RIEN. Le semis paresseux
   * (une ligne `action_plan_items` par étape du plan dès la première ouverture
   * de la fiche) est supprimé : une étape que personne n'a actée est rendue
   * VIRTUELLE (`id` par position, voir {@link virtualStepId}) et n'est
   * matérialisée qu'au premier geste, par {@link update} — écriture adressée
   * par POSITION (compte, semaine, étape).
   */
  async listForAccount(userId: string, accountId: string): Promise<ActionPlanItem[]> {
    // #4158.5 — la checklist se lit dans l'ESPACE du compte, pas par `user_id` seul :
    // un collègue voit le plan réel d'un compte partagé ; un compte d'un autre espace → 404.
    const workspaceId = await this.assertAccountInActiveWorkspace(userId, accountId)
    const persisted = await this.findOrdered(userId, accountId)
    const taken = new Set(persisted.map(row => `${row.week_index}-${row.step_index}`))
    const virtual = (await this.planStepDrafts(userId, accountId, workspaceId))
      .filter(draft => !taken.has(`${draft.week_index}-${draft.step_index}`))
      .map(draft => Object.assign(draft, { id: virtualStepId(accountId, draft.week_index, draft.step_index) }))
    const rows = [...persisted, ...virtual].sort((a, b) => a.week_index - b.week_index || a.step_index - b.step_index)
    const items = await this.withSendStatus(rows)
    return this.withCanEdit(items)
  }

  /**
   * Le dernier résultat déclaré (action FAITE portant une issue) de chacun des comptes demandés,
   * en DEUX requêtes quel que soit leur nombre (comptes de l'espace, puis lignes `IN`). Un compte
   * hors de l'espace actif est ignoré en silence — comme `listForAccount` il ne fuit rien, mais une
   * liste n'échoue pas pour un seul. Un compte sans issue n'a PAS de ligne (« on n'affiche pas ce
   * qu'on n'a pas »). Lecture seule : aucune étape virtuelle, aucune écriture.
   */
  async listLastOutcomes(userId: string, accountIds: readonly string[]): Promise<ActionPlanItem[]> {
    if (accountIds.length === 0) return []
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const inWorkspace = await this.accounts.find({ where: { id: In([...accountIds]), workspace_id: workspaceId } })
    if (inWorkspace.length === 0) return []
    const rows = await this.items.find({
      where: {
        account_id: In(inWorkspace.map(account => account.id)),
        cadence_step: IsNull(),
        execution_status: 'done',
      },
    })
    const latest = new Map<string, ActionPlanItemEntity>()
    for (const row of rows) {
      if (row.outcome === null || row.account_id === null) continue
      const kept = latest.get(row.account_id)
      if (!kept || (row.completed_at?.toISOString() ?? '') > (kept.completed_at?.toISOString() ?? '')) {
        latest.set(row.account_id, row)
      }
    }
    const picked = [...latest.values()]
    return this.withCanEdit(picked.map(row => toDto(row, null)))
  }

  /**
   * #2871 — les lignes DÉJÀ persistées d'un compte, SANS semis : la projection
   * canonique du plan (`GET /accounts/:id/actions`) est une lecture seule, elle
   * n'écrit jamais une ligne pour une étape que personne n'a actée. Même portée
   * que {@link listForAccount} (mêmes lignes, même ordre), moins l'écriture.
   */
  async listPersistedForAccount(userId: string, accountId: string): Promise<ActionPlanItem[]> {
    await this.assertAccountInActiveWorkspace(userId, accountId)
    const rows = await this.findOrdered(userId, accountId)
    return this.withCanEdit(rows.map(row => toDto(row, null)))
  }

  /**
   * #4804 — une ligne du plan d'un compte de l'espace est modifiable par TOUT coéquipier de cet
   * espace (le compte est déjà prouvé de l'espace par l'appelant) : le bouton n'est plus masqué
   * pour un geste que l'API accepte désormais. `can_edit` reste émis pour les clients existants.
   */
  private withCanEdit(items: ActionPlanItem[]): ActionPlanItem[] {
    return items.map(item => ({ ...item, can_edit: true }))
  }

  /** #4158.5 — le compte est dans l'espace ACTIF de l'appelant, sinon 404 (rien ne fuit). */
  private async assertAccountInActiveWorkspace(userId: string, accountId: string): Promise<string> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) throw new NotFoundException('Compte introuvable')
    return workspaceId
  }

  /**
   * #2715.1 (corrigé 23/09 — revue du coordinateur) — le statut d'envoi,
   * jamais deviné, DEUX valeurs jamais fondues (voir le commentaire de
   * `send_status` dans le contrat — une première version les fondait sous un
   * `success` unique, exactement ce que la doctrine interdit).
   *
   * Rattaché à L'ITEM quand la ligne d'engagement porte
   * `metadata.plan_action_id` pointant vers une des lignes de CE plan ; sinon
   * au CONTACT (repli), et il s'applique alors à TOUTES les actions de ce
   * contact — c'est le seul chemin qui joue aujourd'hui : aucun écrivain
   * (`EngagementPanel.tsx`, `recordEmailSent`) ne pose encore cette
   * métadonnée. Une requête batch évite le N+1 sur un plan à trente lignes.
   */
  private async withSendStatus(rows: ActionPlanItemEntity[]): Promise<ActionPlanItem[]> {
    const contactIds = [...new Set(rows.map(row => row.contact_id).filter((id): id is string => Boolean(id)))]
    if (contactIds.length === 0) return rows.map(row => toDto(row, null))

    const sends = await this.actions.find({
      where: { contact_id: In(contactIds), action_type: In(MESSAGE_SEND_STATUS_ACTION_TYPES) },
    })
    const itemIds = new Set(rows.map(row => row.id))
    const byItem = new Map<string, SendStatus>()
    const byContact = new Map<string, SendStatus>()
    for (const send of sends) {
      const status = classifySendStatus(send)
      const linkedItemId = metadataString(send.metadata, 'plan_action_id')
      // #2715.1 — un lien vers une action HORS de ce plan (id inconnu) ne
      // vaut pas mieux qu'aucun lien : il ne retombe PAS sur le contact, il
      // ne s'affiche simplement nulle part — un statut deviné sur la
      // mauvaise action serait pire qu'absent.
      if (linkedItemId && itemIds.has(linkedItemId)) upsertPreferVerified(byItem, linkedItemId, status)
      else if (!linkedItemId && send.contact_id) upsertPreferVerified(byContact, send.contact_id, status)
    }

    return rows.map(row => {
      const status = byItem.get(row.id) ?? (row.contact_id ? (byContact.get(row.contact_id) ?? null) : null)
      return toDto(row, status)
    })
  }

  /**
   * Append a MANUAL item to an account's checklist (MCP `create_action`).
   * Manual items live in a dedicated position band (`week_index` =
   * {@link MANUAL_WEEK_INDEX}) so they can never collide with a generated
   * plan's `(week_index, step_index)` positions — the web board overlays
   * persisted state by that position key. A due-dated manual item is picked up
   * by the relance cron and "Mes relances" for free (they scan `due_date` /
   * `done`, position-agnostic). An optional `contactId` links it to a contact
   * without making it a cadence row (`cadence_step` stays NULL → it remains on
   * the account checklist).
   *
   * #2395.1 — plus de semis préalable : la lecture ne matérialise rien, une
   * ligne manuelle ne peut donc plus masquer le plan généré.
   */
  async createManual(
    userId: string,
    accountId: string,
    input: {
      label: string
      dueDate?: string | null
      contactId?: string | null
      target?: ActionTarget | null
      /** #2123.46 — le responsable saisi au formulaire du plan, jamais une délégation. */
      ownerName?: string | null
      /** #2123.72 — la consigne d'une tâche de prise de contact. */
      reason?: string | null
      /** #2123.46 — le résultat attendu et l'indicateur (veille, panneau besoin). */
      expectedOutcome?: string | null
      kpi?: string | null
      /**
       * #2901 (#2395.4) — le canal CHOISI dans le composer, jamais deviné.
       * `null`/absent = non typé, exactement le comportement d'avant.
       */
      channel?: PlanActionChannel | null
      /** #3287 (#3265.2) — la recommandation source, la règle méthode, la condition d'arrêt de CETTE action. */
      sourceRecommendation?: string | null
      methodRule?: string | null
      stopCondition?: string | null
    },
  ): Promise<ActionPlanItem> {
    const raw = await this.items
      .createQueryBuilder('item')
      .select('MAX(item.step_index)', 'max')
      .where('item.user_id = :userId', { userId })
      .andWhere('item.account_id = :accountId', { accountId })
      .andWhere('item.week_index = :weekIndex', { weekIndex: MANUAL_WEEK_INDEX })
      .getRawOne<{ max: number | string | null }>()
    const lastStep = raw?.max === null || raw?.max === undefined ? -1 : Number(raw.max)

    const saved = await this.items.save(
      this.items.create({
        user_id: userId,
        account_id: accountId,
        source_plan_id: null,
        label: input.label,
        week_index: MANUAL_WEEK_INDEX,
        step_index: lastStep + 1,
        done: false,
        execution_status: 'todo',
        snoozed_until: null,
        assigned_to: null,
        // #2123.46 — le responsable SAISI, conservé tel quel. `assigned_to`
        // reste `null` : un prénom tapé à la main n'est pas un membre de
        // l'espace, et le prendre pour une délégation ferait apparaître
        // l'action dans « Mes relances » de quelqu'un qui ne l'a jamais reçue.
        owner_name: input.ownerName?.trim() || null,
        // #2123.72 — la consigne rédigée dans le composer, telle quelle.
        reason: input.reason?.trim() || null,
        // #2123.46 — ce que les quatre écrivains basculés portaient dans
        // `raw_analysis.user_plan_actions`, tel quel ; vide = `null`.
        expected_outcome: input.expectedOutcome?.trim() || null,
        kpi: input.kpi?.trim() || null,
        // #2901 (#2395.4) — le canal CHOISI, jamais deviné : `null` reste
        // `null`, comme `expected_outcome`/`kpi` juste au-dessus.
        channel: input.channel ?? null,
        // #3287 (#3265.2) — posés par l'écrivain qui les connaît, `null` sinon.
        source_recommendation: input.sourceRecommendation?.trim() || null,
        method_rule: input.methodRule?.trim() || null,
        stop_condition: input.stopCondition?.trim() || null,
        external_execution_id: null,
        contact_id: input.contactId ?? null,
        cadence_step: null,
        // #2123.1 — l'objet canonique visé, écrit avec l'action elle-même.
        target_kind: input.target?.kind ?? null,
        target_id: input.target?.id ?? null,
        target_label: input.target?.label ?? null,
        // #2123.46 — la provenance est VRAIE et connue : cette ligne vient d'un
        // humain, à cet instant. Un `null` ici aurait fait passer pour « non
        // conservée » la seule provenance dont on soit certain.
        source: 'human',
        source_at: new Date(),
        due_date: input.dueDate ?? null,
        completed_at: null,
        last_reminded_on: null,
      }),
    )
    return toDto(saved)
  }

  /**
   * #3287 (#3265.2) — une règle inconnue est REFUSÉE à l'écriture.
   * #3295 — `learned:<uuid>` désigne une règle apprise : elle doit exister,
   * ACTIVÉE, dans l'espace de l'écrivain (jamais celle d'un autre espace,
   * jamais une règle en attente de revue). Sans dépôt (module retiré) : refus.
   */
  private async assertKnownMethodRule(methodRule: string | null | undefined, workspaceId: string): Promise<void> {
    if (!methodRule) return
    const learnedId = parseLearnedRuleRef(methodRule)
    if (learnedId) {
      const rule = await this.learnedRules?.findOne({
        where: { id: learnedId, workspace_id: workspaceId, enabled: true },
      })
      if (!rule) throw new BadRequestException(`Unknown or inactive learned rule: ${methodRule}`)
      return
    }
    if (!METHOD_CORPUS_V1.rules.some(rule => rule.rule_id === methodRule)) {
      throw new BadRequestException(`Unknown method rule: ${methodRule}`)
    }
  }

  /**
   * #2123.46 / #2123.47 — la porte d'écriture du FORMULAIRE DU PLAN.
   *
   * Elle écrit UNE ligne `action_plan_items`, la même que celle que le plan
   * affiche et que l'écran Actions liste. Avant ce lot, ce formulaire écrivait
   * dans `raw_analysis.user_plan_actions` (le JSON de l'analyse) : la tâche
   * existait en double au compte, sans statut, et n'atteignait aucun autre
   * écran.
   *
   * L'objet visé n'est pas deviné : `target: null` quand la personne a tapé une
   * phrase libre, et l'écran NOMME le manque plutôt que d'inventer une cible.
   */
  // #2395.8 — la porte HTTP (`createPlanActionSchema`) exige `expected_outcome` ; les appelants INTERNES déjà
  // en place (revue d'équipe) ne le portent pas encore : tolérés ici, nommés au rapport — jamais devinés.
  async createFromPlan(
    userId: string,
    input: Omit<CreatePlanAction, 'expected_outcome'> & { expected_outcome?: string | null },
  ): Promise<CreatedPlanAction> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const account = await this.accounts.findOne({ where: { id: input.account_id, workspace_id: workspaceId } })
    if (!account) throw new NotFoundException('Account not found')

    // #2123.46 — l'IDEMPOTENCE de l'ancienne porte, gardée et dite. L'append
    // dans `raw_analysis.user_plan_actions` ignorait un élément déjà présent et
    // le rendait observable (`added: false`) : c'est ce qui permet à l'ajout en
    // masse d'annoncer « N ajoutés, M ignorés (déjà au plan) ».
    //
    // #3265.8/.9 (BEL-SC-236, P0) — le doublon est une action OUVERTE de la
    // bande manuelle, sur CE COMPTE, avec le même libellé et le même objet —
    // posée par N'IMPORTE QUEL membre de l'espace, pas seulement moi. `règle
    // "vérifier les actions des collègues"` : deux commerciaux qui tapent
    // « Prendre contact avec Sophie » le même jour ne doivent pas ouvrir deux
    // lignes qui se marchent dessus. `account_id` est DÉJÀ vérifié membre du
    // même espace (`this.accounts.findOne` juste au-dessus, filtré sur
    // `workspace_id`) : borner en plus sur `user_id` ici serait le second
    // chemin qui recalcule la même portée (GA-26), donc il disparaît.
    const label = input.label.trim()
    // #3287 (#3265.2) — une règle méthode inconnue du corpus gouverné est
    // REFUSÉE à l'écriture : rattacher une action à une règle qui n'existe pas
    // serait une donnée inventée, et l'agrégat de résultats par règle la compterait.
    await this.assertKnownMethodRule(input.method_rule, workspaceId)
    const duplicate = await this.items.findOne({
      where: {
        account_id: input.account_id,
        week_index: MANUAL_WEEK_INDEX,
        label,
        target_kind: input.target?.kind ?? IsNull(),
        target_id: input.target?.id ?? IsNull(),
        done: false,
      },
    })
    if (duplicate) {
      // #2317.11 (épopée #2923) — DÉDUPLIQUER NE VEUT PAS DIRE IGNORER : un
      // même scope (compte, objet, libellé) qui revient avec une info que la
      // ligne n'avait pas encore (date, consigne, résultat attendu) la
      // COMPLÈTE — jamais un second silence qui perdrait cette info. Un champ
      // DÉJÀ écrit n'est jamais touché : une correction humaine gagne
      // toujours, un rejeu ne l'écrase pas (doctrine CLAUDE.md).
      //
      // #3265.9 — cette complétion ne vaut que pour MA PROPRE ligne. Un
      // doublon posé par un COLLÈGUE (`duplicate.user_id !== userId`) est
      // rendu tel quel, JAMAIS réécrit : « on propose une fusion, on ne
      // fusionne jamais » (doctrine) s'applique aussi à un champ qu'on
      // complèterait à sa place sans qu'il l'ait demandé. L'appelant voit
      // `added: false` et la ligne porte déjà son propriétaire
      // (`owner_name`/`assigned_to`) pour que l'écran puisse dire qui l'a.
      if (duplicate.user_id !== userId) return { ...toDto(duplicate), added: false }
      const fill: Partial<ActionPlanItemEntity> = {}
      if (duplicate.due_date === null && input.due_date) fill.due_date = input.due_date
      if (duplicate.reason === null && input.reason) fill.reason = input.reason.trim()
      if (duplicate.expected_outcome === null && input.expected_outcome)
        fill.expected_outcome = input.expected_outcome.trim()
      if (duplicate.kpi === null && input.kpi) fill.kpi = input.kpi.trim()
      const updated = Object.keys(fill).length > 0 ? await this.items.save({ ...duplicate, ...fill }) : duplicate
      return { ...toDto(updated), added: false }
    }

    const created = await this.createManual(userId, input.account_id, {
      label,
      target: input.target,
      ownerName: input.owner_name ?? null,
      dueDate: input.due_date ?? null,
      reason: input.reason ?? null,
      expectedOutcome: input.expected_outcome ?? null,
      kpi: input.kpi ?? null,
      channel: input.channel ?? null,
      sourceRecommendation: input.source_recommendation ?? null,
      methodRule: input.method_rule ?? null,
      stopCondition: input.stop_condition ?? null,
      contactId: await this.contactOfAccount(input),
    })
    return { ...created, added: true }
  }

  /**
   * #4416 — « Préparer un plan pour <prénom> » : 2-3 étapes pour UN contact, RANGÉES dans le plan du compte
   * (la même ligne `action_plan_items` que le reste — un seul plan, jamais deux sources).
   *
   * Une étape par canal que le contact porte RÉELLEMENT (e-mail, LinkedIn, téléphone) : on ne propose pas
   * d'appeler quelqu'un dont on n'a pas le numéro. Aucun appel modèle, aucun message inventé ici — le texte
   * prêt à envoyer reste celui que l'analyse a préparé pour ce contact (l'écran le lit sur la fiche). Rien ne
   * part : « Préparer » ouvre un brouillon, c'est le commercial qui envoie.
   *
   * Portée : le compte doit être de l'espace de l'appelant (`createFromPlan` le revérifie) ET le contact de ce
   * compte — sinon 404, sans rien écrire. Idempotent : une étape OUVERTE de même libellé et même objet n'est
   * pas écrite deux fois (`createFromPlan`), on rend alors la ligne existante.
   */
  async prepareForContact(userId: string, input: PrepareContactPlan): Promise<ActionPlanItem[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const account = await this.accounts.findOne({ where: { id: input.account_id, workspace_id: workspaceId } })
    if (!account) throw new NotFoundException('Account not found')
    const contact = await this.contacts.findOne({ where: { id: input.contact_id, account_id: input.account_id } })
    if (!contact) throw new NotFoundException('Contact not found')

    const copy = CONTACT_PLAN_COPY[input.locale ?? 'fr']
    const channels: PlanActionChannel[] = []
    if (contact.email) channels.push('email')
    if (contact.linkedin_url) channels.push('linkedin')
    if (contact.phone) channels.push('phone')
    if (channels.length === 0) throw new BadRequestException('contact_no_reachable_channel')

    const steps: ActionPlanItem[] = []
    for (const channel of channels) {
      const created = await this.createFromPlan(userId, {
        account_id: input.account_id,
        label: copy.label[channel as 'email' | 'linkedin' | 'phone'](contact.full_name),
        reason: copy.reason(contact.full_name),
        expected_outcome: copy.expectedOutcome(contact.full_name),
        target: { kind: 'contact', id: contact.id, label: contact.full_name },
        owner_name: null,
        channel,
        method_rule: 'couverture_multi_roles_niveaux_entites',
      })
      const { added: _added, ...step } = created
      steps.push(step)
    }
    return steps
  }

  /**
   * #2123.46 — alias déprécié le 17/09, à retirer après la vague 25.
   *
   * `POST /accounts/:id/plan/actions` reste servi pour les onglets encore sur
   * l'ancien web (le web et l'API ne basculent pas au même instant). Il traduit
   * l'ancien corps (`UserPlanAction`) et passe par {@link createFromPlan} : la
   * MÊME ligne, jamais `raw_analysis.user_plan_actions` (GA-26). Il rend la
   * forme que l'ancien web applique à son cache — l'analyse INCHANGÉE, et
   * `added` —, sinon l'ancien onglet effacerait son dossier en mémoire.
   *
   * L'échéance de l'ancien corps est de la prose (« Cette semaine ») ou une
   * date : seule une date calendaire est gardée, rien n'est deviné. `outil`
   * n'a pas de colonne et n'est pas repris.
   */
  async createFromLegacyPlanAction(
    userId: string,
    accountId: string,
    action: UserPlanAction,
  ): Promise<AccountPlanMutationResponse> {
    // #2871 (#2395.8) — l'ancien corps n'a PAS de champ objectif : le résultat
    // attendu en tient lieu, et sans lui l'action est refusée plutôt que
    // créée sans objectif. Rien n'est inventé.
    const objective = action.expected_outcome?.trim()
    if (!objective) throw new BadRequestException('plan_action_objective_required')
    const created = await this.createFromPlan(userId, {
      account_id: accountId,
      label: action.text,
      reason: objective,
      target: null,
      owner_name: action.responsable?.trim() || null,
      expected_outcome: action.expected_outcome?.trim() || null,
      kpi: action.kpi?.trim() || null,
      due_date: isCalendarDate(action.deadline) ? action.deadline : null,
    })
    const account = await this.accounts.findOne({ where: { id: accountId }, select: ['id', 'raw_analysis'] })
    return {
      raw_analysis: (account?.raw_analysis as unknown as Record<string, unknown> | null) ?? {},
      added: created.added,
    }
  }

  /**
   * #2123.46 — le contact LIÉ d'une action qui vise un contact.
   *
   * La fiche contact et l'ajout en masse désignent quelqu'un : sans ce lien,
   * l'écran réclamerait « quel contact ? » ({@link actionMissingData}) à une
   * action qui le nomme. L'identifiant vient du client, donc il n'est lié que
   * si le contact appartient bien au compte visé (lui-même vérifié dans MON
   * espace) — sinon `null`, et l'écran nomme le manque au lieu de rattacher
   * l'action à la fiche de quelqu'un d'autre.
   */
  private async contactOfAccount(input: Pick<CreatePlanAction, 'account_id' | 'target'>): Promise<string | null> {
    if (input.target?.kind !== 'contact') return null
    if (!UUID_PATTERN.test(input.target.id)) return null
    const contact = await this.contacts.findOne({ where: { id: input.target.id, account_id: input.account_id } })
    return contact ? input.target.id : null
  }

  /**
   * #2123.46 — mes actions ouvertes dans MON espace actif (écran Actions).
   *
   * #2717 — `overdueOnly` restreint à la MÊME portée que la tuile « En retard »
   * du Dashboard (`countPersonalRelances().overdue`) : voir {@link listOpenForUser}.
   */
  async listMine(userId: string, overdueOnly = false): Promise<MyPlanAction[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return this.listOpenForUser(userId, workspaceId, 200, overdueOnly)
  }

  /**
   * #4418.1 — COMBIEN d'actions ouvertes `listMine` devrait rendre, sans le plafond de 200 lignes.
   *
   * `GET /plan-items/mine` trie par échéance (sans échéance en dernier) puis coupe à 200 : un espace à 216
   * actions perdait les 16 dernières — dont une tâche venant d'être créée sans date — sans que l'écran le dise.
   * Ce compteur est la MÊME portée ({@link openItemsScope}, et le même filtre « en retard » que la liste) : l'écran
   * compare ce total à ce qu'il montre et NOMME l'écart. `null` = lecture impossible, jamais « 0 ».
   */
  async countMine(userId: string, overdueOnly = false): Promise<{ open: number } | null> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      let qb = this.openItemsScope(userId, workspaceId)
      if (overdueOnly) qb = qb.andWhere('item.due_date < :today', { today: parisToday() })
      return { open: await qb.getCount() }
    } catch (err) {
      this.logger.warn('countMine failed', { error: err instanceof Error ? err.message : String(err) })
      return null
    }
  }

  /**
   * #4485 (décision Louis 24/10, « Proposer de les clore ») — marque FAITES, après le clic de la personne,
   * les actions ouvertes qui datent de plus de {@link STALE_ACTION_DAYS} jours.
   *
   * Trois garde-fous, tous testés :
   *  - PROPRIÉTÉ — chaque identifiant doit être une action de l'appelant (créée par lui ou déléguée à lui),
   *    jamais celle d'un collègue (même avec `team:manage` : ce geste est « mon ménage »). Un identifiant
   *    inconnu ou d'un autre : 404 pour TOUTE la demande, rien n'est écrit, sans dire lequel (pas d'oracle).
   *  - DÉCLARATIF — l'issue est `other` et le mode de complétion `manual` (le clic humain de `update`) : aucune
   *    preuve d'envoi n'est posée (c73), l'écriture passe par `update` donc par le MÊME audit `user_actions`.
   *  - BORNÉ — seules les ouvertes, datées, plus vieilles que le seuil ; les autres sont comptées « inchangées ».
   *    Rien n'est supprimé.
   */
  async closeStale(userId: string, ids: readonly string[]): Promise<CloseStalePlanItemsResult> {
    const wanted = [...new Set(ids)]
    const rows = wanted.length ? await this.items.find({ where: { id: In(wanted) } }) : []
    const byId = new Map(rows.map(row => [row.id, row]))
    const owns = (row: ActionPlanItemEntity): boolean => row.user_id === userId || row.assigned_to === userId
    if (wanted.some(id => !byId.has(id) || !owns(byId.get(id)!))) {
      throw new NotFoundException('Action plan item not found')
    }
    const cutoff = parisDaysAgo(STALE_ACTION_DAYS)
    const isStale = (row: ActionPlanItemEntity): boolean =>
      row.execution_status !== 'done' && !row.done && row.due_date != null && String(row.due_date).slice(0, 10) < cutoff

    const result: CloseStalePlanItemsResult = { closed: 0, skipped: 0, failed: 0 }
    for (const id of wanted) {
      if (!isStale(byId.get(id)!)) {
        result.skipped += 1
        continue
      }
      try {
        await this.update(userId, id, { done: true, outcome: 'other' })
        result.closed += 1
      } catch (err) {
        result.failed += 1
        this.logger.warn('closeStale: une action n’a pas pu être clôturée', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    return result
  }

  /**
   * #4158.48 — la ligne d'un COLLÈGUE (ni créée par moi, ni déléguée à moi) : je
   * peux l'écrire seulement avec `team:manage` dans l'espace de la ligne. Une
   * ligne d'un autre espace (ou inexistante) est introuvable (404) ; un membre
   * du même espace sans le droit reçoit 403 (l'écran la montre en lecture).
   */
  private async colleagueItemForWrite(userId: string, id: string): Promise<ActionPlanItemEntity | null> {
    const row = await this.items.findOne({ where: { id } })
    if (!row) return null
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // #4804 — tout coéquipier de l'espace agit sur l'action, quel qu'en soit l'auteur (le plan est
    // d'équipe, décision Louis 29/10). Autre espace : introuvable. Plus de `team:manage` ici.
    const account = await this.accounts.findOne({ where: { id: row.account_id }, select: ['id', 'workspace_id'] })
    if (!account || account.workspace_id !== workspaceId) return null
    return row
  }

  /**
   * L'étape (persistée ou virtuelle) appartient-elle à un compte de CET espace ?
   * La surface MCP s'en sert AVANT d'écrire : `update` ne borne que par
   * personne (créateur / délégataire), pas par espace — un identifiant d'un
   * autre espace ne doit jamais atteindre l'écriture.
   */
  async itemInWorkspace(id: string, workspaceId: string): Promise<boolean> {
    if (isVirtualStepId(id)) {
      const position = parseVirtualStepId(id)
      if (!position) return false
      const account = await this.accounts.findOne({
        where: { id: position.accountId, workspace_id: workspaceId },
        select: { id: true },
      })
      return account !== null
    }
    const count = await this.items
      .createQueryBuilder('item')
      .innerJoin('accounts', 'account', 'account.id = item.account_id')
      .where('item.id = :id', { id })
      .andWhere('account.workspace_id = :workspaceId', { workspaceId })
      .getCount()
    return count > 0
  }

  /**
   * Apply a single executable change to an item, scoped to its owner:
   *  - `done` / `due_date`: the legacy checkbox + deadline.
   *  - `execution_status`: `done` / `snoozed` / `todo`; kept in sync with `done`
   *    and `completed_at`.
   *  - `snoozed_until`: the timestamp a snoozed item resurfaces at.
   *  - `assigned_to`: delegate to a workspace member (validated) or `null` to
   *    unassign.
   *
   * Lifecycle changes (`execution_status` / assigning) are mirrored into the
   * `user_actions` team feed; the legacy `done` / `due_date` path is left to the
   * client's own tracking to avoid double-counting.
   */
  async update(userId: string, id: string, patch: UpdateActionPlanItem): Promise<ActionPlanItem> {
    // La portée d'ÉCRITURE reprend celle de la LECTURE (#1285) : une action est
    // mienne quand je l'ai créée OU qu'on me l'a déléguée. Elle ne regardait que
    // `user_id`, si bien qu'une relance affichée sur MON tableau de bord parce
    // qu'elle m'était assignée se refusait en 404 quand je la marquais faite —
    // le délégataire voyait la tâche et ne pouvait pas la clore. Deux portées
    // différentes sur le même objet produisent toujours ce défaut-là.
    // #2395.1 — une étape jamais actée porte un id par position : on écrit UNE
    // ligne, celle que le geste touche, jamais tout le plan.
    const item = isVirtualStepId(id)
      ? await this.materializeStep(userId, id)
      : ((await this.items.findOne({
          where: [
            { id, user_id: userId },
            { id, assigned_to: userId },
          ],
        })) ?? (await this.colleagueItemForWrite(userId, id)))
    if (!item) throw new NotFoundException('Action plan item not found')

    // The lifecycle fields (assign / status) are the only ones that need the
    // caller's workspace — resolve it once, and only when actually needed.
    // #2396.13 — NO-GO : une complétion ne disparaît jamais SANS AUDIT. Le
    // drapeau historique `done` change `execution_status` exactement comme le
    // ferait `execution_status: 'done'` (voir `applyStatus` plus bas) : il doit
    // donc déclencher le MÊME journal, ou une ligne se marquait faite sans
    // laisser de trace dans `user_actions`.
    const touchesLifecycle =
      patch.assigned_to !== undefined || patch.execution_status !== undefined || patch.done !== undefined
    const workspaceId = touchesLifecycle
      ? (await this.workspaceContext.resolveActiveWorkspace(userId)).workspaceId
      : null

    // Validate the assignee up front so an invalid patch changes nothing.
    if (patch.assigned_to) {
      const membership = await this.workspaceContext.getMembership(patch.assigned_to, workspaceId!)
      if (!membership) throw new BadRequestException('Assignee is not a member of this workspace')
    }

    // #4158.31 — déléguer à un AUTRE membre exige une note de contexte (affichée au délégataire).
    // S'attribuer l'action ou la libérer n'en demande pas ; un délégataire inchangé non plus,
    // sauf si une note est fournie (elle remplace l'ancienne).
    const handoffNote = patch.handoff_note?.trim() || null
    const delegatesToColleague =
      !!patch.assigned_to && patch.assigned_to !== userId && patch.assigned_to !== item.assigned_to
    if (delegatesToColleague && !handoffNote) {
      throw new BadRequestException('handoff_note is required to delegate an action to a colleague')
    }

    // #2396.2 — une complétion MANUELLE (clic humain, pas un import ni une
    // migration) exige une issue choisie. On ne redemande rien à un
    // `done → done` (ex. un simple changement d'assignation sur une ligne déjà
    // faite) : seule la TRANSITION vers `done` est concernée.
    const entersDone = (patch.done === true || patch.execution_status === 'done') && item.execution_status !== 'done'
    if (entersDone && !patch.outcome) {
      throw new BadRequestException('outcome is required to mark an action done')
    }

    // Legacy checkbox: flip `done` and mirror it onto the lifecycle state.
    if (patch.done !== undefined) {
      applyStatus(item, patch.done ? 'done' : 'todo', patch.outcome)
    }
    if (patch.due_date !== undefined) {
      item.due_date = patch.due_date
    }
    // Executable lifecycle wins over the legacy flag when both are present.
    if (patch.execution_status !== undefined) {
      applyStatus(item, patch.execution_status, patch.outcome)
    }
    if (patch.snoozed_until !== undefined) {
      item.snoozed_until = patch.snoozed_until ? new Date(patch.snoozed_until) : null
    }
    // #3211.9 (#3234, lot M11) — l'issue DÉCLARÉE APRÈS COUP sur une action
    // déjà faite sans issue (preuve d'envoi, ligne ancienne) : posée UNE fois,
    // jamais en réécrivant une issue déjà déclarée, sans toucher au mode de
    // complétion (une action prouvée reste prouvée). Sur une action ouverte,
    // une issue seule ne la complète pas.
    const fillsOutcome = !entersDone && !!patch.outcome && item.execution_status === 'done' && item.outcome === null
    if (fillsOutcome) {
      item.outcome = patch.outcome!
    }
    // #4158.16 — délégué à un COLLÈGUE (pas à moi, pas déjà lui) : il sera prévenu.
    const delegatedTo =
      patch.assigned_to && patch.assigned_to !== item.assigned_to && patch.assigned_to !== userId
        ? patch.assigned_to
        : null
    if (patch.assigned_to !== undefined) {
      item.assigned_to = patch.assigned_to
      // #4158.31 — la note suit la délégation : posée avec elle, effacée quand l'action
      // est libérée ou reprise par son propre auteur.
      if (patch.assigned_to && patch.assigned_to !== userId) {
        if (handoffNote) {
          item.handoff_note = handoffNote
          item.handoff_by = userId
        }
      } else {
        item.handoff_note = null
        item.handoff_by = null
      }
    }
    // #2153.57 — détouré comme `reason`/`gapExplanation` ailleurs : une chaîne
    // blanche n'est pas un résultat, c'est l'absence d'un résultat.
    if (patch.result !== undefined) {
      item.result = patch.result?.trim() || null
    }
    // #3287 (#3265.2) — l'identifiant d'exécution externe s'écrit UNE fois : un
    // identifiant déjà posé reste (une correction humaine gagne, un rejeu
    // d'un connecteur n'écrase pas).
    if (patch.external_execution_id !== undefined && !item.external_execution_id) {
      // #3777.9 (18/10) — idempotence : une exécution externe ne se rattache qu'à UNE action du propriétaire.
      const holder = await this.items.findOne({
        where: { user_id: item.user_id, external_execution_id: patch.external_execution_id },
      })
      if (holder && holder.id !== item.id) {
        throw new ConflictException('External execution already attached to another action')
      }
      item.external_execution_id = patch.external_execution_id
    }

    const saved = await this.items.save(item)

    if (delegatedTo && workspaceId) {
      await this.teamNotifications?.notifyActionDelegated({
        workspaceId,
        actorUserId: userId,
        recipientUserId: delegatedTo,
        accountId: saved.account_id ?? null,
      })
    }

    // #3211.9 — l'issue posée après coup a les MÊMES effets qu'à la complétion.
    if (fillsOutcome) {
      const { workspaceId: fillWorkspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      await this.propagateOutcome(fillWorkspaceId, saved)
    }
    if (touchesLifecycle && workspaceId) {
      await this.recordLifecycle(userId, workspaceId, saved, patch)
      if (entersDone) {
        await this.propagateOutcome(workspaceId, saved)
        await this.scheduleCallbackTask(workspaceId, userId, saved, patch.callback_date)
      }
    }
    return toDto(saved)
  }

  /**
   * #3416.4 — l'issue choisie met à jour le CONTACT visé et le board du COMPTE,
   * pas seulement la ligne d'action (règles : `action-outcome-effect.ts`).
   * Best-effort comme `recordLifecycle` : l'issue est déjà enregistrée, un échec
   * ici ne la défait pas.
   */
  private async propagateOutcome(workspaceId: string, item: ActionPlanItemEntity): Promise<void> {
    const effect = actionOutcomeEffect(item.outcome)
    if (!effect || !item.contact_id) return
    try {
      const contact = await this.contacts.findOne({
        where: { id: item.contact_id, account_id: item.account_id },
        select: ['id', 'user_status'],
      })
      if (!contact || !contactStatusMayMove(contact.user_status, effect.contactStatus)) return
      await this.contacts.update({ id: contact.id }, { user_status: effect.contactStatus })
      if (effect.sprintEvent)
        await this.sprintBus?.emit({
          workspaceId,
          accountId: item.account_id,
          event: effect.sprintEvent,
          sourceRef: item.id,
        })
    } catch (cause) {
      this.logger.warn('outcome propagation failed', { error: cause, tags: { itemId: item.id } })
    }
  }

  /**
   * #3416.2b — issue `callback_scheduled` AVEC date ⇒ UNE tâche ouverte datée.
   * Idempotente : la clé `source_label_key` porte l'identifiant de la ligne, un
   * rejeu ne crée rien. Sans date, rien n'est inventé. Best-effort.
   */
  private async scheduleCallbackTask(
    workspaceId: string,
    userId: string,
    item: ActionPlanItemEntity,
    callbackDate: string | undefined,
  ): Promise<void> {
    if (item.outcome !== 'callback_scheduled' || !callbackDate) return
    await this.scheduleCallbackRelance(userId, item, callbackDate)
    if (!this.taskRows) return
    const key = `plan-item-callback:${item.id}`
    try {
      const existing = await this.taskRows.findOne({ where: { workspace_id: workspaceId, source_label_key: key } })
      if (existing) return
      await this.taskRows.save(
        this.taskRows.create({
          workspace_id: workspaceId,
          owner_id: item.assigned_to ?? userId,
          created_by: userId,
          title: `Rappeler — ${item.label}`,
          details: null,
          status: 'todo',
          priority: 'normal',
          due_on: callbackDate,
          source: 'plan_callback',
          source_label_key: key,
          account_id: item.account_id,
          contact_id: item.contact_id ?? null,
          objective: `Rappel programmé à la clôture de l'action « ${item.label} »`,
        }),
      )
    } catch (cause) {
      this.logger.warn('callback task creation failed', { error: cause, tags: { itemId: item.id } })
    }
  }

  /**
   * #3416.2 (recette démo 05/10) — « À rappeler » + date doit faire NAÎTRE la
   * relance à cette date là où l'utilisateur la cherche : « Mes relances » lit
   * les lignes de plan datées ouvertes, pas les tâches. On crée donc la ligne
   * suivante (même compte, même contact, même responsable), reliée à la ligne
   * clôturée par `depends_on_item_id` — c'est aussi la clé d'idempotence : un
   * rejeu ne crée rien. `cadence_step: 'relance'` seulement quand un contact est
   * visé (une ligne de cadence exige un contact ; sans, elle reste une ligne de
   * plan ordinaire). Best-effort : l'issue est déjà enregistrée.
   */
  private async scheduleCallbackRelance(
    userId: string,
    item: ActionPlanItemEntity,
    callbackDate: string,
  ): Promise<void> {
    try {
      const existing = await this.items.findOne({ where: { depends_on_item_id: item.id } })
      if (existing) return
      await this.items.save(
        this.items.create({
          user_id: item.user_id ?? userId,
          account_id: item.account_id,
          source_plan_id: item.source_plan_id ?? null,
          label: item.label,
          week_index: item.week_index ?? 0,
          step_index: item.step_index ?? 0,
          done: false,
          execution_status: 'todo',
          assigned_to: item.assigned_to ?? null,
          owner_name: item.owner_name ?? null,
          channel: item.channel ?? null,
          contact_id: item.contact_id ?? null,
          cadence_step: item.contact_id ? 'relance' : null,
          target_kind: item.target_kind ?? null,
          target_id: item.target_id ?? null,
          target_label: item.target_label ?? null,
          depends_on_item_id: item.id,
          source: 'human',
          due_date: callbackDate,
        }),
      )
    } catch (cause) {
      this.logger.warn('callback relance creation failed', { error: cause, tags: { itemId: item.id } })
    }
  }

  /**
   * "Mes relances à faire" for the personal cockpit (roadmap §5 — seat value):
   * the not-done, DATED plan items that are MINE to action, inside my workspace.
   *
   * Ownership is strict and personal — an item is mine when it is either
   * delegated to me (`assigned_to = userId`) or I own it and nobody else was
   * assigned (`assigned_to IS NULL AND user_id = userId`). An item I own but
   * delegated to a teammate is NOT returned; a teammate's item delegated to me
   * IS. The join to `accounts` both resolves the company name and pins the row to
   * my active workspace (`account.workspace_id`), excluding deleted accounts.
   *
   * Le périmètre « ouverte » est celui du cockpit manager, mot pour mot : ni
   * faite (`done` / `execution_status`), ni reportée dans le futur
   * (`snoozed_until`), sur un compte ni supprimé ni archivé (#1285).
   *
   * Ordered by `due_date` ASC (most urgent first). `overdue` is the Europe/Paris
   * calendar-day compare used by the relance cron. Fails soft to `[]`.
   */
  async listPersonalRelances(userId: string, workspaceId: string, limit = 100): Promise<PersonalRelance[]> {
    try {
      const today = parisToday()
      const rows = await this.personalRelancesScope(userId, workspaceId)
        .select([
          'item.id AS id',
          'item.account_id AS account_id',
          'account.company_name AS company_name',
          'item.label AS label',
          "to_char(item.due_date, 'YYYY-MM-DD') AS due_date",
          'item.cadence_step AS cadence_step',
          'item.contact_id AS contact_id',
          'item.assigned_to AS assigned_to',
        ])
        .orderBy('item.due_date', 'ASC')
        .limit(limit)
        .getRawMany<PersonalRelanceRow>()
      return rows
        .map(row => toPersonalRelance(row, today, userId))
        .filter((relance): relance is PersonalRelance => relance !== null)
    } catch (err) {
      this.logger.warn('listPersonalRelances failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  /**
   * COMBIEN de relances j'ai d'ouvertes, et combien sont en retard — par une
   * requête de COMPTAGE.
   *
   * ⚠️ Le cockpit lisait `listPersonalRelances(...).length`, et cette liste est
   * bornée à 100. Au-delà, la tuile n'affichait plus un nombre mais la BORNE :
   * mesuré le 31/08/2026 en production, « 100 relances à faire » sur un compte
   * qui en avait davantage. C'est exactement le défaut déjà corrigé un cran plus
   * haut pour les comptes ({@link AccountsService.countPersonalAccounts}) — un
   * plafond qui a l'air d'un chiffre. La liste AFFICHE, la requête COMPTE, et
   * les deux partagent la même portée ({@link personalRelancesScope}) pour que
   * le nombre annoncé soit celui des lignes en dessous.
   *
   * Échoue en douceur sur `null` — un comptage impossible n'est pas un zéro.
   */
  async countPersonalRelances(userId: string, workspaceId: string): Promise<{ open: number; overdue: number } | null> {
    try {
      const row = await this.personalRelancesScope(userId, workspaceId)
        .select('COUNT(*)::int', 'open')
        .addSelect('COUNT(*) FILTER (WHERE item.due_date < :today)::int', 'overdue')
        .setParameter('today', parisToday())
        .getRawOne<{ open: number | string; overdue: number | string }>()
      if (!row) return null
      return { open: Number(row.open) || 0, overdue: Number(row.overdue) || 0 }
    } catch (err) {
      this.logger.warn('countPersonalRelances failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }
  }

  /**
   * #2123.46 — MES actions ouvertes, tous comptes confondus, pour l'écran
   * Actions.
   *
   * C'est la MÊME ligne que celle du plan du compte (`action_plan_items`) : un
   * statut changé ici est changé là-bas, sans resynchronisation, parce qu'il
   * n'y a rien à synchroniser. Le nom du compte voyage avec, sinon « Rappeler
   * le DSI » ne désigne personne sur un écran transversal.
   *
   * La portée « ouverte » est celle, déjà écrite, de « Mes relances » —
   * {@link openItemsScope} — moins l'exigence d'une échéance : une action
   * saisie sans date est une action, et l'écran Actions la doit.
   *
   * Échoue en douceur sur `[]` : une liste impossible ne se rend pas en erreur
   * plein écran, et ne se rend pas non plus en « tu n'as rien à faire ».
   */
  async listOpenForUser(
    userId: string,
    workspaceId: string,
    limit = 200,
    overdueOnly = false,
    // Surface MCP (relances) : dues AUJOURD'HUI inclus ou en retard, sans les
    // actions sans échéance ni celles du futur.
    dueUpToToday = false,
  ): Promise<MyPlanAction[]> {
    try {
      let qb = this.openItemsScope(userId, workspaceId).select('item').addSelect('account.company_name', 'company_name')
      // #2717 — le MÊME filtre que `countPersonalRelances` (`personalRelancesScope`
      // + `due_date < :today`) : la tuile « En retard » du Dashboard compte cette
      // portée exacte, un second calcul aurait divergé au premier écart de fuseau.
      if (overdueOnly) {
        qb = qb.andWhere('item.due_date < :today', { today: parisToday() })
      } else if (dueUpToToday) {
        qb = qb.andWhere('item.due_date <= :today', { today: parisToday() })
      }
      const { entities, raw } = await qb
        // Les datées d'abord, la plus urgente en tête ; les non datées ensuite,
        // la plus récente en premier. `NULLS LAST` est explicite : en SQL, un
        // `NULL` remonte en tête d'un tri ASC, ce qui mettrait les actions sans
        // échéance avant une relance en retard.
        .orderBy('item.due_date', 'ASC', 'NULLS LAST')
        .addOrderBy('item.created_at', 'DESC')
        .limit(limit)
        .getRawAndEntities<{ company_name: string | null }>()
      // #4072.2 — l'historique d'échanges et les faits récents, par compte.
      const histories = await this.historyByAccount(
        workspaceId,
        userId,
        entities.map(entity => entity.account_id),
      )
      // #4521.1 — le contact visé, résolu UNE fois pour tout le lot (jamais une requête par carte).
      const contactsByAccount = await this.contactsByAccount(entities.map(entity => entity.account_id))
      return entities.map((entity, index) => {
        const history = histories.get(entity.account_id)
        const dto = toDto(entity)
        const mail = planMailContext(dto, contactsByAccount.get(entity.account_id) ?? [])
        return {
          ...dto,
          ...mail.contact,
          ...(mail.signal ? { signal: mail.signal } : {}),
          company_name: raw[index]?.company_name?.trim() || null,
          ...(history ? { history } : {}),
        }
      })
    } catch (err) {
      this.logger.warn('listOpenForUser failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  /**
   * #3211.9 (#3234, lot M11 09/10) — LA FILE PROACTIVE des issues manquantes :
   * MES actions FAITES ces 30 derniers jours sans issue déclarée (complétées
   * par preuve d'envoi, ou antérieures à la règle #2396.2), sur l'espace
   * actif, compte non archivé. `null` = lecture impossible — jamais « rien à
   * déclarer ». Les actions OUVERTES en retard ont déjà leur geste (Centre
   * d'actions, « En retard », issue choisie à la complétion) : pas ici.
   */
  async listDoneWithoutOutcome(userId: string, limit = 20): Promise<AwaitingOutcomeAction[] | null> {
    try {
      const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
      const rows = await this.items.query<
        Array<{
          id: string
          label: string
          account_id: string
          company_name: string | null
          completed_at: Date | string | null
          completion_mode: AwaitingOutcomeAction['completion_mode']
          target_kind: AwaitingOutcomeAction['target_kind']
        }>
      >(
        `SELECT item.id, item.label, item.account_id, account.company_name, item.completed_at,
                item.completion_mode, item.target_kind
           FROM action_plan_items item
           JOIN accounts account ON account.id = item.account_id
          WHERE item.execution_status = 'done'
            AND item.outcome IS NULL
            AND btrim(coalesce(item.label, '')) <> ''
            AND item.completed_at > now() - interval '30 days'
            AND (item.assigned_to = $1 OR (item.assigned_to IS NULL AND item.user_id = $1))
            AND account.workspace_id = $2
            AND account.status <> 'deleted'
            AND account.commercial_status <> 'archived'
          ORDER BY item.completed_at DESC
          LIMIT ${Math.max(1, Math.min(limit, 50))}`,
        [userId, workspaceId],
      )
      return rows.map(row => ({
        id: row.id,
        label: row.label,
        account_id: row.account_id,
        company_name: row.company_name?.trim() || null,
        completed_at: row.completed_at ? new Date(row.completed_at).toISOString() : null,
        completion_mode: row.completion_mode,
        target_kind: row.target_kind,
      }))
    } catch (err) {
      this.logger.warn('listDoneWithoutOutcome failed', { error: err instanceof Error ? err.message : String(err) })
      return null
    }
  }

  /**
   * La portée de « mes relances ouvertes », écrite UNE fois et partagée par la
   * liste et par le comptage (#1285). Deux requêtes qui la refont divergent, et
   * un compteur qui ne compte pas les lignes affichées est pire qu'absent.
   *
   * #2123.46 — elle AJOUTE l'exigence d'une échéance à {@link openItemsScope},
   * qui porte tout le reste : l'écran Actions montre aussi les actions sans
   * date, et deux définitions de « ouverte » auraient divergé au premier ajout.
   */
  private personalRelancesScope(userId: string, workspaceId: string) {
    return this.openItemsScope(userId, workspaceId).andWhere('item.due_date IS NOT NULL')
  }

  /**
   * Ce qu'est une action OUVERTE et MIENNE — la définition, à un seul endroit.
   */
  private openItemsScope(userId: string, workspaceId: string) {
    return (
      this.items
        .createQueryBuilder('item')
        .leftJoin('accounts', 'account', 'account.id = item.account_id')
        .where('item.done = false')
        // Une ligne sans texte n'est pas une relance : le commercial ne peut rien
        // en faire, et lui inventer un libellé la rendrait indiscernable d'une
        // vraie. Écartée EN SQL pour qu'elle ne consomme pas le `limit` au
        // détriment d'une relance réelle. (Des lignes creuses ont pu être semées
        // avant que `seedFromPlan` ne cesse d'en créer.)
        .andWhere("btrim(coalesce(item.label, '')) <> ''")
        // Portée « action OUVERTE », mot pour mot celle qui est déjà écrite dans
        // `ManagerService.sharedActions` et `team-kpis.workloadByMember` : ni
        // faite, ni parquée dans le futur, sur un compte non archivé. Les trois
        // manquaient ici (#1285) — le cockpit personnel et le cockpit manager
        // lisaient deux « actions en cours » différentes, et une relance reportée
        // à la semaine prochaine continuait de s'afficher, en retard.
        //
        // `execution_status` double `done` volontairement : ce sont deux colonnes
        // tenues en phase par `applyStatus`, et une lecture qui n'en interroge
        // qu'une ressusciterait la ligne le jour où elles divergent.
        .andWhere("item.execution_status <> 'done'")
        .andWhere('(item.snoozed_until IS NULL OR item.snoozed_until <= now())')
        .andWhere('account.workspace_id = :workspaceId', { workspaceId })
        .andWhere("account.status <> 'deleted'")
        .andWhere("account.commercial_status <> 'archived'")
        .andWhere('(item.assigned_to = :userId OR (item.assigned_to IS NULL AND item.user_id = :userId))', { userId })
    )
  }

  private async findOrdered(userId: string, accountId: string): Promise<ActionPlanItemEntity[]> {
    const rows = await this.items.find({
      // `cadence_step IS NULL` keeps the plan checklist to plan-derived rows only:
      // multi-touch cadence follow-ups (Drive #8) live in the same table (so the
      // relance cron reminds them) but belong to a contact, not the account board.
      //
      // #4158.5 — TOUTES les lignes du compte (le compte a été prouvé de l'espace
      // par l'appelant), plus seulement les miennes.
      where: { account_id: accountId, cadence_step: IsNull() },
      order: { week_index: 'ASC', step_index: 'ASC' },
    })
    // Deux membres ont pu matérialiser la MÊME étape du plan : une seule ligne
    // par position, la mienne d'abord. Les actions manuelles ne se dédoublonnent
    // pas — leur `step_index` est compté par auteur, deux collègues y collisionnent.
    const byPosition = new Map<string, ActionPlanItemEntity>()
    const out: ActionPlanItemEntity[] = []
    for (const row of rows) {
      if (row.week_index === MANUAL_WEEK_INDEX) {
        out.push(row)
        continue
      }
      const key = `${row.week_index}-${row.step_index}`
      const kept = byPosition.get(key)
      if (!kept) {
        byPosition.set(key, row)
        out.push(row)
      } else if (kept.user_id !== userId && row.user_id === userId) {
        out[out.indexOf(kept)] = row
        byPosition.set(key, row)
      }
    }
    return out
  }

  /** Mirror a lifecycle change into the `user_actions` team feed. Best-effort:
   *  the persisted item is the source of truth, so a feed write failing must not
   *  fail the executable action. */
  private async recordLifecycle(
    userId: string,
    workspaceId: string,
    item: ActionPlanItemEntity,
    patch: UpdateActionPlanItem,
  ): Promise<void> {
    const events: { action_type: ActionType; metadata: Record<string, unknown> }[] = []

    // #2396.13 — le drapeau historique `done` produit le MÊME événement d'audit
    // qu'`execution_status` : `applyStatus` le traite déjà comme une vraie
    // transition de cycle de vie (ligne 332), donc l'auditer différemment (ou
    // pas du tout) laisserait une action disparaître sans trace. `execution_status`
    // garde la priorité quand les deux sont fournis (même règle qu'à l'écriture).
    const effectiveStatus: ActionExecutionStatus | undefined =
      patch.execution_status !== undefined
        ? patch.execution_status
        : patch.done !== undefined
          ? patch.done
            ? 'done'
            : 'todo'
          : undefined
    const statusType = effectiveStatus === undefined ? null : STATUS_ACTION_TYPE[effectiveStatus]
    // #3416.4b — une issue sans équivalent de statut contact se NOMME dans la frise.
    const named = effectiveStatus === 'done' ? outcomeTimelineLabel(item.outcome) : null
    if (effectiveStatus !== undefined && statusType) {
      events.push({
        action_type: statusType,
        metadata: {
          plan_action_item_id: item.id,
          label: named ? named.fr : STATUS_LABEL[effectiveStatus],
          ...(named ? { label_en: named.en, outcome: item.outcome, detail: item.label } : {}),
          source: 'action_plan_item',
          source_label: 'Plan d’action',
          ...(effectiveStatus === 'snoozed' && item.snoozed_until
            ? { snoozed_until: item.snoozed_until.toISOString() }
            : {}),
        },
      })
    }
    // Only a real assignment is a feed-worthy event; clearing is silent.
    if (patch.assigned_to) {
      events.push({
        action_type: 'plan_action_assigned',
        metadata: {
          plan_action_item_id: item.id,
          assigned_to: patch.assigned_to,
          label: 'Action assignée',
          source: 'action_plan_item',
          source_label: 'Plan d’action',
        },
      })
    }
    if (events.length === 0) return

    try {
      await this.actions.save(
        events.map(event =>
          this.actions.create({
            user_id: userId,
            workspace_id: workspaceId,
            account_id: item.account_id,
            action_type: event.action_type,
            channel: null,
            metadata: event.metadata,
          }),
        ),
      )
    } catch (err) {
      this.logger.warn('recordLifecycle feed write failed', {
        itemId: item.id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  /** #2395.1 — dérive (SANS écrire) une ébauche de ligne par action exprimée du
   *  plan le plus récent. Vide quand aucun plan (ou aucune action) n'existe. */
  private async planStepDrafts(
    userId: string,
    accountId: string,
    workspaceId: string,
  ): Promise<ActionPlanItemEntity[]> {
    // #4158.5 — le plan du compte dans l'ESPACE, plus « mon » plan : un collègue
    // lit le plan réel. Les brouillons restent sans propriétaire ici ; la ligne
    // n'est écrite qu'au premier geste, au nom de celui qui l'accomplit.
    const plan = await this.plans.findOne({
      where: { account_id: accountId, workspace_id: workspaceId },
      order: { created_at: 'DESC' },
    })
    if (!plan) return []

    const phases: unknown[] = Array.isArray(plan.weeks) ? plan.weeks : []
    const toInsert: ActionPlanItemEntity[] = []
    // Les actions que la phase 4 n'a pas su écrire. Comptées pour être DITES —
    // voir le `warn` plus bas : un trou silencieux se lit comme un plan court.
    let unexpressed = 0
    phases.forEach((phase, weekIndex) => {
      for (const [stepIndex, action] of readActions(phase).entries()) {
        const label = readLabel(action)
        // Une action sans geste écrit n'est pas une action. On ne la persiste
        // pas : la ligne serait vide sur le plateau, et « Mes relances » lui
        // inventerait un libellé qui n'est vrai de rien.
        //
        // ⚠ `stepIndex` reste celui du PLAN, jamais un rang recalculé sur les
        // survivantes : le plateau web rend le plan depuis `raw_analysis` et y
        // superpose l'état persisté par la clé (week_index, step_index).
        // Renuméroter décalerait la colonne — une case cochée changerait de ligne.
        if (!label) {
          unexpressed += 1
          continue
        }
        toInsert.push(
          this.items.create({
            user_id: userId,
            account_id: accountId,
            source_plan_id: plan.id,
            label,
            week_index: weekIndex,
            step_index: stepIndex,
            done: false,
            execution_status: 'todo',
            snoozed_until: null,
            assigned_to: null,
            // L'échéance vient de la POSITION de la phase (§30) : aujourd'hui,
            // 7 jours, 30 jours, 60-90 jours. Elle était laissée à `null`, et
            // une action sans date n'est pas une action — c'est une intention.
            // C'est ce qui faisait qu'un plan pourtant généré s'affichait comme
            // « aucune action », et que l'écran demandait au commercial
            // d'écrire lui-même ce que le produit promet de produire.
            //
            // Déterministe, dérivée du rang de la phase et de la date du plan :
            // une échéance demandée au modèle serait invérifiable et changerait
            // d'un run à l'autre sur le même dossier.
            // `due_date` est une DATE calendaire (sans fuseau) : une échéance de plan
            // se compte en jours, et garder une heure ferait apparaître « dans 6 jours
            // et 3 heures » à un commercial qui ne raisonne qu'en jours.
            due_date: dueDateForPhase(weekIndex, plan.created_at ?? new Date())
              .toISOString()
              .slice(0, 10),
            completed_at: null,
            last_reminded_on: null,
            // #2395.4/#2395.9 (correctif de collecte, 24/09/2026) — le plan
            // écrivait déjà le canal et l'attendu de CHAQUE action
            // (`apps/ia/app/models/outputs/plan.py`) ; seul le libellé était
            // lu ici, les deux autres étaient jetés en silence — 0/213
            // actions avec `type`/`expected_outcome` en recette prod le
            // 24/09/2026 (f9f23f887). Posés SANS deviner : `readChannel`
            // garde seulement les quatre canaux déjà canoniques, et un texte
            // absent ou blanc reste `null`, jamais une chaîne vide.
            channel: readChannel(action),
            expected_outcome: readExpectedOutcome(action),
            // #3274.4 — l'action vient du plan de Laura : elle applique la
            // discipline hebdomadaire, ses issues s'accumulent sous cette règle.
            method_rule: METHOD_RULE_PLAN_STEP,
          }),
        )
      }
    })
    // On le DIT plutôt que de le combler : une action que le plan n'a pas su
    // exprimer est un trou du plan, pas une ligne à remplir. Sans cette trace,
    // un plan amputé de deux gestes se lit comme un plan délibérément court.
    if (unexpressed > 0) {
      this.logger.debug('planStepDrafts: actions non exprimées par le plan, non rendues', {
        accountId,
        planId: plan.id,
        unexpressed,
        drafted: toInsert.length,
      })
    }
    return toInsert
  }

  /**
   * #2395.1 — matérialise UNE étape virtuelle (`plan:<compte>:<semaine>:<étape>`)
   * en ligne persistée, au premier geste. Idempotent : une ligne déjà écrite à
   * cette position (geste concurrent) est reprise, jamais dupliquée. `null` si
   * l'identifiant est mal formé ou si le plan ne porte pas cette position.
   */
  private async materializeStep(userId: string, virtualId: string): Promise<ActionPlanItemEntity | null> {
    const position = parseVirtualStepId(virtualId)
    if (!position) return null
    const { accountId, weekIndex, stepIndex } = position

    // #4804 — le plan est celui de l'ÉQUIPE : la ligne déjà écrite par un coéquipier se reprend
    // (jamais de doublon), à condition que le compte soit de l'espace de l'appelant — ou sa ligne
    // ancienne (`workspace_id` NULL), qui reste à son propriétaire. Autre espace : rien.
    const { workspaceId: activeWorkspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const reachable = await this.accounts.findOne({
      where: workspaceGestureWhere<AccountEntity>(activeWorkspaceId, userId, { id: accountId }),
      select: ['id'],
    })
    if (!reachable) throw new NotFoundException('Compte introuvable')
    const existing = await this.items.findOne({
      where: { account_id: accountId, week_index: weekIndex, step_index: stepIndex },
    })
    if (existing) return existing

    // #4158.5 — le plan se lit dans l'espace ; le compte doit en être, sinon rien.
    const workspaceId = await this.assertAccountInActiveWorkspace(userId, accountId)
    const draft = (await this.planStepDrafts(userId, accountId, workspaceId)).find(
      row => row.week_index === weekIndex && row.step_index === stepIndex,
    )
    return draft ?? null
  }
}

/**
 * #2395.1 — l'identifiant d'une étape du plan qu'aucune ligne ne porte encore :
 * dérivé de sa POSITION (compte, semaine, étape), jamais tiré au hasard. Le
 * premier geste sur cette étape (`update`) l'écrit ; le préfixe ne peut pas
 * être un UUID, donc jamais confondu avec une ligne persistée.
 */
const VIRTUAL_STEP_PREFIX = 'plan:'

function virtualStepId(accountId: string, weekIndex: number, stepIndex: number): string {
  return `${VIRTUAL_STEP_PREFIX}${accountId}:${weekIndex}:${stepIndex}`
}

function isVirtualStepId(id: string): boolean {
  return id.startsWith(VIRTUAL_STEP_PREFIX)
}

function parseVirtualStepId(id: string): { accountId: string; weekIndex: number; stepIndex: number } | null {
  const match = /^plan:([^:]+):(\d+):(\d+)$/.exec(id)
  if (!match) return null
  return { accountId: match[1] as string, weekIndex: Number(match[2]), stepIndex: Number(match[3]) }
}

/**
 * Position band reserved for MANUAL items (MCP `create_action`, et depuis
 * #2123.46 le formulaire du plan). Generated plans have a handful of phases
 * (single digits), so week 1000 can never collide with a plan-derived
 * `(week_index, step_index)` — the key the web board uses to overlay persisted
 * state onto the plan it renders.
 *
 * ⚠️ Le nombre vit dans `@bellum/contracts` (GA-26) : le tableau du plan doit
 * le lire pour distinguer une action saisie d'une action générée, et une
 * seconde copie côté web aurait divergé au premier changement.
 */
const MANUAL_WEEK_INDEX = MANUAL_ACTION_WEEK_INDEX

/**
 * #2123.46 — `contacts.id` est un UUID : un identifiant d'une autre forme ne
 * désigne aucun contact, et le passer à la requête la ferait échouer côté
 * base au lieu de rendre « pas de contact lié ».
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Raw projection for {@link ActionPlanItemsService.listPersonalRelances}. */
type PersonalRelanceRow = {
  id: string
  account_id: string
  company_name: string | null
  label: string | null
  due_date: string | null
  cadence_step: 'initial' | 'relance' | 'preuve_sociale' | 'close_loop' | null
  contact_id: string | null
  assigned_to: string | null
}

/** Map a raw relance row to the personal-cockpit DTO. `due_date` is guaranteed
 *  non-null (the query filters `IS NOT NULL`); `overdue` is a plain string
 *  compare of two `YYYY-MM-DD` calendar dates.
 *
 *  Rend `null` quand la ligne ne porte AUCUN texte. Elle écrivait « Relance » —
 *  un mot inventé à la place d'un libellé absent, donc vrai de rien : le
 *  commercial voyait une tâche datée sans savoir ce qu'elle demandait, et ne
 *  pouvait ni la faire ni la contester. La requête les écarte déjà ; ce garde-fou
 *  est la seconde barrière, pour qu'aucun appelant ne réintroduise le mot. */
function toPersonalRelance(row: PersonalRelanceRow, today: string, userId: string): PersonalRelance | null {
  const label = row.label?.trim()
  if (!label) return null
  const dueDate = row.due_date ?? today
  return {
    id: row.id,
    account_id: row.account_id,
    company_name: row.company_name?.trim() || null,
    label,
    due_date: dueDate,
    overdue: dueDate < today,
    cadence_step: row.cadence_step ?? null,
    contact_id: row.contact_id ?? null,
    assigned_to_me: row.assigned_to === userId,
  }
}

/** Europe/Paris calendar date as `YYYY-MM-DD` — matches the `due_date` DATE
 *  column and the relance cron, so the overdue compare is a plain string compare. */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date())
}

/** Europe/Paris calendar date `days` days before today, as `YYYY-MM-DD` (same basis as {@link parisToday}). */
function parisDaysAgo(days: number): string {
  const [year, month, day] = parisToday().split('-').map(Number)
  const date = new Date(Date.UTC(year!, month! - 1, day!))
  date.setUTCDate(date.getUTCDate() - days)
  return date.toISOString().slice(0, 10)
}

/** The `user_actions.action_type` recorded for each lifecycle transition. */
const STATUS_ACTION_TYPE: Record<ActionExecutionStatus, ActionType | null> = {
  done: 'plan_action_completed',
  todo: 'plan_action_uncompleted',
  snoozed: 'plan_action_rescheduled',
  // #2123.37 — préparer n'est pas un événement d'équipe : rien n'est parti.
  // Aucun type de fil ne le dit, et en inventer un élargirait une seconde
  // contrainte (`user_actions_action_type_check`) pour un geste privé.
  prepared: null,
  // #2317.12 — marquer obsolète est le même genre de geste que préparer :
  // aucun envoi, aucun événement d'équipe à journaliser. Le statut lui-même
  // (`execution_status`, lu par `PlanItemFacts`) est la trace — « on archive,
  // on ne supprime pas » ne dit pas « et on l'écrit aussi au fil ».
  obsolete: null,
}

const STATUS_LABEL: Record<ActionExecutionStatus, string> = {
  done: 'Action marquée comme faite',
  todo: 'Action remise à faire',
  snoozed: 'Action reportée',
  prepared: 'Action préparée',
  obsolete: 'Action marquée obsolète',
}

/** Apply an execution status to the row, keeping `done` / `completed_at` /
 *  `snoozed_until` internally consistent so every read path agrees.
 *
 * #2396.1/.2 — `outcome` n'est posé QUE sur une transition VERS `done` : un
 * `done → done` (re-patch d'un autre champ) ou une transition vers un autre
 * état laisse l'issue et le mode déjà enregistrés intacts (on archive, on ne
 * supprime pas). `completion_mode` est toujours `'manual'` ici : c'est le
 * SEUL chemin d'écriture réel aujourd'hui (voir `ACTION_COMPLETION_MODES`). */
function applyStatus(item: ActionPlanItemEntity, status: ActionExecutionStatus, outcome?: ActionPlanOutcome): void {
  const enteringDone = status === 'done' && item.execution_status !== 'done'
  item.execution_status = status
  if (status === 'done') {
    item.done = true
    item.completed_at = new Date()
    item.snoozed_until = null
    if (enteringDone && outcome) {
      item.outcome = outcome
      item.completion_mode = 'manual'
    }
  } else if (status === 'todo' || status === 'prepared') {
    // #2123.37 — préparée reste OUVERTE : ni faite, ni reportée.
    item.done = false
    item.completed_at = null
    item.snoozed_until = null
  } else if (status === 'obsolete') {
    // #2317.12 — MARQUÉE, jamais supprimée. Ni faite, ni reportée, ni active :
    // `snoozed_until` est effacé pour qu'une reprise ne réveille pas une
    // action caduque à une date qui n'a plus de sens.
    item.done = false
    item.completed_at = null
    item.snoozed_until = null
  } else {
    // snoozed: not done; `snoozed_until` is set from the patch by the caller.
    item.done = false
    item.completed_at = null
  }
}

/** JSONB is loose (camelCase or snake_case depending on the write path); read
 *  the phase's actions defensively. */
function readActions(phase: unknown): Record<string, unknown>[] {
  if (!phase || typeof phase !== 'object') return []
  const actions = (phase as Record<string, unknown>)['actions']
  if (!Array.isArray(actions)) return []
  return actions.map(a => (a && typeof a === 'object' ? (a as Record<string, unknown>) : {}))
}

function readLabel(action: Record<string, unknown>): string {
  const value = action['action'] ?? action['text']
  return typeof value === 'string' ? value : ''
}

/**
 * #2395.4 — le canal QUE le plan a écrit pour cette action (`channel` :
 * linkedin | email | phone | event | meeting | content). Gardé SEULEMENT
 * quand il correspond à un des quatre canaux déjà canoniques : `event`/
 * `content` n'ont pas d'équivalent aujourd'hui, et les faire passer pour un
 * des quatre serait un mensonge de canal — `null` reste honnête.
 */
function readChannel(action: Record<string, unknown>): 'phone' | 'email' | 'linkedin' | 'meeting' | null {
  const value = action['channel']
  if (typeof value !== 'string') return null
  const known = planActionChannelSchema.safeParse(value.trim().toLowerCase())
  return known.success ? known.data : null
}

/**
 * #2395.9 — l'ATTENDU en texte libre que le plan a écrit pour cette action
 * (`expectedOutcome`, camelCase — `plan_output.model_dump(by_alias=True)`,
 * `apps/ia/app/routers/phase4_plan.py:1438`). Tel quel : le rangement dans les
 * huit clés canoniques se décide à la LECTURE (`expectedOutcomeOf`,
 * `action.ts`), jamais ici.
 */
function readExpectedOutcome(action: Record<string, unknown>): string | null {
  const value = action['expectedOutcome'] ?? action['expected_outcome']
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** #2715.1 — les trois `action_type` que `actionStatus()` (fiche contact,
 *  `contacts.service.ts`) traite comme un geste de succès : e-mail vérifié,
 *  LinkedIn déclaré, appel renseigné. Même liste, jamais réinventée — leur
 *  NATURE (vérifiée / déclarée), elle, se décide ici via `classifySendStatus`,
 *  jamais dans `actionStatus()`. */
const MESSAGE_SEND_STATUS_ACTION_TYPES = ['message_sent', 'plan_action_message_sent', 'plan_action_call_logged']

type SendStatus = 'email_sent' | 'declared'

/**
 * #2715.1 (corrigé 23/09) — classe une ligne `user_actions` en `email_sent`
 * (VÉRIFIÉ) ou `declared` (un geste déclaratif — jamais confondus,
 * `c73_fait_ne_porte_pas_preuve_denvoi`).
 *
 * `plan_action_call_logged` n'est pas un envoi de MESSAGE (donc absent de
 * `classifyMessageSend`, `message-send-provenance.ts`) : un appel renseigné
 * n'a AUCUN mécanisme de preuve — Bellum n'écoute pas les appels — il est
 * donc TOUJOURS `declared`, comme un `message_sent` historique sans `via`
 * connu (`classifyMessageSend` rend alors `'unattributed'` : dans le doute,
 * jamais vérifié — même règle, jamais réinventée).
 */
function classifySendStatus(send: UserActionEntity): SendStatus {
  if (send.action_type === 'plan_action_call_logged') return 'declared'
  return classifyMessageSend(send) === 'verified' ? 'email_sent' : 'declared'
}

/** La VÉRIFIÉE gagne toujours : une fois `email_sent` posé pour une clé, une
 *  déclaration ultérieure ne le rétrograde jamais. */
function upsertPreferVerified(map: Map<string, SendStatus>, key: string, status: SendStatus): void {
  if (status === 'email_sent' || map.get(key) !== 'email_sent') map.set(key, status)
}

function metadataString(metadata: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = (metadata ?? {})[key]
  return typeof value === 'string' && value.trim() ? value : null
}

function toDto(row: ActionPlanItemEntity, sendStatus: SendStatus | null = null): ActionPlanItem {
  return {
    id: row.id,
    account_id: row.account_id,
    label: row.label ?? '',
    week_index: row.week_index,
    step_index: row.step_index,
    done: row.done,
    due_date: row.due_date ?? null,
    completed_at: row.completed_at ? row.completed_at.toISOString() : null,
    execution_status: row.execution_status ?? 'todo',
    snoozed_until: row.snoozed_until ? row.snoozed_until.toISOString() : null,
    assigned_to: row.assigned_to ?? null,
    // #4158.31 — la note de contexte de la délégation ; `null` si aucune.
    handoff_note: row.handoff_note ?? null,
    handoff_by: row.handoff_by ?? null,
    // #2123.46 — le responsable saisi à la main, à côté de la délégation, jamais
    // à sa place.
    owner_name: row.owner_name ?? null,
    // #2123.46 — le résultat attendu et l'indicateur ; `null` sur les lignes
    // écrites avant la règle.
    expected_outcome: row.expected_outcome ?? null,
    kpi: row.kpi ?? null,
    // #2395.4 — le canal déjà connu ; `null` sur une ligne antérieure à la
    // règle ou sur un item manuel où aucun canal n'a été saisi.
    channel: row.channel ?? null,
    // #2153.57 — le résultat, DÉCLARATIF, distinct de l'attendu juste au-dessus.
    result: row.result ?? null,
    // #2123.1 — l'objet canonique visé. Les trois colonnes voyagent ensemble
    // (le CHECK de paire l'impose en base) : une nature sans identifiant
    // afficherait « contact » sans pouvoir ouvrir personne.
    target: toTarget(row),
    // #2123.21-.31 — la raison, le contact, la dépendance, la provenance, la
    // confiance et le coût. Les deux derniers restent `null` quand ils n'ont
    // pas été mesurés : « non mesuré » n'est ni « faible » ni « gratuit ».
    reason: row.reason ?? null,
    contact_id: row.contact_id ?? null,
    depends_on_item_id: row.depends_on_item_id ?? null,
    provenance: toProvenance(row),
    confidence: row.confidence ?? null,
    cost_credits: row.cost_credits ?? null,
    // #2396.2/.5 — l'issue de la complétion manuelle ; `null` = non complétée,
    // ou ligne antérieure à la règle.
    outcome: row.outcome ?? null,
    // #2396.1 — comment l'action a été complétée ; `null` = pas encore complétée.
    completion_mode: row.completion_mode ?? null,
    // #3287 (#3265.2) — les quatre champs de l'action canonique ; `null` = non posé.
    source_recommendation: row.source_recommendation ?? null,
    method_rule: row.method_rule ?? null,
    external_execution_id: row.external_execution_id ?? null,
    stop_condition: row.stop_condition ?? null,
    // #2715.1 — le statut d'envoi, calculé par l'appelant (batch par contact,
    // voir `withSendStatus`) : jamais deviné ligne par ligne ici.
    send_status: sendStatus,
    created_at: row.created_at ? row.created_at.toISOString() : new Date().toISOString(),
    updated_at: row.updated_at ? row.updated_at.toISOString() : new Date().toISOString(),
  }
}

/**
 * #2123.1 — recompose l'objet canonique depuis ses trois colonnes.
 *
 * Rend `null` dès qu'une des trois manque : une action dont l'objet est à
 * moitié écrit est une tâche flottante déguisée, et la moitié présente
 * inviterait l'écran à l'afficher. Le libellé manquant retombe sur
 * l'identifiant — jamais sur une chaîne inventée.
 */
function toTarget(row: ActionPlanItemEntity): ActionTarget | null {
  const kind = actionTargetKindSchema.safeParse(row.target_kind)
  if (!kind.success) return null
  const id = (row.target_id ?? '').trim()
  if (id.length === 0) return null
  return { kind: kind.data, id, label: (row.target_label ?? '').trim() || id }
}

/**
 * #2123.29 — la provenance d'une action : la source ET sa date.
 *
 * Rend `null` quand la source manque — une date sans source ne dit rien, et
 * une source devinée dirait quelque chose de faux. La date, elle, peut manquer
 * sur une ligne historique sans rendre la source inutile.
 */
function toProvenance(row: ActionPlanItemEntity): ActionProvenance | null {
  const source = evidenceFieldSourceSchema.safeParse(row.source)
  if (!source.success) return null
  return { source: source.data, at: row.source_at ? row.source_at.toISOString() : null }
}

type PlanMailContact = { id: string; full_name: string | null; title: string | null }

/**
 * #4521.1/.2 — le contact visé par une relance du plan et le signal que sa consigne cite. L'identifiant de la
 * ligne gagne ; sinon le responsable du plan est rapproché des contacts DU COMPTE (le même rapprochement que
 * l'onglet Plan, `findContactByName`). Rien de résolu → aucun champ : jamais un nom ni un signal inventés.
 */
function planMailContext(
  item: ActionPlanItem,
  contacts: readonly PlanMailContact[],
): {
  contact: { contact_id?: string; contact_name?: string; contact_role?: string }
  signal: { text: string; at: string | null } | null
} {
  const byId = item.contact_id ? contacts.find(contact => contact.id === item.contact_id) : undefined
  // #4521.1 — les étapes écrites avant la résolution à la création ont `contact_id` NULL et parfois pas de
  // responsable : le nom cité dans la consigne les rattrape À LA LECTURE (sans écrire, sans rien deviner).
  // Intégration vague N : deux lots ont livré ce rapprochement (`findContactNamedIn` puis `byLabel`) ; les deux
  // sont gardés en chaîne, le premier qui tranche gagne, aucun ne devine un destinataire ambigu.
  // #4521.1 — dernier recours : le contact NOMMÉ dans le libellé (unique, nom complet). Les étapes du plan naissent
  // sans `contact_id` ni responsable ; sans ce rapprochement les 96 cartes restaient sans destinataire à l'écran.
  const byLabel = () => {
    const id = unambiguousContact(
      item.label,
      contacts.map(contact => ({ id: contact.id, key: nameKey(contact.full_name ?? '') })),
    )
    return id ? contacts.find(contact => contact.id === id) : undefined
  }
  const resolved =
    byId ??
    (item.owner_name ? findContactByName(contacts, item.owner_name) : null) ??
    findContactNamedIn(contacts, item.label) ??
    byLabel()
  const text = readPlanSignal(item.label) ?? readPlanSignal(item.reason)
  return {
    contact: resolved
      ? {
          contact_id: resolved.id,
          ...(resolved.full_name ? { contact_name: resolved.full_name } : {}),
          ...(resolved.title ? { contact_role: resolved.title } : {}),
        }
      : {},
    signal: text ? { text, at: item.provenance?.at ?? null } : null,
  }
}
