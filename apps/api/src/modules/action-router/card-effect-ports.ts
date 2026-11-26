import type { NotificationPreferences, WriteSource } from '@bellum/contracts'
import {
  buildNotificationsOverviewFields,
  buildPipelineOverviewFields,
  type SettingsOverviewScreen,
} from '../copilot-bridge/laura-settings-catalog'
import type { PipelineStageSlaRow } from '../copilot-bridge/deal-stage-sla.port'
import type { contactToCrmInput } from '../crm/contact-crm-mapper'

/**
 * #1931 L2 — les PORTS ÉTROITS par lesquels le routeur atteint les capacités
 * qu'il ne possède pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES PORTS, ET PAS DES IMPORTS
 * ─────────────────────────────────────────────────────────────────────────────
 * GA-07 (`module-boundaries.spec.ts`) est au PLAFOND : 254 imports service →
 * service sur 254, 124 fichiers sur 124 (mesuré le 13/09/2026). Chacun des cinq
 * intents neufs appelle un service métier d'un autre module (messagerie,
 * routines, réglages, mémoire, génération) : les importer depuis
 * `action-router.service.ts` ferait tomber la CI dès le premier.
 *
 * Le motif est celui que ce module emploie déjà pour les agendas
 * (`CALENDAR_BACKENDS`) et que `copilot-bridge` emploie pour les durées cibles
 * (`deal-stage-sla.port.ts`) : le CONSOMMATEUR déclare la forme minimale dont il
 * a besoin, le fichier de MODULE (exclu de GA-07 : c'est de la composition)
 * relie cette forme au vrai service. Aucun import ici ne vise un fichier
 * `*.service` — `import type` compris, qui compte aussi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LES PORTS NE PORTENT PAS — et c'est le point
 * ─────────────────────────────────────────────────────────────────────────────
 * `MailDraftPort` n'a qu'UNE méthode, `createDraft`. La messagerie sait aussi
 * envoyer (`MailboxService.sendBatch`) ; ce port ne l'expose pas. Doctrine : le
 * copilote n'envoie jamais d'e-mail — ce n'est pas une convention, c'est
 * l'ABSENCE de code. `mailDraftPortFrom` construit un objet neuf qui ne
 * contient que `createDraft` : même si on lui passe un service capable
 * d'envoyer, rien d'autre ne traverse (test : `card-effect-ports.spec.ts`).
 */

/** Un seul jeton : l'ensemble des ports, chacun optionnel (un port absent = capacité indisponible, dit comme tel). */
export const ACTION_ROUTER_PORTS = Symbol('ACTION_ROUTER_PORTS')

/** La forme `Result` de `@bellum/utils`, décrite en ligne (aucun type importé d'un service). */
type ResultLike<T> = { type: 'success'; output: T } | { type: 'failure'; problem: { code: string; message: string } }

// ── enrich_contact en file (D4) ─────────────────────────────────────────────

type EnrichmentEnqueueOutcome =
  | { accepted: true; jobId: string; reservationAttached: boolean }
  | { accepted: false; code: string; message: string }

type EnrichmentObservation =
  | { state: 'queued' | 'running'; jobId: string }
  /** `creditsDebited: null` = le job ne l'a pas rapporté (charge utile d'avant L2) — NON MESURÉ, jamais 0. */
  | { state: 'done'; jobId: string; creditsDebited: number | null }
  | { state: 'failed'; jobId: string; code: string; message: string }
  | { state: 'unknown'; jobId: string }

type EnrichmentJobsPort = {
  enqueue(input: {
    contactId: string
    userId: string
    firstName: string
    lastName?: string
    organizationName: string
    /** La réservation que le worker soldera à l'issue (I3). Absente = aucune réservation posée. */
    reservationReference?: string
    /** R4 — l'espace de la réservation, qui voyage avec elle jusqu'au worker. */
    reservationWorkspaceId?: string
  }): Promise<EnrichmentEnqueueOutcome>
  observe(contactId: string, userId: string): Promise<EnrichmentObservation>
}

