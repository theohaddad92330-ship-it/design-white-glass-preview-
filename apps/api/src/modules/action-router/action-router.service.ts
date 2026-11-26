import { HttpException, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  can,
  dispatchFailureOutcome,
  hasPermission,
  mailDraftHasProof,
  noGoMessageRefusal,
  workspaceRuleRefusalMessage,
  type WriteSource,
} from '@bellum/contracts'
// #2449 — la porte des quatre niveaux d'action, et rien d'autre : la décision
// vit dans `copilot-action-gate.ts`, ce fichier ne fait que l'appeler.
import {
  authorizeAtActionLevel,
  resolveActionLevel,
  simulateAtActionLevel,
  simulationValidates,
  type ActionLevelRefusal,
  type ActionLevelSimulationReport,
} from '../action-os/copilot-action-gate'
import type {
  ActionDispatchClaim,
  ActionDispatchResult,
  ActionDispatchStatus,
  ActionIntent,
  CancelReminderIntent,
  CloseCrmTaskIntent,
  CopilotActionLevel,
  CreateCalendarEventIntent,
  CreateCrmNoteIntent,
  CreateCrmTaskIntent,
  CreateMailDraftIntent,
  CrmTaskProvider,
  DeleteDraftIntent,
  DispatchBulkResponse,
  EnrichContactIntent,
  GenerateMessageIntent,
  GraduatedActionMode,
  NotifyUserIntent,
  PinMemoryFactIntent,
  RemoveCrmTaskIntent,
  RestoreStatusIntent,
  ScheduleReminderIntent,
  SendEmailIntent,
  SnoozeIntent,
  StopSequenceIntent,
  UpdateOpportunityIntent,
  UpdateRoutineIntent,
  UpdateSettingIntent,
  WorkspaceRole,
} from '@bellum/contracts'
import { isFailure, isSuccess } from '@bellum/utils'
import { AccountEntity } from '../../database/entities/account.entity'
import { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { OutreachSequenceStepEntity } from '../../database/entities/outreach-sequence-step.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { WRITABLE_SETTINGS_SCREENS } from '../copilot-bridge/laura-settings-catalog'
import { ContactsService, type ContactFailure } from '../contacts/contacts.service'
import { contactToCrmInput, splitName } from '../crm/contact-crm-mapper'
import { CrmService } from '../crm/crm.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import {
  ACTION_ROUTER_PORTS,
  type ActionRouterPorts,
  type CrmContactInput,
  type SettingsField,
} from './card-effect-ports'
import { INTENT_PERMISSION, INTENT_WORKSPACE_GESTURE } from './intent-permission'

/** La raison d'un refus de droit — la même phrase que `CopilotCardService`. */
const ROLE_FORBIDS_REASON = 'Votre rôle ne permet pas cette action.'

/**
 * #2449 — ce que la porte des niveaux d'action RÉPOND, en clair.
 *
 * Un refus nomme la raison : « un score n'est jamais nu », et un geste qui ne
 * part pas sans qu'on dise pourquoi est indistinguable d'une panne. Les clés
 * `actionLevel.*` de `actions.json` (FR et EN) portent le même propos côté
 * écran ; ici on rend le texte que l'API a toujours rendu dans `reason`.
 */
const ACTION_LEVEL_REFUSAL_REASONS: Readonly<Record<ActionLevelRefusal, string>> = {
  level_writes_nothing: 'Laura est réglée pour répondre seulement : elle n’écrit rien.',
  level_prepares_only: 'Laura est réglée pour préparer : elle ne crée rien hors de BellumAI.',
  level_prepares_free: 'Laura est réglée pour préparer : une préparation ne consomme rien.',
  level_prepares_unengaged: 'Laura est réglée pour préparer : une préparation n’engage pas l’espace.',
  never_reaches_a_person: 'Laura prépare, elle n’adresse jamais rien à une personne — c’est vous qui envoyez.',
  automation_not_ready: 'L’automatisation n’est pas prête : toutes ses conditions ne sont pas réunies.',
}

/** #2449.18-.24 — il manque le GO, pas le droit. Rien n'est parti, rien n'a raté. */
// #4464 — crédits implicites : la raison ne parle ni de crédit ni de coût.
const ACTION_LEVEL_NEEDS_GO_REASON = 'Ce geste sort de BellumAI ou engage un usage : il attend votre validation.'

/**
 * Ce que le routeur a besoin de savoir d'un calendrier, réduit au strict
 * minimum : est-il connecté, et sait-il créer un événement ?
 *
 * Les modules Google et Microsoft sont AUTONOMES (règle CLAUDE n°7 : les retirer
 * ne doit rien casser). Les injecter en dur ferait du routeur un module qui ne
 * démarre plus sans eux. On dépend donc de cette forme minimale, et le module
 * fournit ce qu'il a — éventuellement rien.
 */
export type CalendarBackend = {
  /** Nom de la capacité pour les journaux — jamais rendu au commercial. */
  readonly key: string
  isConnected(userId: string): Promise<boolean>
  createEvent(
    userId: string,
    input: { title: string; startsAt: string; endsAt: string; attendees: string[]; note?: string; link?: string },
  ): Promise<{ id: string }>
}

/** Jeton d'injection : la liste (éventuellement vide) des calendriers branchés. */
export const CALENDAR_BACKENDS = Symbol('CALENDAR_BACKENDS')

/** Idem pour les notifications in-app — le module notifications reste autonome. */
export type NotifierBackend = {
  notify(userId: string, input: { title: string; body?: string; link?: string | null }): Promise<{ id: string }>
}
export const NOTIFIER_BACKEND = Symbol('NOTIFIER_BACKEND')

/**
 * The authenticated principal driving a dispatch (from the JWT).
 *
 * D9 (#1931 L2) — `origin` is WHO decided the write: `user` = someone clicked
 * (the click IS the decision, doctrine); `system` = a routine or a trigger ran
 * it with nobody looking. It reaches every CRM write door, which holds a
 * `system` write as a visible, frozen, 3-day request. Absent = `user` — the
 * exact behaviour every existing caller already had (HubSpot's gate defaulted
 * to `user` too), so no caller changes meaning by omission.
 */
export type ActionPrincipal = {
  userId: string
  email: string
  origin?: 'user' | 'system'
  /**
   * #2449 — LE MANDAT : jusqu'où le copilote a été autorisé à aller pour ce
   * travail. ⚠️ Ce n'est pas `origin` (QUI a décidé) ni le barème
   * d'approbation (ce que le GESTE réclame) : c'est la troisième question, et
   * c'est elle qui AUTORISE ou REFUSE l'écriture.
   *
   * ABSENT = aucun mandat déclaré, donc la porte ne se prononce pas et le
   * chemin est byte-identique à ce qu'il était — le motif exact retenu pour
   * `origin`. Un mandat qu'on n'a pas donné ne se devine pas, et surtout il ne
   * se devine pas en RELEVANT ce qui était permis.
   */
  actionLevel?: CopilotActionLevel
  /**
   * #2400.3 — LE MANDAT, dans le vocabulaire des CINQ MODES du rapport
   * (observe / suggest / prepare / execute-after-approval / auto-execute),
   * pour un appelant qui ne connaît pas les quatre niveaux de #2449.
   * `resolveActionLevel` (`copilot-action-gate.ts`) le compose avec
   * `actionLevel` : le PLUS PRUDENT des deux gagne, jamais un élargissement.
   * Absent, comme `actionLevel` absent : la porte ne se prononce pas.
   */
  graduatedMode?: GraduatedActionMode
}

/** What a single dispatch may carry beyond the intent — never taken from a request body. */
type DispatchOptions = {
  /**
   * #1931 L2 (I3) — the credit reservation a QUEUED enrichment's worker must
   * settle when it observes the debit. Set only by `WorkflowRunnerService`.
   */
  reservationReference?: string
  /**
   * #2855 — QUI/QUOI a composé le geste (un compte rendu, une routine), quand
   * l'appelant le sait. Distinct de `origin` : une carte proposée par Laura
   * qu'on VALIDE d'un clic reste `origin: 'user'` (le clic EST la décision),
   * mais sa provenance reste la routine qui l'a composée. Absent = `null`,
   * jamais deviné.
   */
  source?: WriteSource
}

/** Resolved per-request context — the workspace is resolved once and reused
 *  across every intent in a bulk run. */
type DispatchCtx = {
  userId: string
  email: string
  workspaceId: string
  /** D1 — le rôle dans l'espace actif : le droit propre à l'effet se vérifie à la porte. */
  role: WorkspaceRole
  origin: 'user' | 'system'
  /** #2449 — le mandat déclaré par l'appelant. Absent = la porte se tait. */
  actionLevel?: CopilotActionLevel
  /** #2449.24 — les cibles du LOT en cours : deux intents ne sont pas un geste
   *  unitaire, et le routeur est le seul à le savoir. */
  targetCount: number
  reservationReference?: string
  /** #2855 — voir `DispatchOptions.source`. */
  source?: WriteSource
}

/** What a reminder hangs on, once ownership has been re-resolved server-side. */
type ReminderTarget = { accountId: string | null; contactId: string | null; label: string }

/** Durée d'un rappel posé sur l'agenda : assez pour le voir, trop court pour
 *  bloquer un créneau. Un pense-bête n'est pas une réunion. */
const REMINDER_DURATION_MS = 15 * 60_000

/**
 * I4 — `creditsSpent` d'un pas est un entier : il ne sait pas dire « non mesuré ».
 * Quand une recherche terminée n'a pas rapporté son débit (charge utile d'avant
 * L2), le résultat porte cette raison et AUCUN `creditsDebited` : la carte relit
 * la raison et affiche `null`, jamais 0.
 */
export const DEBIT_NOT_REPORTED = 'Débit non rapporté par la recherche — non mesuré.'

/**
 * #1943.10 — un enrichissement « fait » à 0 crédit débité a réellement
 * tourné, mais n'a RIEN trouvé : `cardResultOf` (copilot-card.service.ts) ne
 * lit `outcomeText` que via `step.reason` avant de retomber sur « Action
 * exécutée. » — sans cette raison, une fiche non complétée se lisait comme
 * une fiche complétée. Même texte que `PendingActions.tsx` (`enrichNotFound`,
 * fr/chat.json:551) : deux chemins qui décriraient le même résultat
 * autrement divergeraient.
 */
export const ENRICHMENT_FOUND_NOTHING = 'Aucune coordonnée trouvée — rien n’a été consommé.'

/**
 * I6 — une salle de démonstration n'écrit dans AUCUN outil externe. Le lien est
 * public ; un CRM ou un agenda réel branché par erreur recevrait des fiches et
 * des invitations de visiteurs inconnus.
 */
const DEMO_NO_EXTERNAL_WRITE = "Espace de démonstration : rien n'est écrit dans vos outils."

/** D9 — la porte d'écriture a retenu la demande : elle attend quelqu'un, elle n'a pas échoué. */
const CRM_WRITE_HELD =
  'Écriture retenue : elle attend une validation (demande visible, prévisualisation figée, 3 jours).'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * #1943.3 — « Scope indisponible » se NOMME, il ne se noie pas dans un repli
 * générique. `HttpException.getResponse()` rend le corps posé par
 * `connectorFailure`/`scopeMissing` (`../../common/connector-error.ts`) tel
 * quel — `code: 'scope_missing'` et un `message` qui nomme déjà la capacité et
 * le geste de reprise (« Reconnecte cet outil… »), jamais l'éditeur. `null`
 * pour toute autre panne : un jeton expiré ou un réseau coupé restent couverts
 * par le repli existant de l'appelant, qui, LUI, est correct dans ces cas-là.
 */