/** Ce que `ContactEnrichmentService` expose, décrit par sa forme. */
type EnrichmentJobsSource = {
  enqueueWithReservation(
    contactId: string,
    userId: string,
    dto: { first_name: string; last_name?: string; organization_name: string },
    opts: { reservationReference?: string; reservationWorkspaceId?: string },
  ): Promise<ResultLike<{ job_id: string; reservation_attached: boolean }>>
  status(
    contactId: string,
    userId: string,
  ): Promise<ResultLike<{ state: string; job_id: string; result?: { credits_debited?: number } }>>
}

export function enrichmentJobsPortFrom(source: EnrichmentJobsSource): EnrichmentJobsPort {
  return {
    async enqueue(input) {
      const outcome = await source.enqueueWithReservation(
        input.contactId,
        input.userId,
        {
          first_name: input.firstName,
          ...(input.lastName ? { last_name: input.lastName } : {}),
          organization_name: input.organizationName,
        },
        input.reservationReference && input.reservationWorkspaceId
          ? { reservationReference: input.reservationReference, reservationWorkspaceId: input.reservationWorkspaceId }
          : {},
      )
      if (outcome.type === 'failure') {
        return { accepted: false, code: outcome.problem.code, message: outcome.problem.message }
      }
      return { accepted: true, jobId: outcome.output.job_id, reservationAttached: outcome.output.reservation_attached }
    },
    async observe(contactId, userId) {
      const status = await source.status(contactId, userId)
      const jobId = `enrich-${contactId}`
      if (status.type === 'failure') {
        return { state: 'failed', jobId, code: status.problem.code, message: status.problem.message }
      }
      const { state, job_id } = status.output
      if (state === 'queued' || state === 'running') return { state, jobId: job_id }
      if (state === 'done') {
        const debited = status.output.result?.credits_debited
        return { state: 'done', jobId: job_id, creditsDebited: typeof debited === 'number' ? debited : null }
      }
      return { state: 'unknown', jobId: job_id }
    },
  }
}

// ── generate_message ────────────────────────────────────────────────────────

type MessageDraftPort = {
  generate(input: {
    userId: string
    contactId: string
    channel: 'email' | 'linkedin' | 'phone'
    context?: string
  }): Promise<{ subject: string | null; body: string }>
}

/** `IaClient.generateMessage` rend une enveloppe `{ success, data }` — lue défensivement, jamais complétée. */
export function messageDraftPortFrom(ia: {
  generateMessage(input: {
    userId: string
    contactId: string
    channel: string
    context?: string
  }): Promise<{ success: boolean; data: Record<string, unknown> }>
}): MessageDraftPort {
  return {
    async generate(input) {
      const envelope = await ia.generateMessage({
        userId: input.userId,
        contactId: input.contactId,
        channel: input.channel,
        ...(input.context ? { context: input.context } : {}),
      })
      const body = envelope.data?.['body']
      if (!envelope.success || typeof body !== 'string' || body.trim() === '') {
        throw new Error('La génération du brouillon n’a rien rendu d’exploitable.')
      }
      const subject = envelope.data?.['subject']
      return { subject: typeof subject === 'string' && subject.trim() ? subject : null, body }
    },
  }
}

// ── create_mail_draft — UN BROUILLON, AUCUN ENVOI ───────────────────────────

export type MailDraftPort = {
  createDraft(
    userId: string,
    input: { to: string; subject: string; body: string; threadId?: string },
  ): Promise<{ draftId: string; messageId: string | null; threadId: string | null; webUrl: string | null }>
  /** #2277.34, épopée #2771 — le rollback de `createDraft`. Toujours pas d'envoi. */
  deleteDraft(userId: string, draftId: string): Promise<{ deleted: boolean }>
}

/**
 * Ne recopie QUE `createDraft`/`deleteDraft`. Le paramètre est typé par ces
 * deux méthodes : un service qui sait aussi envoyer peut être passé, sa
 * méthode d'envoi ne franchit pas cette fonction.
 *
 * #2394.62 — `messageId`/`threadId` traversent désormais AUSSI (le service
 * `MailboxService.createDraft` les rend déjà, `mailDraftResultSchema` les
 * porte) : `dispatchMailDraft` en a besoin pour la preuve derrière « déposé »
 * (`mailDraftHasProof`) — les jeter ici les aurait rendus invérifiables un pas
 * plus loin.
 */
export function mailDraftPortFrom(mailbox: {
  createDraft(
    userId: string,
    request: {
      to: string
      cc: string[]
      subject: string
      body: string
      threadId?: string
      appendSignature: boolean
      documentIds: string[]
    },
  ): Promise<{ draftId: string; messageId: string | null; threadId: string | null; webUrl: string | null }>
  deleteDraft(userId: string, draftId: string): Promise<{ deleted: boolean }>
}): MailDraftPort {
  return {
    async createDraft(userId, input) {
      const created = await mailbox.createDraft(userId, {
        to: input.to,
        cc: [],
        subject: input.subject,
        body: input.body,
        ...(input.threadId ? { threadId: input.threadId } : {}),
        appendSignature: true,
        documentIds: [],
      })
      return {
        draftId: created.draftId,
        messageId: created.messageId,
        threadId: created.threadId,
        webUrl: created.webUrl,
      }
    },
    async deleteDraft(userId, draftId) {
      return mailbox.deleteDraft(userId, draftId)
    },
  }
}

// ── update_routine ──────────────────────────────────────────────────────────

type RoutinePort = {
  update(
    userId: string,
    key: string,
    patch: { enabled?: boolean; hour?: number; weekday?: number; channel?: 'in_app' | 'email' },
  ): Promise<{ enabled: boolean }>
}

export function routinePortFrom(routines: {
  update(
    userId: string,
    key: string,
    patch: { enabled?: boolean; hour?: number; weekday?: number | null; channel?: 'in_app' | 'email' },
  ): Promise<{ subscription: { enabled: boolean } }>
}): RoutinePort {
  return {
    async update(userId, key, patch) {
      const view = await routines.update(userId, key, patch)
      return { enabled: view.subscription.enabled }
    },
  }
}

// ── update_setting — contre le VRAI catalogue des réglages ──────────────────

export type SettingsField = SettingsOverviewScreen['fields'][number]

type SettingsPort = {
  notificationFields(userId: string): Promise<SettingsField[]>
  writeNotification(userId: string, field: string, value: boolean | number): Promise<void>
  pipelineFields(workspaceId: string): Promise<SettingsField[]>
  writePipelineStage(workspaceId: string, stage: string, days: number): Promise<void>
}

/**
 * Les champs écrivables viennent de `laura-settings-catalog.ts` — le MÊME
 * catalogue que Laura lit avant de proposer. Un réglage vit à un seul endroit
 * (GA-26) : le routeur ne tient aucune liste de champs à lui.
 */
export function settingsPortFrom(deps: {
  notifications: {
    getPreferences(userId: string): Promise<NotificationPreferences>
    updatePreferences(userId: string, patch: Partial<NotificationPreferences>): Promise<unknown>
  }
  stageSla: {
    effectiveFor(workspaceId: string): Promise<readonly PipelineStageSlaRow[]>
    setStageSla(workspaceId: string, stage: string, days: number | null): Promise<unknown>
  }
}): SettingsPort {
  return {
    async notificationFields(userId) {
      return buildNotificationsOverviewFields(await deps.notifications.getPreferences(userId))
    },
    async writeNotification(userId, field, value) {
      await deps.notifications.updatePreferences(userId, { [field]: value } as Partial<NotificationPreferences>)
    },
    async pipelineFields(workspaceId) {
      return buildPipelineOverviewFields(await deps.stageSla.effectiveFor(workspaceId))
    },
    async writePipelineStage(workspaceId, stage, days) {
      await deps.stageSla.setStageSla(workspaceId, stage, days)
    },
  }
}

// ── pin_memory_fact ─────────────────────────────────────────────────────────

type MemoryPort = {
  pinFact(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    fact: string
  }): Promise<{ id: string }>
}

export function memoryPortFrom(memory: {
  pinFact(args: {
    userId: string
    workspaceId: string
    accountId: string | null
    fact: string
    origin?: 'copilot'
  }): Promise<{ id: string }>
}): MemoryPort {
  return {
    async pinFact(args) {
      const pinned = await memory.pinFact({ ...args, origin: 'copilot' })
      return { id: pinned.id }
    },
  }
}

// ── CRM : la porte commune (#4186) ─────────────────────────────────────────

export type CrmContactInput = ReturnType<typeof contactToCrmInput>