function scopeMissingReasonOf(error: unknown): string | null {
  if (!(error instanceof HttpException)) return null
  const body = error.getResponse()
  if (typeof body !== 'object' || body === null) return null
  const { code, message } = body as { code?: unknown; message?: unknown }
  return code === 'scope_missing' && typeof message === 'string' ? message : null
}

/**
 * Map a send-email failure code onto a dispatch status. `send_failed` /
 * `update_failed` are genuine errors → `failed`; every other precondition
 * (no email, no draft, already sent, opted out, not owned, no credit) is a soft
 * skip — the send simply didn't apply, exactly how the bulk-send path (#394)
 * buckets them into `skipped`.
 */
function sendFailureStatus(code: ContactFailure['code']): ActionDispatchStatus {
  return code === 'send_failed' || code === 'update_failed' ? 'failed' : 'skipped'
}

/**
 * #1959.9 — le nom LISIBLE de l'auteur d'une tentative, ou `null`.
 *
 * L'ordre est celui du produit : le nom complet, puis le prénom seul, puis
 * l'e-mail (une personne se reconnaît à son adresse professionnelle). Un profil
 * absent — dispatch système, compte supprimé — reste `null` : « on ne sait pas
 * qui » ne s'écrit jamais « quelqu'un ».
 */
function displayNameOf(row: {
  first_name: string | null
  last_name: string | null
  email: string | null
}): string | null {
  const full = [row.first_name, row.last_name]
    .map(part => part?.trim() ?? '')
    .filter(Boolean)
    .join(' ')
  return full || row.email?.trim() || null
}

/**
 * #1959.10 — une date en ISO, ou `null`. Jamais `new Date()` en repli : une
 * heure inventée ferait lire une exécution terminée qui ne l'est pas.
 */
function isoOrNull(value: Date | string | null): string | null {
  if (value === null) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** An enrichment refusal we can know without calling anyone is a precondition, not an error. */
function enrichmentRefusalStatus(code: string): ActionDispatchStatus {
  return code === 'insufficient_credits' || code === 'enrichment_unchanged' || code === 'not_found'
    ? 'skipped'
    : 'failed'
}

/**
 * ACTION ROUTER (§3, §8) — turns a typed {@link ActionIntent} into an executed
 * action by DISPATCHING it to the capability already on `main`:
 *  - `send_email`       → {@link ContactsService.sendEmail} (draft send, #394);
 *  - `create_crm_task`  → CRM export/upsert, routed EXPLICITLY per provider (D9);
 *  - `enrich_contact`   → {@link ContactsService.enrichContact} (1 crédit), or the
 *                         background enrichment queue when `mode: 'queued'` (D4);
 *  - `schedule_reminder`→ the connected calendar, else an internal journal row;
 *  - `snooze`           → updates a journaled action's state;
 *  - `create_calendar_event` → a real event (duration, attendees) on that calendar;
 *  - `create_crm_note`  → a note on an EXISTING CRM record (never an upsert);
 *  - `notify_user`      → an in-app notification (how a workflow reports back);
 *  - #1931 L2, through narrow ports (`card-effect-ports.ts`, GA-07 at its ceiling):
 *    `generate_message` (a draft's TEXT, nothing sent), `create_mail_draft` (a
 *    draft in the mailbox, NO send path exists), `update_routine`,
 *    `update_setting` (against the real settings catalog), `pin_memory_fact`.
 *
 * It never reimplements a capability and never fabricates an action: a tool that
 * isn't connected yields an explicit `skipped` (with a reason), never a silent
 * no-op. Ownership is enforced by the underlying services (strict `user_id`),
 * so a caller can only ever act on their own contacts — never a teammate's.
 */
@Injectable()
export class ActionRouterService {
  private readonly logger = new Logger(ActionRouterService.name)

  constructor(
    private readonly contacts: ContactsService,
    private readonly crm: CrmService,
    private readonly workspaceContext: WorkspaceContextService,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @Inject(CALENDAR_BACKENDS)
    private readonly calendars: CalendarBackend[],
    @Inject(NOTIFIER_BACKEND)
    private readonly notifier: NotifierBackend | null,
    // #1931 L2 — added LAST (a parameter inserted in the middle would shift every
    // spec that builds this class positionally). Absent = each capability behind
    // it answers `skipped` with its reason, never a silent no-op.
    @Optional()
    @Inject(ACTION_ROUTER_PORTS)
    private readonly ports?: ActionRouterPorts,
    // Épopée #2771 — `stop_sequence` (#2277.37). Dépôts directs, PAS `OutreachModule` :
    // ce module importe DÉJÀ `ActionRouterModule` (`outreach.module.ts`), l'inverse
    // créerait un cycle. Même geste que `accounts`/`userActions` ci-dessus — une
    // lecture/écriture directe sur deux entités plutôt qu'un import qui referme la
    // boucle (même raison que `isUniqueViolation`, dupliqué en bas de fichier).
    // Ajoutés en dernier, comme `ports`, pour la même raison de position.
    @Optional()
    @InjectRepository(OutreachSequenceEntity)
    private readonly outreachSequences?: Repository<OutreachSequenceEntity>,
    @Optional()
    @InjectRepository(OutreachSequenceStepEntity)
    private readonly outreachSequenceSteps?: Repository<OutreachSequenceStepEntity>,
  ) {}

  /** Execute one intent. Resolves the caller's workspace, then dispatches. */
  async dispatch(
    intent: ActionIntent,
    principal: ActionPrincipal,
    options: DispatchOptions = {},
  ): Promise<ActionDispatchResult> {
    const ctx = await this.resolveCtx(principal, options)
    return this.dispatchIdempotent(intent, ctx)
  }

  /**
   * Execute a list of intents best-effort: one item's failure never blocks the
   * rest (each is wrapped), and the outcomes are aggregated with a per-status
   * summary. The workspace is resolved once for the whole batch.
   */
  async dispatchBulk(intents: ActionIntent[], principal: ActionPrincipal): Promise<DispatchBulkResponse> {
    // #2449.24 — le LOT connaît son nombre de cibles ; un geste unitaire non.
    const ctx = await this.resolveCtx(principal, {}, intents.length)
    const results: ActionDispatchResult[] = []
    for (const intent of intents) {
      // dispatchIdempotent is total (never throws) — a per-item error becomes a
      // `failed` result, so the loop always completes and aggregates every intent.
      results.push(await this.dispatchIdempotent(intent, ctx))
    }
    return { results, summary: summarise(results) }
  }

  /**
   * #2400.5 / #2449.29 — LE DRY RUN : ce que le niveau demandé ferait de ces
   * gestes RÉELS, sans en exécuter un seul.
   *
   * ⚠️ Aucun second chemin de code à maintenir en phase avec le vrai : la porte
   * (`authorizeAtActionLevel`) est PURE, donc simuler, c'est l'appeler. Une
   * simulation qui emprunterait un autre chemin finirait par répondre autre
   * chose que la production — exactement l'écart qu'un rapport de simulation est
   * censé fermer.
   *
   * Rien n'est écrit, rien n'est réclamé, aucun service en aval n'est touché :
   * on ne passe jamais par `dispatchIdempotent`. C'est aussi pourquoi cette
   * méthode n'a pas besoin du droit propre à l'effet — elle n'en produit aucun,
   * et le rôle est déjà résolu pour dire ce que la porte répondrait.
   */
  async simulateBulk(intents: ActionIntent[], principal: ActionPrincipal): Promise<ActionLevelSimulationReport> {
    const ctx = await this.resolveCtx(principal, {}, intents.length)
    // Un niveau non déclaré ne peut pas se simuler : la porte ne se prononce pas
    // sans mandat, et inventer `execute` ferait passer pour un verdict ce qui
    // n'est qu'un défaut. On simule le plus inerte — il ne promet rien.
    const level = ctx.actionLevel ?? 'respond_only'
    const simulation = simulateAtActionLevel({
      level,
      gestures: intents.map(intent => ({ intentType: intent.type, targetCount: ctx.targetCount })),
      backedByUserGesture: ctx.origin === 'user',
    })
    return { ...simulation, validated: simulationValidates(simulation) }
  }

  /**
   * D4 (#1931 L2) — what the background queue KNOWS about an intent dispatched
   * in `queued` mode. Never a re-dispatch: nothing is sent, enqueued or debited
   * here. `queued` = still running; a lost job is `unknown` (verifying it is a
   * human gesture), never « nothing found ».
   */
  async observe(intent: ActionIntent, principal: ActionPrincipal): Promise<ActionDispatchResult> {
    if (intent.type !== 'enrich_contact' || intent.mode !== 'queued') {
      return { type: intent.type, status: 'unknown', reason: 'Cette action ne se suit pas en tâche de fond.' }
    }
    const jobs = this.ports?.enrichmentJobs
    if (!jobs) return { type: 'enrich_contact', status: 'unknown', reason: 'Suivi de la recherche indisponible.' }
    const seen = await jobs.observe(intent.contactId, principal.userId)
    switch (seen.state) {
      case 'queued':
      case 'running':
        return { type: 'enrich_contact', status: 'queued', externalRef: seen.jobId }
      case 'done':
        if (seen.creditsDebited === null) {
          return { type: 'enrich_contact', status: 'done', externalRef: seen.jobId, reason: DEBIT_NOT_REPORTED }
        }
        return {
          type: 'enrich_contact',
          status: 'done',
          externalRef: seen.jobId,
          creditsDebited: seen.creditsDebited,
          reason:
            seen.creditsDebited > 0
              ? 'Coordonnées trouvées et ajoutées à la fiche.'
              : 'Aucune nouvelle coordonnée trouvée — rien n’a été consommé.',
        }
      case 'failed':
        return {
          type: 'enrich_contact',
          status: enrichmentRefusalStatus(seen.code),
          reason: seen.message,
          creditsDebited: 0,
        }
      case 'unknown':
        return {
          type: 'enrich_contact',
          status: 'unknown',
          externalRef: seen.jobId,
          reason:
            'Le résultat de la recherche est introuvable (expiré ou perdu) : vérifiez la fiche avant de relancer.',
        }
      default: {
        const exhaustive: never = seen
        throw new Error(`observe: unhandled enrichment state ${JSON.stringify(exhaustive)}`)
      }
    }
  }

  private async resolveCtx(
    principal: ActionPrincipal,
    options: DispatchOptions,
    targetCount = 1,
  ): Promise<DispatchCtx> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(principal.userId)
    // #2400.3 — le mandat déclaré, composé : `actionLevel` (#2449) et
    // `graduatedMode` (les cinq modes du rapport) peuvent tous deux être
    // absents (chemin byte-identique), un seul déclaré (celui-là compte), ou
    // les deux (le PLUS PRUDENT gagne — `resolveActionLevel`).
    const actionLevel = resolveActionLevel({ level: principal.actionLevel, mode: principal.graduatedMode })
    return {
      userId: principal.userId,
      email: principal.email,
      workspaceId,
      role,
      origin: principal.origin ?? 'user',
      targetCount,
      ...(actionLevel ? { actionLevel } : {}),
      ...(options.reservationReference ? { reservationReference: options.reservationReference } : {}),
      ...(options.source ? { source: options.source } : {}),
    }
  }

  /**
   * #2449 — LA PORTE DES QUATRE NIVEAUX D'ACTION, sur le chemin de tout geste.
   *
   * Elle ne DÉCIDE rien elle-même : elle demande à `authorizeAtActionLevel`
   * (`action-os/copilot-action-gate.ts`), qui compose le mandat avec le barème
   * d'approbation déjà en place (`approval-policy.ts`) et avec les axes du
   * contrat (`intentSite`, `intentReversibility`). Un second mécanisme de porte
   * serait refusé par GA-26, et à juste titre : deux portes divergent.
   *
   * ⚠️ Sans `actionLevel`, on rend `null` AVANT tout calcul : aucun appelant
   * existant ne change de comportement par omission.
   *
   * `skipped` pour un refus (rien n'est parti, il n'y a rien à réessayer),
   * `awaiting_approval` quand il manque seulement un GO — c'est le statut que
   * la porte d'écriture CRM utilise déjà pour la même situation (`CRM_WRITE_HELD`).
   */
  private actionLevelRefusal(intent: ActionIntent, ctx: DispatchCtx): ActionDispatchResult | null {
    if (!ctx.actionLevel) return null
    const verdict = authorizeAtActionLevel({
      level: ctx.actionLevel,
      // Ni `risk` ni `estimatedCredits` ne sont déclarés sur un intent : on ne
      // les INVENTE pas. La porte lit alors la réversibilité et le site du
      // TYPE, qui sont des faits, pas des déclarations.
      gesture: { intentType: intent.type, targetCount: ctx.targetCount },
      // Doctrine : « auto-approuvé sur geste utilisateur, sinon prévisualisation
      // figée ». `origin: 'user'` EST le geste.
      backedByUserGesture: ctx.origin === 'user',
    })
    if (verdict.verdict === 'allowed') return null
    if (verdict.verdict === 'needs_go') {
      return { type: intent.type, status: 'awaiting_approval', reason: ACTION_LEVEL_NEEDS_GO_REASON }
    }
    return { type: intent.type, status: 'skipped', reason: ACTION_LEVEL_REFUSAL_REASONS[verdict.because] }
  }

  /**
   * D1 (revue de sécurité du lot Action OS, 13/09/2026) — le droit PROPRE à
   * l'effet, vérifié à la seule porte par laquelle passent la route
   * `actions/dispatch`, les cartes de Laura, les workflows et leurs approbations.
   *
   * Même règle que `WorkspacePermissionGuard` (`can` : le rôle, puis les droits
   * accordés en propre) ; les droits propres ne sont lus que si le rôle ne suffit
   * pas. `skipped`, pas `failed` : rien n'est parti, il n'y a rien à réessayer.
   */
  private async permissionRefusal(intent: ActionIntent, ctx: DispatchCtx): Promise<ActionDispatchResult | null> {
    const permission = INTENT_PERMISSION[intent.type]
    if (permission && !hasPermission(ctx.role, permission)) {
      const extra = await this.workspaceContext.extraPermissionsOf(ctx.workspaceId, ctx.userId)
      if (!can(ctx.role, extra, permission))
        return { type: intent.type, status: 'skipped', reason: ROLE_FORBIDS_REASON }
    }
    // #2081.14 — LA RÈGLE D'ESPACE PRIME, ici comme au guard HTTP : pousser la
    // fiche d'un contact dans le CRM est une SORTIE de données, et « l'export
    // est réservé aux administrateurs » ne se contourne pas par une carte de
    // Laura. Le refus nomme la règle. Une note versée au CRM n'est pas une
    // sortie (décision Louis 19/09/2026) : lue seulement pour un geste gouverné.
    const gesture = INTENT_WORKSPACE_GESTURE[intent.type]
    if (!gesture) return null
    const rule = await this.workspaceContext.workspaceRuleRefusing(ctx.workspaceId, ctx.role, gesture)
    return rule ? { type: intent.type, status: 'skipped', reason: workspaceRuleRefusalMessage(rule) } : null
  }

  /**
   * DEUX CLICS, UN SEUL EFFET (D520) — point d'entrée unique de `dispatch()` /
   * `dispatchBulk()`, en amont de `dispatchOne`. Porte la déduplication du
   * ROUTEUR lui-même, indépendamment de tout verrou propre à la capacité
   * sous-jacente : `send_email` a le sien en aval (`already_sent`,
   * `ContactsService.deliverDraft`) et `enrich_contact` un cooldown
   * (`enrichmentCooldown`) — tous les AUTRES intents n'en avaient aucun, et
   * c'est ce que ce point d'entrée corrige pour les huit à la fois.
   *
   * Sans `idempotencyKey` : chemin BYTE-IDENTIQUE à avant — `dispatchOne` est
   * appelé directement, aucune ligne écrite. Le runner d'Action OS en fournit
   * une depuis L2 : `<runId>:<pas>:<tentative>`.
   *
   * Avec une clé : une ligne de RÉCLAMATION est insérée AVANT tout effet, sous
   * la contrainte d'unicité `(workspace_id, idempotency_key)` posée par la
   * migration `ActionDispatchIdempotency` — même motif que
   * `credit_reservations_live_reference_idx` (action-os) et
   * `sprint_switches_dedupe_idx` (sprints) : suivi, pas réinventé. Un `SELECT`
   * applicatif avant écriture ne suffirait pas : deux requêtes concurrentes le
   * liraient toutes deux vide avant que l'une n'écrive — c'est la base, pas
   * l'application, qui tranche.
   *
   * ⚠️ La clé n'est JAMAIS dérivée du contenu de l'intent (voir la doc de
   * {@link actionDispatchIdempotencyKeySchema}, D520) : elle identifie la
   * TENTATIVE, pas l'intention. Deux clés différentes pour le même compte et
   * le même type d'intent produisent bien DEUX effets — ce n'est pas un rejeu,
   * ce sont deux gestes réels, séparés dans le temps.
   */
  private async dispatchIdempotent(intent: ActionIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    // D1 — AVANT toute réclamation de clé : un geste refusé n'a rien tenté.
    const refused = await this.permissionRefusal(intent, ctx)
    if (refused) return refused
    // #2449 — le MANDAT, juste après le DROIT : avoir le droit de faire un
    // geste ne dit pas qu'on a été autorisé à le faire pour ce travail-là.
    const beyondMandate = this.actionLevelRefusal(intent, ctx)
    if (beyondMandate) return beyondMandate
    const idempotencyKey = intent.idempotencyKey?.trim()
    if (!idempotencyKey) return this.dispatchOne(intent, ctx)

    try {
      // #1959 — QUI a tenté ce dispatch : `ctx.userId` est déjà résolu pour
      // TOUT appelant (chat, `outreach.service.ts`, un run Action OS) puisque
      // `resolveCtx` l'exige d'`ActionPrincipal` en amont — aucun signature à
      // changer, seulement la colonne à renseigner.
      await this.accounts.query(
        `INSERT INTO action_dispatch_attempts (workspace_id, idempotency_key, intent_type, user_id) VALUES ($1, $2, $3, $4)`,
        [ctx.workspaceId, idempotencyKey, intent.type, ctx.userId],
      )
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      // Une autre tentative a déjà réclamé cette clé — on ne réexécute RIEN.
      // C'est exactement le point : deux clics, un seul effet.
      return this.readClaimedAttempt(ctx.workspaceId, idempotencyKey, intent.type, ctx.userId)
    }

    const result = await this.dispatchOne(intent, ctx)
    await this.recordAttemptOutcome(ctx.workspaceId, idempotencyKey, result)
    return result
  }

  /**
   * Relit la tentative déjà réclamée plutôt que d'en produire une nouvelle.
   *
   * Deux cas. L'effet est déjà TERMINÉ (`status` posé) : on rend exactement ce
   * résultat, `unknown` compris — c'est ce qui fait qu'un timeout rejoué avec
   * la MÊME clé ne se retente jamais tout seul (doctrine « un timeout n'est
   * pas un échec » : `unknown` ARRÊTE la reprise, la clé le fait tenir sur un
   * second appel). L'effet est encore EN VOL (`status` toujours NULL — vraie
   * concurrence, l'autre tentative n'a pas fini) : on le DIT plutôt que
   * d'inventer un résultat qu'on n'a pas observé — `skipped`, jamais une
   * erreur, jamais un succès personne n'a vu.
   *
   * #1959.9 / #1959.10 — ET LA TENTATIVE DIT QUI ET QUAND.
   *
   * Les deux colonnes étaient déjà là — `user_id` (migration
   * `ActionDispatchAttemptAuthor`) et `completed_at` — mais ce SELECT n'en
   * lisait aucune : le message rendu ne nommait personne et ne datait rien.
   * Le `LEFT JOIN profiles` est la seule manière de nommer l'auteur sans
   * charger tout l'espace (`listMembers`) sur un chemin de déduplication.
   *
   * ⚠️ Rien n'est deviné : un auteur sans profil (compte supprimé) et un
   * dispatch système sortent tous deux en `actor: null` — c'est VRAI, et
   * l'écran nomme alors la capacité, jamais un inconnu. Même refus sur
   * l'heure : `completed_at` NULL reste `null`, jamais l'instant de la
   * réclamation, qui ferait lire une exécution terminée qui ne l'est pas.
   */
  private async readClaimedAttempt(
    workspaceId: string,
    idempotencyKey: string,
    type: ActionDispatchResult['type'],
    readerUserId: string,
  ): Promise<ActionDispatchResult> {
    const rows = (await this.accounts.query(
      `SELECT a.status, a.reason, a.external_ref, a.user_id, a.completed_at,
              p.first_name, p.last_name, p.email
         FROM action_dispatch_attempts a
         LEFT JOIN profiles p ON p.user_id = a.user_id
        WHERE a.workspace_id = $1 AND a.idempotency_key = $2`,
      [workspaceId, idempotencyKey],
    )) as {
      status: ActionDispatchStatus | null
      reason: string | null
      external_ref: string | null
      user_id: string | null
      completed_at: Date | string | null
      first_name: string | null
      last_name: string | null
      email: string | null
    }[]
    const row = rows[0]
    if (!row) {
      // La ligne a disparu entre la violation d'unicité et cette relecture
      // (purge concurrente) : on ne rejoue rien pour autant.
      return { type, status: 'skipped', reason: 'Une action identique (même clé) est déjà en cours de traitement.' }
    }
    const claim: ActionDispatchClaim = {
      actor: displayNameOf(row),
      completedAt: isoOrNull(row.completed_at),
      // #1959.9 — « vous l'avez déjà lancée » ne se dit qu'à celui qui l'a
      // vraiment lancée. Un `user_id` NULL (système) n'est le geste de personne.
      self: row.user_id !== null && row.user_id === readerUserId,
    }
    if (!row.status) {
      return {
        type,
        status: 'skipped',
        reason: 'Une action identique (même clé) est déjà en cours de traitement.',
        claim,
      }
    }
    return {
      type,
      status: row.status,
      ...(row.reason ? { reason: row.reason } : {}),
      ...(row.external_ref ? { externalRef: row.external_ref } : {}),
      claim,
    }
  }

  /**
   * Complète la réclamation avec le résultat réel, une fois connu.
   *
   * Best-effort, comme {@link journal} : un échec d'écriture ne doit pas faire
   * mentir un dispatch qui a réussi. La fenêtre où un doublon resterait
   * possible (cet appel échoue silencieusement) n'est jamais SILENCIEUSE pour
   * autant : l'erreur est logguée, jamais avalée.
   */
  private async recordAttemptOutcome(
    workspaceId: string,
    idempotencyKey: string,
    result: ActionDispatchResult,
  ): Promise<void> {
    try {
      await this.accounts.query(
        `UPDATE action_dispatch_attempts
            SET status = $3, reason = $4, external_ref = $5, completed_at = now()
          WHERE workspace_id = $1 AND idempotency_key = $2`,
        [workspaceId, idempotencyKey, result.status, result.reason ?? null, result.externalRef ?? null],
      )
    } catch (error) {
      this.logger.error('action-router idempotency outcome write failed', {
        error,
        tags: { 'action.intent': result.type },
      })
    }
  }

  /** Route one intent to its handler. Total: any thrown error is caught and
   *  surfaced as a `failed` result so bulk aggregation is never interrupted. */
  private async dispatchOne(intent: ActionIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    try {
      switch (intent.type) {
        case 'send_email':
          return await this.dispatchSendEmail(intent, ctx)
        case 'create_crm_task':
          return await this.dispatchCrmTask(intent, ctx)
        case 'enrich_contact':
          return await this.dispatchEnrich(intent, ctx)
        case 'schedule_reminder':
          return await this.dispatchReminder(intent, ctx)
        case 'snooze':
          return await this.dispatchSnooze(intent, ctx)
        case 'create_calendar_event':
          return await this.dispatchCalendarEvent(intent, ctx)
        case 'create_crm_note':
          return await this.dispatchCrmNote(intent, ctx)
        case 'notify_user':
          return await this.dispatchNotify(intent, ctx)
        // #1931 L2 — les cinq intents des cartes de Laura.
        case 'generate_message':
          return await this.dispatchGenerateMessage(intent, ctx)
        case 'create_mail_draft':
          return await this.dispatchMailDraft(intent, ctx)
        case 'update_routine':
          return await this.dispatchUpdateRoutine(intent, ctx)
        case 'update_setting':
          return await this.dispatchUpdateSetting(intent, ctx)
        case 'pin_memory_fact':
          return await this.dispatchPinMemoryFact(intent, ctx)
        // Épopée #2771 (#2277.33 → .37) — les cinq rollbacks.
        case 'cancel_reminder':
          return await this.dispatchCancelReminder(intent, ctx)
        case 'restore_status':
          return await this.dispatchRestoreStatus(intent, ctx)
        case 'remove_crm_task':
          return await this.dispatchRemoveCrmTask(intent, ctx)
        // #2319.114 (épopée #2985)
        case 'close_crm_task':
          return await this.dispatchCloseCrmTask(intent, ctx)
        case 'stop_sequence':
          return await this.dispatchStopSequence(intent, ctx)
        case 'delete_draft':
          return await this.dispatchDeleteDraft(intent, ctx)
        // #3076 (épopée #2858) — la carte d'opportunité rejoint la gouvernance Action OS.
        case 'update_opportunity':
          return await this.dispatchUpdateOpportunity(intent, ctx)
        default: {
          const _exhaustive: never = intent
          throw new Error(`Unknown action intent: ${JSON.stringify(_exhaustive)}`)
        }
      }
    } catch (error) {
      const type = (intent as ActionIntent).type
      /**
       * ⚠️ TOUTE exception devenait `failed`, timeout compris.
       *
       * Le contrat déclare `unknown` exactement pour ce cas, et écrit pourquoi :
       * « replier un timeout dans `failed` rejouerait une action peut-être déjà
       * faite (double envoi) ». Le code faisait précisément ce que son propre
       * commentaire interdisait, et aucun `unknown` n'était produit nulle part
       * en production — l'invariant n°6 était déclaré et jamais atteint.
       *
       * La seule question est : la requête a-t-elle pu PARTIR ? La réponse est
       * une fonction pure, testée sans base.
       */
      const status = dispatchFailureOutcome(error)
      this.logger.error(`Action dispatch ${status}`, {
        error,
        tags: { 'action.intent': type, 'action.status': status },
      })
      return { type, status, reason: errorMessage(error) }
    }
  }

  /** I6 — la salle de démonstration n'écrit dans aucun outil externe. */
  private async isDemo(ctx: DispatchCtx): Promise<boolean> {
    return this.workspaceContext.isDemoWorkspace(ctx.userId)
  }

  /**
   * `send_email` — dispatch the contact's reviewed outreach draft via the exact
   * capability the "Envoie l'email" button uses (#394): strict ownership,
   * idempotency, suppression/opt-out and cadence all still apply. The intent's
   * `subject`/`body`/`provider` are accepted by the contract for forward-compat
   * but are NOT applied here — the send uses the prepared `email_message` draft,
   * never a fabricated body. That downstream path already journals the send
   * (`message_sent`), so the router adds no second log.
   */
  private async dispatchSendEmail(intent: SendEmailIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const result = await this.contacts.sendEmail(intent.contactId, ctx.userId, ctx.email)
    if (isSuccess(result)) {
      return { type: 'send_email', status: 'done', externalRef: result.output.contact_id }
    }
    return { type: 'send_email', status: sendFailureStatus(result.problem.code), reason: result.problem.message }
  }

  /**
   * `enrich_contact` — enrich through {@link ContactsService.enrichContact}, which
   * owns the credit logic (checks + consumes 1 enrichment credit only on a real
   * match). The router derives the match keys server-side from the owned contact
   * (name split + resolved company). Out of credit → `skipped` (a soft
   * precondition, not an error).
   *
   * D3 / I4 (#1931 L2) — the result carries `creditsDebited`, the debit the
   * enrichment REPORTED. A `done` that found nothing reports 0; the runner used
   * to count the step's estimate instead.
   *
   * D4 (#1931 L2) — `mode: 'queued'` does not hold the caller for the 30-85 s
   * cascade: it enqueues on the SAME background queue the web button uses (202 +
   * polling) and answers `queued`. The reservation reference (when the runner
   * reserved at the click) travels with the job: its worker settles it the
   * moment it observes the debit (I3).
   */
  private async dispatchEnrich(intent: EnrichContactIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const owned = await this.contacts.findOwnedForAction(intent.contactId, ctx.userId)
    if (isFailure(owned)) return { type: 'enrich_contact', status: 'skipped', reason: owned.problem.message }
    const contact = owned.output

    const { firstName, lastName } = splitName(contact.full_name ?? '')
    if (!firstName) {
      return {
        type: 'enrich_contact',
        status: 'skipped',
        reason: "Contact sans nom exploitable pour l'enrichissement.",
      }
    }
    const organizationName = await this.resolveOrganizationName(contact)
    if (!organizationName) {
      return {
        type: 'enrich_contact',
        status: 'skipped',
        reason: 'Entreprise du contact inconnue — enrichissement impossible.',
      }
    }

    if (intent.mode === 'queued') {
      const jobs = this.ports?.enrichmentJobs
      if (!jobs) {
        return { type: 'enrich_contact', status: 'skipped', reason: 'Recherche en tâche de fond indisponible.' }
      }
      const accepted = await jobs.enqueue({
        contactId: intent.contactId,
        userId: ctx.userId,
        firstName,
        ...(lastName ? { lastName } : {}),
        organizationName,
        // R4 — la réservation voyage avec l'espace résolu pour ce dispatch.
        ...(ctx.reservationReference
          ? { reservationReference: ctx.reservationReference, reservationWorkspaceId: ctx.workspaceId }
          : {}),
      })
      if (!accepted.accepted) {
        return {
          type: 'enrich_contact',
          status: enrichmentRefusalStatus(accepted.code),
          reason: accepted.message,
          creditsDebited: 0,
        }
      }
      return {
        type: 'enrich_contact',
        status: 'queued',
        externalRef: accepted.jobId,
        ...(ctx.reservationReference && !accepted.reservationAttached
          ? { reason: 'Une recherche était déjà en cours pour ce contact : elle est suivie telle quelle.' }
          : {}),
      }
    }

    const result = await this.contacts.enrichContact(intent.contactId, ctx.userId, {
      first_name: firstName,
      last_name: lastName,
      organization_name: organizationName,
    })
    if (isSuccess(result)) {
      // enrichContact doesn't write the activity feed — the router logs it so the
      // enrichment shows up in the journal alongside the credit ledger movement.
      const journalId = await this.journal(ctx, {
        actionType: 'plan_action_enrichment_requested',
        accountId: contact.account_id,
        contactId: contact.id,
        metadata: {
          label: 'Enrichissement',
          detail: `Enrichissement — ${contact.full_name ?? contact.id}`,
          status: 'Demandé',
          router_intent: 'enrich_contact',
        },
      })
      const debited = (result.output as { credits_debited?: unknown }).credits_debited
      return {
        type: 'enrich_contact',
        status: 'done',
        externalRef: journalId ?? contact.id,
        ...(typeof debited === 'number'
          ? { creditsDebited: debited, ...(debited === 0 ? { reason: ENRICHMENT_FOUND_NOTHING } : {}) }
          : { reason: DEBIT_NOT_REPORTED }),
      }
    }
    // insufficient_credits is a soft precondition → skipped; anything else = failed.
    const status: ActionDispatchStatus = result.problem.code === 'insufficient_credits' ? 'skipped' : 'failed'
    return { type: 'enrich_contact', status, reason: result.problem.message, creditsDebited: 0 }
  }

  /**
   * `create_crm_task` — push/upsert the owned contact into the connected CRM.
   *
   * ⚠️ PIÈGE L1 (#1931) — `crmTaskProviderSchema` accepts four providers since
   * L1, and this method branched `hubspot ? … : salesforce`: a Pipedrive or
   * Attio intent was checked against Salesforce's status and EXPORTED TO
   * SALESFORCE. The routing is now an exhaustive `switch` on the provider; a
   * provider without a wired door answers `skipped` with a clear reason and
   * writes NOWHERE — never into another CRM.
   *
   * D9 (#1931 L2) — every door receives the write ORIGIN. HubSpot's gate did
   * already (but the router never passed it: every workflow write was `user`);
   * Salesforce/Pipedrive/Attio had no gate at all. They now go through the same
   * BEL-INT-603 gate (`crmWriteGate` port) — a `system` write is HELD as a
   * visible request, never written straight through. Without the gate wired, a
   * `system` write to them is refused rather than let through ungated.
   *
   * For HubSpot a supplied `note`/`dueDate` is also written onto the contact's
   * timeline (Note engagement, best-effort); the three others have no engagement
   * call here, so the note is preserved in the internal journal instead. Every
   * outcome is journaled.
   */
  private async dispatchCrmTask(intent: CreateCrmTaskIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const owned = await this.contacts.findOwnedForAction(intent.contactId, ctx.userId)
    if (isFailure(owned)) return { type: 'create_crm_task', status: 'skipped', reason: owned.problem.message }
    const contact = owned.output
    if (await this.isDemo(ctx)) return { type: 'create_crm_task', status: 'skipped', reason: DEMO_NO_EXTERNAL_WRITE }

    const input = contactToCrmInput(contact)
    const noteBody = buildCrmNote(intent)
    const provider: CrmTaskProvider = intent.crmProvider

    let externalRef: string
    // #4185 / #4186 — HubSpot garde sa propre porte (`CrmService.exportContact`)
    // et sa note de chronologie ; tout autre fournisseur part par la porte
    // COMMUNE (`crmWrites`), qui écrit chez CE fournisseur et nulle part ailleurs.
    if (provider === 'hubspot') {
      if (!(await this.crm.getStatus(ctx.userId)).connected) {
        return { type: 'create_crm_task', status: 'skipped', reason: 'CRM non connecté.' }
      }
      const upserted = await this.crm.exportContact(ctx.userId, input, {
        origin: ctx.origin,
        source: ctx.source ?? null,
      })
      // La porte d'écriture CRM retient une demande `system` (BEL-INT-603). Un
      // `null` n'est pas un échec : c'est « quelqu'un doit d'abord la relire ».
      if (!upserted) return { type: 'create_crm_task', status: 'awaiting_approval', reason: CRM_WRITE_HELD }
      externalRef = upserted.id
      if (noteBody) {
        // Best-effort: the contact was already exported; a failed note must not
        // fail the whole dispatch (the export is the primary side effect).
        try {
          await this.crm.logActivity(ctx.userId, upserted.id, noteBody, {
            origin: ctx.origin,
            source: ctx.source ?? null,
          })
        } catch (error) {
          this.logger.warn('CRM note failed (contact exported)', {
            error: errorMessage(error),
            tags: { 'action.intent': 'create_crm_task' },
          })
        }
      }
    } else {
      const written = await this.writeThroughGate(ctx, provider, input)
      if ('held' in written) return written.held
      externalRef = written.externalRef
    }

    await this.journal(ctx, {
      actionType: 'crm_task_created',
      accountId: contact.account_id,
      contactId: contact.id,
      metadata: {
        label: 'Tâche CRM',
        detail: noteBody ?? 'Contact exporté vers le CRM',
        status: 'Créée',
        router_intent: 'create_crm_task',
        crm_provider: provider,
        external_ref: externalRef,
        ...(intent.dueDate ? { due_date: intent.dueDate } : {}),
      },
    })
    return { type: 'create_crm_task', status: 'done', externalRef }
  }

  /**
   * #4186 — tout CRM hors HubSpot passe par la porte COMMUNE (`crmWrites`) :
   * demande enregistrée, écriture par l'adaptateur du fournisseur visé, et
   * RÉSULTAT consigné (`unknown` si la requête part sans réponse). Une
   * écriture `system` est RETENUE ; sans porte branchée, rien n'est écrit.
   */
  private async writeThroughGate(
    ctx: DispatchCtx,
    provider: Exclude<CrmTaskProvider, 'hubspot'>,
    input: CrmContactInput,
  ): Promise<{ externalRef: string } | { held: ActionDispatchResult }> {
    const crmWrites = this.ports?.crmWrites
    if (!crmWrites) {
      return {
        held: {
          type: 'create_crm_task',
          status: 'skipped',
          reason: "Aucune porte d'écriture n'est branchée pour ce CRM : rien n'a été écrit, ni là ni ailleurs.",
        },
      }
    }
    const outcome = await crmWrites.exportContact({
      userId: ctx.userId,
      provider,
      payload: input,
      origin: ctx.origin,
      source: ctx.source ?? null,
    })
    switch (outcome.status) {
      case 'written':
        return { externalRef: outcome.externalId }
      case 'pending':
        return {
          held: {
            type: 'create_crm_task',
            status: 'awaiting_approval',
            reason: CRM_WRITE_HELD,
            externalRef: outcome.requestId,
          },
        }
      case 'already_done':
        return {
          held: {
            type: 'create_crm_task',
            status: 'done',
            reason: 'Déjà écrit par une demande identique.',
            externalRef: outcome.externalId ?? outcome.requestId,
          },
        }
      case 'refused':
        return { held: { type: 'create_crm_task', status: 'skipped', reason: outcome.reason } }
    }
  }

  /**
   * `schedule_reminder` — pose le rappel sur le VRAI calendrier quand il y en a
   * un de connecté, sinon dans le journal interne.
   *
   * Le routeur dégradait systématiquement vers le journal avec la mention
   * « calendrier non connecté », y compris pour un utilisateur dont l'agenda
   * était branché depuis des semaines : la capacité existait dans un module
   * autonome, mais rien ne l'appelait (addendum final §14). Un rappel qui ne
   * sonne que dans Bellum n'est pas un rappel — le commercial vit dans son
   * agenda.
   *
   * Le journal est écrit DANS LES DEUX CAS : c'est lui qui porte la traçabilité
   * (qui, quand, pour quel compte) et il ne coûte rien. Ce qui change, c'est
   * qu'un événement réel existe en plus, et que le `reason` le dit.
   *
   * Le rappel porte sur un CONTACT ou sur un COMPTE. La forme compte est ce qui
   * rend un *besoin* suivable (restitution V2 §7) : un besoin appartient à une
   * entreprise, et lui choisir un contact porteur serait arbitraire.
   *
   * I6 — en démonstration, l'agenda n'est pas sollicité : le rappel reste interne.
   */
  private async dispatchReminder(intent: ScheduleReminderIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const target = await this.resolveReminderTarget(intent, ctx)
    if ('reason' in target) return { type: 'schedule_reminder', status: 'skipped', reason: target.reason }

    const title = intent.note?.trim() || `Relance — ${target.label}`
    // #1943.3 — un rappel reste un pense-bête : une portée d'agenda manquante y
    // retombe sur le journal interne EXACTEMENT comme toute autre panne de
    // calendrier (témoin déjà tenu par le test « l'agenda casse »). Nommer la
    // portée manquante importe pour un VRAI événement (`dispatchCalendarEvent`,
    // ci-dessous) — pas ici, où rien n'était promis à personne d'autre.
    const calendarOutcome = (await this.isDemo(ctx))
      ? null
      : await this.tryCalendar(ctx, {
          title,
          startsAt: intent.at,
          // Un rappel n'a pas de durée négociée : quinze minutes suffisent à le voir
          // dans une journée sans bloquer un créneau.
          endsAt: new Date(new Date(intent.at).getTime() + REMINDER_DURATION_MS).toISOString(),
          attendees: [],
          link: target.accountId ? `/accounts/${target.accountId}` : undefined,
        })
    const calendarRef = calendarOutcome && 'id' in calendarOutcome ? calendarOutcome.id : null

    const journalId = await this.journal(ctx, {
      actionType: 'plan_action_added',
      accountId: target.accountId,
      contactId: target.contactId,
      metadata: {
        label: 'Rappel programmé',
        detail: intent.note ?? `Rappel — ${target.label}`,
        status: 'Programmé',
        router_intent: 'schedule_reminder',
        remind_at: intent.at,
        source: calendarRef ? 'calendar' : 'internal_reminder',
        ...(calendarRef ? { calendar_event_id: calendarRef } : {}),
      },
    })
    if (!journalId && !calendarRef) {
      return { type: 'schedule_reminder', status: 'failed', reason: "Échec d'enregistrement du rappel." }
    }
    return {
      type: 'schedule_reminder',
      status: 'done',
      reason: calendarRef ? 'Rappel posé sur votre agenda.' : 'Rappel interne enregistré (aucun agenda connecté).',
      externalRef: calendarRef ?? (journalId as string),
    }
  }

  /**
   * `create_calendar_event` — un vrai événement, avec durée et invités.
   *
   * Distinct du rappel : on n'invite pas un client à un pense-bête. Sans agenda
   * connecté, c'est `skipped` avec sa raison — surtout PAS une ligne de journal
   * déguisée en réunion, qui laisserait croire que des invitations sont parties.
   */
  private async dispatchCalendarEvent(
    intent: CreateCalendarEventIntent,
    ctx: DispatchCtx,
  ): Promise<ActionDispatchResult> {
    // Un contact fourni est re-vérifié server-side : on ne pose pas un événement
    // au nom de quelqu'un d'autre parce qu'un identifiant a été deviné.
    let contactId: string | null = null
    if (intent.contactId) {
      const owned = await this.contacts.findOwnedForAction(intent.contactId, ctx.userId)
      if (isFailure(owned)) {
        return { type: 'create_calendar_event', status: 'skipped', reason: owned.problem.message }
      }
      contactId = owned.output.id
    }
    if (await this.isDemo(ctx)) {
      return { type: 'create_calendar_event', status: 'skipped', reason: DEMO_NO_EXTERNAL_WRITE }
    }

    const endsAt = new Date(new Date(intent.startsAt).getTime() + intent.durationMinutes * 60_000).toISOString()
    const outcome = await this.tryCalendar(ctx, {
      title: intent.title,
      startsAt: intent.startsAt,
      endsAt,
      attendees: intent.attendees,
      note: intent.note,
      link: intent.accountId ? `/accounts/${intent.accountId}` : undefined,
    })
    if (!outcome) {
      return {
        type: 'create_calendar_event',
        status: 'skipped',
        reason: "Aucun agenda connecté — l'événement n'a pas été créé.",
      }
    }
    // #1943.3 — une portée manquante se NOMME, elle ne se replie pas sur « aucun
    // agenda connecté » : CET agenda EST connecté, ce qui manque est le droit
    // d'écrire dessus.
    if ('scopeMissingReason' in outcome) {
      return { type: 'create_calendar_event', status: 'skipped', reason: outcome.scopeMissingReason }
    }
    const eventId = outcome.id

    await this.journal(ctx, {
      actionType: 'plan_action_added',
      accountId: intent.accountId ?? null,
      contactId,
      metadata: {
        label: 'Événement créé',
        detail: intent.title,
        status: 'Créé',
        router_intent: 'create_calendar_event',
        starts_at: intent.startsAt,
        attendees: intent.attendees.length,
        calendar_event_id: eventId,
      },
    })
    return { type: 'create_calendar_event', status: 'done', externalRef: eventId }
  }

  /**
   * `create_crm_note` — une note sur la fiche EXISTANTE, sans upsert.
   *
   * `create_crm_task` remonte la fiche entière (et peut donc la créer) ; ici on
   * n'écrit qu'une ligne d'activité. La distinction est ce qui évite de créer un
   * doublon à chaque compte rendu d'appel — le mode de défaillance nommé p28.
   */
  private async dispatchCrmNote(intent: CreateCrmNoteIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const owned = await this.contacts.findOwnedForAction(intent.contactId, ctx.userId)
    if (isFailure(owned)) return { type: 'create_crm_note', status: 'skipped', reason: owned.problem.message }
    const contact = owned.output
    if (await this.isDemo(ctx)) return { type: 'create_crm_note', status: 'skipped', reason: DEMO_NO_EXTERNAL_WRITE }

    const status = await this.crm.getStatus(ctx.userId)
    if (!status.connected) {
      return { type: 'create_crm_note', status: 'skipped', reason: 'Aucun CRM connecté.' }
    }
    // La note s'écrit sur la fiche DÉJÀ présente : sans identifiant externe
    // connu, on la cherche, et on refuse plutôt que de la créer — créer une
    // fiche pour pouvoir y écrire une note est exactement le doublon visé p28.
    const externalId = intent.crmRecordId?.trim() || (await this.findCrmRecordId(contact, ctx))
    if (!externalId) {
      return {
        type: 'create_crm_note',
        status: 'skipped',
        reason: "Ce contact n'a pas été retrouvé dans votre CRM — poussez-le d'abord.",
      }
    }
    // D9 — l'origine voyage jusqu'à la porte : une note posée par une routine est retenue.
    const written = await this.crm.logActivity(ctx.userId, externalId, intent.note, {
      origin: ctx.origin,
      source: ctx.source ?? null,
    })
    if (written === null) return { type: 'create_crm_note', status: 'awaiting_approval', reason: CRM_WRITE_HELD }
    await this.journal(ctx, {
      actionType: 'crm_task_created',
      accountId: contact.account_id,
      contactId: contact.id,
      metadata: {
        label: 'Note CRM',
        detail: intent.note,
        status: 'Écrite',
        router_intent: 'create_crm_note',
        external_ref: externalId,
      },
    })
    return { type: 'create_crm_note', status: 'done', externalRef: externalId }
  }

  /**
   * `remove_crm_task` (#2277.36, épopée #2771) — RETIRE la tâche CRM créée sous
   * `targetId` (une ligne `user_actions`, `router_intent: 'create_crm_task'`).
   *
   * `INTENT_REVERSIBILITY['create_crm_task']` (`action-os.ts`) le dit déjà :
   * « Une tâche se REFERME dans le CRM ; on ne l'y supprime pas. » Il n'existe
   * NULLE PART dans ce dépôt d'appel « fermer/compléter une tâche » vers un
   * fournisseur CRM — inventer cet appel serait exactement la donnée fictive
   * que la doctrine interdit. La compensation RÉELLE et déjà câblée est celle
   * qu'utilise `create_crm_note` : une note versée sur la MÊME fiche
   * (`crm.logActivity`), pour HubSpot seulement (seul fournisseur où ce dépôt a
   * une porte de note). Pour Salesforce/Pipedrive/Attio, rien ne compense
   * côté CRM — dit tel quel, jamais silencieux — mais la ligne locale est
   * quand même marquée retirée : c'est vrai de NOTRE côté quel que soit le
   * fournisseur.
   */
  private async dispatchRemoveCrmTask(intent: RemoveCrmTaskIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const action = await this.userActions.findOne({
      where: [
        { id: intent.targetId, workspace_id: ctx.workspaceId },
        { id: intent.targetId, user_id: ctx.userId },
      ],
    })
    if (!action) {
      return { type: 'remove_crm_task', status: 'skipped', reason: 'Tâche CRM introuvable.' }
    }
    if (action.metadata?.['router_intent'] !== 'create_crm_task') {
      return { type: 'remove_crm_task', status: 'skipped', reason: "Cette action n'est pas une tâche CRM." }
    }
    if (action.metadata?.['withdrawn_at']) {
      return { type: 'remove_crm_task', status: 'skipped', reason: 'Cette tâche a déjà été retirée.' }
    }

    const provider = action.metadata?.['crm_provider']
    const externalRef = action.metadata?.['external_ref']
    const reasonNote = intent.note?.trim() || "la relance n'est plus nécessaire."
    let compensationNote: string | undefined

    if (provider === 'hubspot' && typeof externalRef === 'string' && externalRef) {
      if (await this.isDemo(ctx)) return { type: 'remove_crm_task', status: 'skipped', reason: DEMO_NO_EXTERNAL_WRITE }
      const status = await this.crm.getStatus(ctx.userId)
      if (status.connected) {
        const written = await this.crm.logActivity(ctx.userId, externalRef, `Tâche annulée : ${reasonNote}`, {
          origin: ctx.origin,
        })
        if (written === null) return { type: 'remove_crm_task', status: 'awaiting_approval', reason: CRM_WRITE_HELD }
        compensationNote = 'Une note rectificative a été versée au CRM.'
      }
    }

    action.metadata = { ...(action.metadata ?? {}), withdrawn_at: new Date().toISOString(), status: 'Retirée' }
    await this.userActions.save(action)
    return {
      type: 'remove_crm_task',
      status: 'done',
      externalRef: action.id,
      reason: compensationNote ?? "Tâche retirée localement — aucune compensation n'est branchée pour ce fournisseur.",
    }
  }

  /**
   * `close_crm_task` (#2319.114, épopée #2985) — CLÔTURE la tâche CRM créée
   * sous `targetId`, à la différence de `remove_crm_task` ci-dessus qui la
   * RETIRE (compensation par note, aucun appel de fermeture disponible).
   *
   * Seul HubSpot sait fermer une tâche depuis ce dépôt
   * (`HubspotClient.closeTask`, `hs_task_status: COMPLETED`) : pour les autres
   * fournisseurs, rien n'est écrit — dit tel quel, jamais un appel deviné vers
   * un contrat non vérifié (doctrine, `agent_docs/doctrine.md:34`).
   */
  private async dispatchCloseCrmTask(intent: CloseCrmTaskIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const action = await this.userActions.findOne({
      where: [
        { id: intent.targetId, workspace_id: ctx.workspaceId },
        { id: intent.targetId, user_id: ctx.userId },
      ],
    })
    if (!action) {
      return { type: 'close_crm_task', status: 'skipped', reason: 'Tâche CRM introuvable.' }
    }
    if (action.metadata?.['router_intent'] !== 'create_crm_task') {
      return { type: 'close_crm_task', status: 'skipped', reason: "Cette action n'est pas une tâche CRM." }
    }
    if (action.metadata?.['withdrawn_at']) {
      return { type: 'close_crm_task', status: 'skipped', reason: 'Cette tâche a déjà été retirée.' }
    }
    if (action.metadata?.['closed_at']) {
      return { type: 'close_crm_task', status: 'skipped', reason: 'Cette tâche a déjà été clôturée.' }
    }

    const provider = action.metadata?.['crm_provider']
    const externalRef = action.metadata?.['external_ref']
    if (provider !== 'hubspot' || typeof externalRef !== 'string' || !externalRef) {
      return {
        type: 'close_crm_task',
        status: 'skipped',
        reason: "Aucune clôture n'est branchée pour ce fournisseur : rien n'a été écrit.",
      }
    }

    if (await this.isDemo(ctx)) return { type: 'close_crm_task', status: 'skipped', reason: DEMO_NO_EXTERNAL_WRITE }
    const status = await this.crm.getStatus(ctx.userId)
    if (!status.connected) {
      return { type: 'close_crm_task', status: 'skipped', reason: "Ce CRM n'est plus connecté." }
    }
    const written = await this.crm.closeTask(ctx.userId, { taskId: externalRef }, { origin: ctx.origin })
    if (written === null) return { type: 'close_crm_task', status: 'awaiting_approval', reason: CRM_WRITE_HELD }

    action.metadata = { ...(action.metadata ?? {}), closed_at: new Date().toISOString(), status: 'Terminée' }
    await this.userActions.save(action)
    return { type: 'close_crm_task', status: 'done', externalRef: action.id }
  }

  /**
   * `notify_user` — comment un workflow rend compte de ce qu'il a fait sans
   * l'utilisateur. Jamais un envoi externe : une notification n'est pas un email.
   */
  private async dispatchNotify(intent: NotifyUserIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    if (!this.notifier) {
      return { type: 'notify_user', status: 'skipped', reason: 'Notifications indisponibles.' }
    }
    const created = await this.notifier.notify(ctx.userId, {
      title: intent.title,
      body: intent.body,
      link: intent.link ?? null,
    })
    return { type: 'notify_user', status: 'done', externalRef: created.id }
  }

  /**
   * `generate_message` (#1931 L2) — le TEXTE d'un brouillon, rien d'autre. Rien
   * n'est persisté ni envoyé par ce pas : le brouillon voyage dans le résultat
   * (`artifact`), que la carte garde. Le contact est re-vérifié ici, comme partout.
   *
   * #3405.3 — LA GARDE NO-GO : « NE JAMAIS RELANCER UN NO-GO SANS NOUVEAU
   * MOTIF ».
   *
   * `accounts.sprint = 'no_go'` est déjà un geste humain daté et motivé
   * (`sprint_reason`, BEL-SC-228) — rien de nouveau à écrire ici, seulement
   * un appelant qui le LIT avant de rédiger. Sortir du NO-GO exige déjà de
   * poser un nouveau niveau de sprint (`SprintsService.applyEvent`), donc un
   * nouveau motif : bloquer ici tant que `sprint` vaut `'no_go'` EST la règle,
   * pas une approximation d'elle — aucune date de « dernier changement » à
   * comparer, aucune heuristique à deviner.
   */
  private async dispatchGenerateMessage(
    intent: GenerateMessageIntent,
    ctx: DispatchCtx,
  ): Promise<ActionDispatchResult> {
    const drafts = this.ports?.messageDrafts
    if (!drafts) return { type: 'generate_message', status: 'skipped', reason: 'Génération de brouillon indisponible.' }
    const owned = await this.contacts.findOwnedForAction(intent.contactId, ctx.userId)
    if (isFailure(owned)) return { type: 'generate_message', status: 'skipped', reason: owned.problem.message }

    if (owned.output.account_id) {
      const account = await this.accounts.findOne({
        where: { id: owned.output.account_id },
        select: ['sprint', 'sprint_reason'],
      })
      const refusal = noGoMessageRefusal(account?.sprint, account?.sprint_reason)
      if (refusal) return { type: 'generate_message', status: 'skipped', reason: refusal }
    }

    const draft = await drafts.generate({
      userId: ctx.userId,
      contactId: intent.contactId,
      channel: intent.channel,
      ...(intent.angle ? { context: intent.angle } : {}),
    })
    return {
      type: 'generate_message',
      status: 'done',
      reason: "Brouillon généré — rien n'a été envoyé.",
      artifact: {
        kind: 'message_draft',
        channel: intent.channel,
        subject: draft.subject,
        body: draft.body,
        // #3234 (#3211.11) — porté jusqu'au brouillon, jamais deviné : `null`
        // quand aucun angle n'a été donné.
        angle: intent.angle ?? null,
      },
    }
  }

  /**
   * `create_mail_draft` (#1931 L2) — UN BROUILLON dans la messagerie de la
   * personne (D58 : une boîte est personnelle). Il n'existe AUCUN chemin d'envoi
   * derrière ce `case` : le port `MailDraftPort` n'a qu'une méthode,
   * `createDraft`. Doctrine : le copilote n'envoie jamais d'e-mail — ce n'est pas
   * une convention, c'est l'absence de code (test : `card-effect-ports.spec.ts`).
   */
  private async dispatchMailDraft(intent: CreateMailDraftIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const mail = this.ports?.mailDrafts
    if (!mail) return { type: 'create_mail_draft', status: 'skipped', reason: 'Messagerie indisponible.' }
    const created = await mail.createDraft(ctx.userId, {
      to: intent.to,
      subject: intent.subject,
      body: intent.body,
      ...(intent.threadId ? { threadId: intent.threadId } : {}),
    })
    // #2394.35 / #2394.62 — « déposé » exige un identifiant de brouillon RÉEL
    // ET la preuve de où il a atterri (`messageId`, `threadId`) : un
    // fournisseur qui ne rend que `draftId` n'a rien créé de VÉRIFIABLE, et
    // l'affirmer quand même serait une confirmation de dépôt sans preuve
    // derrière (le NO-GO de #2394). Une seule dérivation (GA-26,
    // `mailDraftHasProof`), la même que `PendingActions.tsx` lit pour l'appel
    // direct de #1959.3.
    if (!mailDraftHasProof(created)) {
      return {
        type: 'create_mail_draft',
        status: 'failed',
        reason:
          "La messagerie n'a rendu aucune preuve vérifiable (identifiant, message ou fil) : rien n'est confirmé déposé.",
      }
    }
    return {
      type: 'create_mail_draft',
      status: 'done',
      externalRef: created.webUrl ?? created.draftId,
      reason: "Le brouillon a été créé dans votre messagerie. Aucun message n'a été envoyé.",
    }
  }

  /**
   * `delete_draft` (#2277.34, épopée #2771) — le rollback de `create_mail_draft` :
   * supprime le brouillon `targetId` dans SA messagerie personnelle. Passe par le
   * MÊME `MailDraftPort` étroit — `deleteDraft` ne recopie toujours aucune
   * méthode d'envoi (garde `card-effect-ports.spec.ts`).
   */
  private async dispatchDeleteDraft(intent: DeleteDraftIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const mail = this.ports?.mailDrafts
    if (!mail) return { type: 'delete_draft', status: 'skipped', reason: 'Messagerie indisponible.' }
    const outcome = await mail.deleteDraft(ctx.userId, intent.targetId)
    if (!outcome.deleted) {
      return { type: 'delete_draft', status: 'skipped', reason: "Ce brouillon n'existe plus — rien à supprimer." }
    }
    return {
      type: 'delete_draft',
      status: 'done',
      externalRef: intent.targetId,
      reason: 'Le brouillon a été supprimé de votre messagerie.',
    }
  }

  /** `update_routine` (#1931 L2) — le même service que `PATCH /routines/:key`, bornes et clés comprises. */
  private async dispatchUpdateRoutine(intent: UpdateRoutineIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const routines = this.ports?.routines
    if (!routines) return { type: 'update_routine', status: 'skipped', reason: 'Routines indisponibles.' }
    const patch = {
      ...(intent.enabled !== undefined ? { enabled: intent.enabled } : {}),
      ...(intent.hour !== undefined ? { hour: intent.hour } : {}),
      ...(intent.weekday !== undefined ? { weekday: intent.weekday } : {}),
      ...(intent.channel ? { channel: intent.channel } : {}),
    }
    if (Object.keys(patch).length === 0) {
      return { type: 'update_routine', status: 'skipped', reason: 'Rien à modifier sur cette routine.' }
    }
    const updated = await routines.update(ctx.userId, intent.key, patch)
    return {
      type: 'update_routine',
      status: 'done',
      externalRef: intent.key,
      reason: updated.enabled ? 'Routine activée.' : 'Routine désactivée.',
    }
  }

  /**
   * `update_setting` (#1931 L2) — seulement un réglage que le CATALOGUE déclare
   * écrivable depuis la conversation (`WRITABLE_SETTINGS_SCREENS`), seulement un
   * champ que ce catalogue liste pour cet écran, seulement une valeur dans ses
   * bornes. L'écran `/settings/pipeline` exige `team:manage`, comme sa route.
   *
   * ⚠️ Constat en chemin : `PATCH /notifications/preferences` ne relit PAS ce
   * catalogue (il accepte toute clé du schéma partiel). Ce `case`, lui, le relit.
   */
  private async dispatchUpdateSetting(intent: UpdateSettingIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const settings = this.ports?.settings
    if (!settings) return { type: 'update_setting', status: 'skipped', reason: 'Réglages indisponibles.' }
    if (!WRITABLE_SETTINGS_SCREENS.includes(intent.screen as (typeof WRITABLE_SETTINGS_SCREENS)[number])) {
      return { type: 'update_setting', status: 'skipped', reason: 'Ce réglage ne se modifie pas depuis une carte.' }
    }
    if (intent.screen === '/settings/pipeline') {
      const { role } = await this.workspaceContext.resolveActiveWorkspace(ctx.userId)
      // #2170.43 — arbitrage Louis 01/11 : `sales_ops` GARDE le réglage des durées cibles —
      // la MÊME règle que `PUT /pipeline/stage-sla/:stage` (`team:manage`, GA-26).
      if (!hasPermission(role, 'team:manage')) {
        return { type: 'update_setting', status: 'skipped', reason: "Ce réglage demande un responsable d'équipe." }
      }
      const refusal = checkSettingValue(await settings.pipelineFields(ctx.workspaceId), intent)
      if (refusal) return { type: 'update_setting', status: 'skipped', reason: refusal }
      await settings.writePipelineStage(ctx.workspaceId, intent.field, intent.newValue as number)
      return { type: 'update_setting', status: 'done', externalRef: `${intent.screen}#${intent.field}` }
    }
    const refusal = checkSettingValue(await settings.notificationFields(ctx.userId), intent)
    if (refusal) return { type: 'update_setting', status: 'skipped', reason: refusal }
    await settings.writeNotification(ctx.userId, intent.field, intent.newValue)
    return { type: 'update_setting', status: 'done', externalRef: `${intent.screen}#${intent.field}` }
  }

  /** `pin_memory_fact` (#1931 L2) — la même porte que l'épingle manuelle ; un compte cité est re-vérifié dans l'espace. */
  private async dispatchPinMemoryFact(intent: PinMemoryFactIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const memory = this.ports?.memory
    if (!memory) return { type: 'pin_memory_fact', status: 'skipped', reason: 'Mémoire indisponible.' }
    if (intent.accountId) {
      const account = await this.accounts.findOne({
        where: { id: intent.accountId, workspace_id: ctx.workspaceId },
        select: ['id'],
      })
      if (!account) {
        return {
          type: 'pin_memory_fact',
          status: 'skipped',
          reason: 'Compte introuvable dans votre espace de travail.',
        }
      }
    }
    const pinned = await memory.pinFact({
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
      accountId: intent.accountId ?? null,
      fact: intent.fact,
    })
    return { type: 'pin_memory_fact', status: 'done', externalRef: pinned.id }
  }

  /**
   * #3076 (épopée #2858) — applique le diff FIGÉ d'une carte
   * `propose_opportunity_update`, champ par champ, par les MÊMES routes que
   * l'écran de l'opportunité (`ProjectsService.updateStage`/`updateAmount`/
   * `updateBtmmp`/`updateRisks`, portées à l'espace). Un champ qui échoue
   * (opportunité introuvable ou hors espace) arrête la boucle : les champs déjà
   * écrits l'ont été, jamais rejoués — pas de second passage sur un diff partiel.
   */
  private async dispatchUpdateOpportunity(
    intent: UpdateOpportunityIntent,
    ctx: DispatchCtx,
  ): Promise<ActionDispatchResult> {
    const projects = this.ports?.projects
    if (!projects) return { type: 'update_opportunity', status: 'skipped', reason: 'Opportunités indisponibles.' }
    for (const change of intent.changes) {
      const applied =
        change.field === 'stage'
          ? await projects.updateStage(ctx.workspaceId, ctx.userId, intent.projectId, change.next)
          : change.field === 'estimated_amount'
            ? await projects.updateAmount(ctx.workspaceId, intent.projectId, change.next)
            : change.field === 'next_step'
              ? await projects.updateNextStep(ctx.workspaceId, intent.projectId, change.next)
              : await projects.updateRisk(ctx.workspaceId, intent.projectId, change.next)
      if (!applied) {
        return { type: 'update_opportunity', status: 'skipped', reason: 'Opportunité introuvable dans votre espace.' }
      }
    }
    return { type: 'update_opportunity', status: 'done', externalRef: intent.projectId }
  }

  /**
   * Retrouve la fiche CRM d'un contact par son email, sans jamais la créer.
   *
   * On interroge la présence du COMPTE (la seule recherche que le CRM expose
   * ici), puis on apparie sur l'email — un nom peut désigner deux personnes,
   * une adresse non. Aucun email connu, aucune correspondance, ou une erreur
   * côté CRM : `null`, et l'appelant saute le pas en le disant.
   */
  private async findCrmRecordId(contact: ContactEntity, ctx: DispatchCtx): Promise<string | null> {
    const email = contact.email?.trim().toLowerCase()
    if (!email) return null
    const company = await this.resolveOrganizationName(contact)
    if (!company) return null
    try {
      const presence = await this.crm.findPresence(ctx.userId, { account: company })
      const match = presence.contacts.find(c => c.email?.trim().toLowerCase() === email)
      return match?.id ?? null
    } catch (error) {
      this.logger.warn('CRM record lookup failed', {
        error: errorMessage(error),
        tags: { 'action.intent': 'create_crm_note' },
      })
      return null
    }
  }

  /**
   * Pose un événement sur le PREMIER agenda connecté, ou rend `null`.
   *
   * Best-effort par contrat : un agenda indisponible ne fait pas échouer l'action
   * appelante — le rappel retombe alors sur le journal interne, et on le dit.
   * Une erreur est journalisée mais jamais propagée : perdre un rappel parce
   * qu'un jeton OAuth a expiré serait pire que le poser en interne.
   */
  private async tryCalendar(
    ctx: DispatchCtx,
    input: { title: string; startsAt: string; endsAt: string; attendees: string[]; note?: string; link?: string },
  ): Promise<{ id: string } | { scopeMissingReason: string } | null> {
    // #1943.3 — un calendrier CONNECTÉ dont la portée manque n'est pas un
    // calendrier absent : sa raison NOMMÉE survit à la boucle, même si un
    // autre agenda échoue ensuite pour une raison plus banale (celle-là garde
    // le repli générique, correct pour elle).
    let scopeMissingReason: string | null = null
    for (const calendar of this.calendars) {
      try {
        if (!(await calendar.isConnected(ctx.userId))) continue
        const created = await calendar.createEvent(ctx.userId, input)
        return { id: created.id }
      } catch (error) {
        scopeMissingReason ??= scopeMissingReasonOf(error)
        this.logger.warn('Calendar event failed — falling back', {
          error: errorMessage(error),
          tags: { 'action.calendar': calendar.key },
        })
      }
    }
    return scopeMissingReason ? { scopeMissingReason } : null
  }

  /**
   * Resolve what a reminder hangs on, re-checking ownership SERVER-SIDE from the
   * id alone: a contact through the strict user-owned path, an account through the
   * caller's active workspace (same scoping as `findOneForWorkspace`). No id, or
   * an id outside the caller's scope, yields a `reason` — the caller then skips
   * rather than writing a reminder on someone else's row.
   */
  private async resolveReminderTarget(
    intent: ScheduleReminderIntent,
    ctx: DispatchCtx,
  ): Promise<ReminderTarget | { reason: string }> {
    if (intent.contactId) {
      const owned = await this.contacts.findOwnedForAction(intent.contactId, ctx.userId)
      if (isFailure(owned)) return { reason: owned.problem.message }
      const contact = owned.output
      return { accountId: contact.account_id, contactId: contact.id, label: contact.full_name ?? contact.id }
    }
    if (intent.accountId) {
      const account = await this.accounts.findOne({
        where: { id: intent.accountId, workspace_id: ctx.workspaceId },
        select: ['id', 'company_name', 'status'],
      })
      if (!account || account.status === 'deleted') {
        return { reason: 'Compte introuvable dans votre espace de travail.' }
      }
      return { accountId: account.id, contactId: null, label: account.company_name }
    }
    // The contract already refuses a target-less reminder; this keeps the service
    // safe on its own (bulk paths, future callers) instead of trusting the schema.
    return { reason: 'Rappel sans cible : un contact ou un compte est requis.' }
  }

  /**
   * `snooze` — report a previously-journaled action/reminder until a later time.
   * Resolves the target within the caller's workspace (or their own rows), then
   * stamps `snoozed_until` onto its state. Unknown target → `skipped`.
   */
  private async dispatchSnooze(intent: SnoozeIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const action = await this.userActions.findOne({
      where: [
        { id: intent.targetId, workspace_id: ctx.workspaceId },
        { id: intent.targetId, user_id: ctx.userId },
      ],
    })
    if (!action) {
      return { type: 'snooze', status: 'skipped', reason: 'Action à reporter introuvable.' }
    }
    action.metadata = {
      ...(action.metadata ?? {}),
      snoozed_until: intent.until,
      snoozed_at: new Date().toISOString(),
    }
    await this.userActions.save(action)
    return { type: 'snooze', status: 'done', externalRef: action.id }
  }

  /**
   * `cancel_reminder` (#2277.33, épopée #2771) — ANNULE un rappel, là où
   * `snooze` (ci-dessus) le REPORTE : les deux ciblent la MÊME ligne
   * `user_actions` par `targetId`, seule la marque posée diffère
   * (`snoozed_until` déplace l'échéance, `cancelled_at` l'éteint). Rien n'est
   * supprimé (doctrine « on archive, on ne supprime pas ») : la ligne reste
   * lisible, marquée. Idempotent : un second appel sur une ligne déjà annulée
   * est un `skipped`, jamais une seconde écriture.
   *
   * ⚠️ Périmètre assumé, identique à `snooze` : un rappel posé sur un VRAI
   * agenda connecté (`dispatchReminder`, `calendarRef`) n'a pas son événement
   * annulé ici — `CalendarBackend` n'expose aucune méthode de suppression
   * (seulement `createEvent`). Cette ligne reste marquée annulée chez nous ;
   * l'événement d'agenda, s'il existe, reste à annuler manuellement.
   */
  private async dispatchCancelReminder(intent: CancelReminderIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const action = await this.userActions.findOne({
      where: [
        { id: intent.targetId, workspace_id: ctx.workspaceId },
        { id: intent.targetId, user_id: ctx.userId },
      ],
    })
    if (!action) {
      return { type: 'cancel_reminder', status: 'skipped', reason: 'Rappel introuvable.' }
    }
    if (action.metadata?.['cancelled_at']) {
      return { type: 'cancel_reminder', status: 'skipped', reason: 'Ce rappel est déjà annulé.' }
    }
    action.metadata = {
      ...(action.metadata ?? {}),
      cancelled_at: new Date().toISOString(),
      status: 'Annulé',
    }
    await this.userActions.save(action)
    return { type: 'cancel_reminder', status: 'done', externalRef: action.id }
  }

  /**
   * `stop_sequence` (#2277.37, épopée #2771) — ARRÊT MANUEL, à la demande de
   * l'utilisateur. `stopSequencesFor` (`suppression.service.ts`) arrête déjà une
   * séquence, mais seulement sur opt-out ou rebond — jamais sur un geste
   * volontaire. Même logique que `OutreachService.cancel` (`outreach.service.ts`),
   * dupliquée ici plutôt qu'importée : `OutreachModule` importe DÉJÀ
   * `ActionRouterModule`, l'inverse fermerait un cycle. `cancelled`, jamais
   * `deleted` : les étapes restantes passent `skipped`, rien n'est retiré.
   */
  private async dispatchStopSequence(intent: StopSequenceIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    if (!this.outreachSequences || !this.outreachSequenceSteps) {
      return { type: 'stop_sequence', status: 'skipped', reason: 'Séquences indisponibles.' }
    }
    const sequence = await this.outreachSequences.findOne({ where: { id: intent.targetId, user_id: ctx.userId } })
    if (!sequence) {
      return { type: 'stop_sequence', status: 'skipped', reason: 'Séquence introuvable.' }
    }
    if (sequence.status === 'completed' || sequence.status === 'cancelled') {
      return { type: 'stop_sequence', status: 'skipped', reason: `La séquence est déjà « ${sequence.status} ».` }
    }
    sequence.status = 'cancelled'
    await this.outreachSequences.save(sequence)
    await this.outreachSequenceSteps.update({ sequence_id: sequence.id, status: 'pending' }, { status: 'skipped' })
    return {
      type: 'stop_sequence',
      status: 'done',
      externalRef: sequence.id,
      reason: 'Séquence arrêtée — les étapes restantes sont annulées.',
    }
  }

  /**
   * `restore_status` (#2277.35, épopée #2771) — restaure le contact ciblé par
   * `targetId` (une ligne `user_actions` déjà écrite par
   * `ContactsService.recordOutcomeAction`) au statut qu'il portait AVANT
   * cette déclaration (`metadata.previous_status`).
   *
   * Réutilise `ContactsService.updateStatus` telle quelle — pas une écriture
   * directe sur la colonne : c'est le MÊME geste qu'une déclaration humaine
   * (nudge de replanification, arrêt auto des séquences sur « répondu »/« RDV »,
   * et surtout le journal `previous_status` qui rend CETTE restauration à son
   * tour restaurable). « On archive, on ne supprime pas » : rien n'écrase la
   * ligne d'origine, `updateStatus` en verse une NOUVELLE.
   *
   * ⚠️ Périmètre assumé : seuls les rappels de STATUT DE CONTACT sont couverts.
   * Une déclaration de statut de COMPTE (`commercial_status`, ex. « Affaire
   * signée ») n'a pas de compensateur ici — `AccountsService` n'est pas
   * injecté dans ce routeur (GA-07), et l'écrire en contournant
   * `setCommercialStatus` perdrait ses effets de bord propres. Un `account_id`
   * sans `contact_id` reste donc `skipped`, jamais deviné.
   *
   * JAMAIS de donnée fictive : sans `previous_status` tracé, on refuse plutôt
   * que d'inventer une valeur de repli.
   */
  private async dispatchRestoreStatus(intent: RestoreStatusIntent, ctx: DispatchCtx): Promise<ActionDispatchResult> {
    const action = await this.userActions.findOne({
      where: [
        { id: intent.targetId, workspace_id: ctx.workspaceId },
        { id: intent.targetId, user_id: ctx.userId },
      ],
    })
    if (!action) {
      return { type: 'restore_status', status: 'skipped', reason: 'Action introuvable.' }
    }
    if (action.metadata?.['restored_at']) {
      return { type: 'restore_status', status: 'skipped', reason: 'Ce statut a déjà été restauré.' }
    }
    const previousStatus = action.metadata?.['previous_status']
    if (typeof previousStatus !== 'string' || !previousStatus) {
      return {
        type: 'restore_status',
        status: 'skipped',
        reason: 'Aucun statut antérieur connu pour cette action : rien à restaurer.',
      }
    }
    if (!action.contact_id) {
      return {
        type: 'restore_status',
        status: 'skipped',
        reason: action.account_id
          ? "La restauration d'un statut de compte n'est pas câblée sur ce rollback."
          : 'Aucune fiche ciblée par cette action.',
      }
    }
    const owned = await this.contacts.findOwnedForAction(action.contact_id, ctx.userId)
    if (isFailure(owned)) {
      return { type: 'restore_status', status: 'skipped', reason: owned.problem.message }
    }
    const restored = await this.contacts.updateStatus(action.contact_id, ctx.userId, previousStatus)
    if (isFailure(restored)) {
      return { type: 'restore_status', status: 'failed', reason: restored.problem.message }
    }
    action.metadata = { ...(action.metadata ?? {}), restored_at: new Date().toISOString() }
    await this.userActions.save(action)
    return {
      type: 'restore_status',
      status: 'done',
      externalRef: action.contact_id,
      reason: `Statut restauré : « ${previousStatus} ».`,
    }
  }

  /** Company name for enrichment: the contact's own entity, else its account's
   *  `company_name`. Returns undefined when neither is known (no fabrication —
   *  the caller then skips). */
  private async resolveOrganizationName(contact: ContactEntity): Promise<string | undefined> {
    const own = contact.entity?.trim()
    if (own) return own
    // #1473 — un contact À QUALIFIER n'a pas de compte d'où tirer un nom
    // d'organisation. On rend `undefined`, comme pour un compte illisible :
    // l'appelant saute l'enrichissement plutôt que d'inventer un employeur.
    if (!contact.account_id) return undefined
    const account = await this.accounts.findOne({ where: { id: contact.account_id }, select: ['company_name'] })
    return account?.company_name?.trim() || undefined
  }

  /**
   * Append one row to the shared action journal (`user_actions`). BEST-EFFORT: a
   * journal failure is logged and swallowed — it must never fail an action that
   * already happened (matches the codebase convention, e.g. `recordEmailSent`).
   * Returns the new row id, or undefined on failure.
   */
  private async journal(
    ctx: DispatchCtx,
    entry: {
      actionType: string
      accountId?: string | null
      contactId?: string | null
      channel?: string | null
      metadata: Record<string, unknown>
    },
  ): Promise<string | undefined> {
    try {
      const saved = await this.userActions.save(
        this.userActions.create({
          user_id: ctx.userId,
          workspace_id: ctx.workspaceId,
          account_id: entry.accountId ?? null,
          contact_id: entry.contactId ?? null,
          action_type: entry.actionType,
          channel: entry.channel ?? null,
          metadata: entry.metadata,
        }),
      )
      return saved.id
    } catch (error) {
      this.logger.error('action-router journal write failed', {
        error,
        tags: { 'action.intent': String(entry.metadata['router_intent'] ?? entry.actionType) },
      })
      return undefined
    }
  }
}