/** Ce que la porte commune rend — la forme de `CrmWriteOutcome`, réduite à ce que le routeur lit. */
type CrmWritePortOutcome =
  | { status: 'written'; externalId: string }
  | { status: 'pending'; requestId: string }
  | { status: 'already_done'; requestId: string; externalId: string | null }
  | { status: 'refused'; reason: string }

/**
 * #4186 — la porte COMMUNE (`CrmWriteService.write`), réduite à l'export de
 * contact du routeur. Elle remplace les portes par fournisseur (`crmDoors`) et
 * la porte nue (`crmWriteGate`) : la demande est enregistrée, l'écriture faite
 * par l'adaptateur du fournisseur visé, et son RÉSULTAT consigné — avant, une
 * écriture Pipedrive/Attio/Salesforce restait « approuvée » pour toujours.
 * `user` = auto-approuvé (le clic EST la décision) ; `system` = en attente.
 */
type CrmWritesPort = {
  exportContact(input: {
    userId: string
    provider: string
    payload: CrmContactInput
    origin: 'user' | 'system'
    source?: WriteSource
  }): Promise<CrmWritePortOutcome>
}

export function crmWritesPortFrom(writes: {
  write(input: {
    userId: string
    provider: string
    kind: 'export_contact'
    payload: CrmContactInput
    origin: 'user' | 'system'
    source?: WriteSource
  }): Promise<CrmWritePortOutcome | { status: 'written'; externalId: string; requestId: string | null }>
}): CrmWritesPort {
  return {
    async exportContact(input) {
      const outcome = await writes.write({ ...input, kind: 'export_contact' })
      return outcome.status === 'written' ? { status: 'written', externalId: outcome.externalId } : outcome
    },
  }
}

// ── update_opportunity (#3076, épopée #2858) ────────────────────────────────

type ProjectsPort = {
  /** `null` = opportunité introuvable dans cet espace : le pas se dit bloqué, jamais deviné. */
  updateStage(workspaceId: string, userId: string, projectId: string, stage: string): Promise<boolean>
  updateAmount(workspaceId: string, projectId: string, amount: number): Promise<boolean>
  updateNextStep(workspaceId: string, projectId: string, nextStep: string): Promise<boolean>
  updateRisk(workspaceId: string, projectId: string, risk: string): Promise<boolean>
}

/**
 * Les MÊMES quatre méthodes que `ProjectsController` appelle déjà
 * (`PATCH /projects/:id/stage|amount|btmmp|risks`) : aucune logique neuve, ce
 * port ne fait que les rendre atteignables depuis le routeur sans importer
 * `ProjectsService` dans `action-router.service.ts` (GA-07).
 */
export function projectsPortFrom(projects: {
  updateStage(
    id: string,
    workspaceId: string,
    stage: string,
    lossReason: string | null,
    userId?: string,
  ): Promise<unknown>
  updateAmount(id: string, workspaceId: string, amount: number | null): Promise<unknown>
  updateBtmmp(id: string, workspaceId: string, patch: { nextStep?: string }): Promise<unknown>
  updateRisks(id: string, workspaceId: string, risks: string | null): Promise<unknown>
}): ProjectsPort {
  return {
    async updateStage(workspaceId, userId, projectId, stage) {
      return Boolean(await projects.updateStage(projectId, workspaceId, stage, null, userId))
    },
    async updateAmount(workspaceId, projectId, amount) {
      return Boolean(await projects.updateAmount(projectId, workspaceId, amount))
    },
    async updateNextStep(workspaceId, projectId, nextStep) {
      return Boolean(await projects.updateBtmmp(projectId, workspaceId, { nextStep }))
    },
    async updateRisk(workspaceId, projectId, risk) {
      return Boolean(await projects.updateRisks(projectId, workspaceId, risk))
    },
  }
}

export type ActionRouterPorts = {
  enrichmentJobs?: EnrichmentJobsPort
  messageDrafts?: MessageDraftPort
  mailDrafts?: MailDraftPort
  routines?: RoutinePort
  settings?: SettingsPort
  memory?: MemoryPort
  /** #4186 — la porte commune : tout CRM hors HubSpot (qui garde sa porte interne et sa note). */
  crmWrites?: CrmWritesPort
  projects?: ProjectsPort
}