/**
 * `update_setting` — le champ existe-t-il dans le catalogue de CET écran, et la
 * valeur a-t-elle son type et ses bornes ? `null` = accepté ; sinon, la raison.
 */
function checkSettingValue(fields: readonly SettingsField[], intent: UpdateSettingIntent): string | null {
  const field = fields.find(candidate => candidate.field === intent.field)
  if (!field) return "Ce champ n'est pas modifiable depuis une carte."
  if (field.type === 'bool') return typeof intent.newValue === 'boolean' ? null : 'Ce réglage attend oui ou non.'
  if (typeof intent.newValue !== 'number' || !Number.isInteger(intent.newValue)) {
    return 'Ce réglage attend un nombre entier.'
  }
  if (intent.newValue < field.min || intent.newValue > field.max) {
    return `Ce réglage attend une valeur entre ${field.min} et ${field.max}.`
  }
  return null
}

/** Combine a CRM task's `note` + `dueDate` into a single timeline note body.
 *  Returns undefined when neither is supplied (nothing to log). */
function buildCrmNote(intent: CreateCrmTaskIntent): string | undefined {
  const parts = [intent.note?.trim(), intent.dueDate ? `Échéance : ${intent.dueDate}` : undefined].filter(
    (part): part is string => Boolean(part),
  )
  return parts.length > 0 ? parts.join(' — ') : undefined
}

/** `23505` = violation d'unicité côté Postgres. Le code voyage sur l'erreur du
 *  driver ; TypeORM l'expose tel quel sur `QueryFailedError`. Même détecteur
 *  que `credit-reservation.service.ts` et `sprints.service.ts` — dupliqué
 *  plutôt que partagé, comme `contacts.service.ts` le fait déjà pour la même
 *  raison ailleurs dans ce dépôt : un import cross-module pour six lignes
 *  pures coûterait plus qu'il ne rendrait. */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown; driverError?: { code?: unknown } }).code
  const driverCode = (error as { driverError?: { code?: unknown } }).driverError?.code
  return code === '23505' || driverCode === '23505'
}

/** Tally dispatch outcomes per status for the bulk response summary. */
function summarise(results: ActionDispatchResult[]): DispatchBulkResponse['summary'] {
  return {
    total: results.length,
    done: results.filter(r => r.status === 'done').length,
    queued: results.filter(r => r.status === 'queued').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    failed: results.filter(r => r.status === 'failed').length,
  }
}
