import { z } from 'zod'
// #2449 — le niveau d'action se déclare sur une simulation ; la VALEUR vit à un
// seul endroit et ce fichier la lit, il n'en redéfinit pas une seconde.
import { copilotActionLevelSchema } from './copilot-action-level.js'

/**
 * Action Router contract (§3, §8 — « passer de la recommandation à l'exécution »).
 *
 * An {@link ActionIntent} is a typed, discriminated request to EXECUTE one
 * recommendation through an already-connected tool. The router does not
 * reimplement any capability — it dispatches each intent to the existing
 * service (send-email / CRM export / Apollo enrich / internal reminder journal)
 * and reports back an {@link ActionDispatchResult}.
 *
 * Discriminant: `type`. Every intent carries the id of the thing it acts on
 * (`contactId`, or `targetId` for a snooze) — never the underlying fields, so a
 * caller can neither reach a teammate's contact nor inject arbitrary payloads
 * (ownership is re-resolved server-side, exactly like the MCP action surface).
 */

/**
 * The set of executable action types the router can dispatch.
 *
 * The first five shipped with the router. The last three close the gaps the
 * addendum names (p88 « étendre ActionRouter : calendar, CRM objects,
 * notifications ») — each one existed as a capability somewhere in the codebase
 * but had no typed way of being ASKED FOR, so a workflow could not contain it.
 */
export const actionIntentTypeSchema = z.enum([
  'send_email',
  'create_crm_task',
  'enrich_contact',
  'schedule_reminder',
  'snooze',
  /** A real calendar event (attendees, duration) on the connected calendar. */
  'create_calendar_event',
  /** A note on the CRM record's timeline — distinct from a task with a due date. */
  'create_crm_note',
  /** An in-app notification to the run's owner: how a workflow reports back. */
  'notify_user',
  // Added at the END (GA-08) — #1931, the chat-card migration to Action OS.
  // Each of the five names a capability the codebase already has (draft
  // generation, the mailbox draft endpoint, the routine toggle, the settings
  // patch, the pinned-memory endpoint) but that only a chat card could ask
  // for, bypassing this router entirely. Standalone schemas below
  // ({@link generateMessageIntentSchema} and its four siblings) declare their
  // shape; wiring them into {@link actionIntentSchema}'s discriminated union —
  // and into `ActionRouterService`'s dispatch switch, which is exhaustive on
  // that union (`const _exhaustive: never = intent`) — is deliberately left to
  // the lot that adds the dispatch handlers, so this schema-only change can't
  // silently change what the router executes.
  'generate_message',
  'create_mail_draft',
  'update_routine',
  'update_setting',
  'pin_memory_fact',
  // Épopée #2771 (#2277.33 → .37) — le ROLLBACK, absent pour cinq familles de
  // gestes : chacun défait (ou compense) le geste voisin qu'il nomme dans son
  // commentaire, jamais en le supprimant (doctrine « on archive, on ne
  // supprime pas »). Ajoutés à la FIN (GA-08), câblés dans le même lot que
  // leurs cinq `case` (switch exhaustif de `ActionRouterService.dispatchOne`).
  /** Annule un rappel — `snooze` le REPORTE, celui-ci l'ÉTEINT. */
  'cancel_reminder',
  /** Restaure le statut d'un contact à sa valeur d'AVANT une déclaration. */
  'restore_status',
  /** Retire une tâche CRM — REFERME côté CRM (note rectificative), jamais supprimée. */
  'remove_crm_task',
  // #2319.114 (épopée #2985) — CLÔTURER la tâche, distinct de `remove_crm_task` :
  // celui-ci la RETIRE (compensation par note, le fournisseur ne sait pas
  // fermer une tâche depuis ce dépôt) ; celui-là la referme réellement chez le
  // fournisseur qui le sait faire (HubSpot, `hs_task_status: COMPLETED`) — ce
  // que le commentaire de `remove_crm_task` promettait déjà (« se REFERME »)
  // sans jamais l'avoir écrit. Passe par LA MÊME porte d'écriture CRM
  // (`OutboundWriteService`, kind `close_task`) que toute écriture CRM.
  /** Clôture (marque terminée) la tâche CRM créée sous `targetId` (`create_crm_task`). */
  'close_crm_task',
  /** Arrête manuellement une séquence — `stopSequencesFor` l'arrête, mais seulement sur opt-out/rebond. */
  'stop_sequence',
  /** Supprime un brouillon déposé par `create_mail_draft`, dans SA messagerie. */
  'delete_draft',
  // #3076 (épopée #2858) — la carte d'opportunité (`propose_opportunity_update`)
  // rejoint la gouvernance Action OS : câblé dans le même lot que son `case`
  // dans `ActionRouterService.dispatchOne` (switch exhaustif).
  /** Applique un diff figé de champs sur une opportunité (`projects`). */
  'update_opportunity',
])
export type ActionIntentType = z.infer<typeof actionIntentTypeSchema>

/**
 * Identifie la TENTATIVE de dispatch, jamais l'INTENTION (D520 — deux clics,
 * un seul effet).
 *
 * Le piège déjà payé dans ce dépôt (fiche mémoire `deterministic-jobid-trap`,
 * revécu sur `sprint_switches`) : une clé dérivée du CONTENU — « même compte +
 * même type d'intent » — confondrait deux gestes légitimes séparés dans le
 * temps. Envoyer deux relances au même contact à trois semaines d'écart est
 * normal ; ça ne doit jamais se comporter comme le rejeu d'un double clic.
 *
 * La clé est donc une chaîne OPAQUE fournie par l'APPELANT — générée une fois
 * par tentative (un clic, une soumission), et rejouée TELLE QUELLE sur un
 * retry réseau ou une reprise après timeout. `ActionRouterService` ne la
 * dérive jamais lui-même.
 *
 * Optionnelle en lecture : un appelant qui ne la fournit pas garde
 * exactement le comportement d'avant — aucune déduplication, chemin
 * byte-identique. Voir la migration `ActionDispatchIdempotency` pour la
 * contrainte d'unicité qui porte la garantie côté base.
 */
export const actionDispatchIdempotencyKeySchema = z.string().trim().min(1).max(200)

/**
 * CRM back-ends a `create_crm_task` can target.
 *
 * `pipedrive` and `attio` added at the END (GA-08) — #1931: the export card
 * already offers all four (`PendingActions.tsx`'s `CrmProviderId`), so a
 * `create_crm_task` intent aimed at either was rejected by this schema alone
 * while the export action itself already worked. ⚠️ Accepting the value here
 * does not yet make `ActionRouterService.dispatchCrmTask` handle it correctly
 * — its `hubspot ? … : …` branch treats anything else as Salesforce today, so
 * a `pipedrive`/`attio` intent would misroute until the dispatcher is taught
 * the other two providers. No caller constructs such an intent yet (this is a
 * schema-only lot), so nothing dispatches on it in production; flagged for
 * whoever wires `update_routine`/`create_mail_draft`/… into the router next.
 */
export const crmTaskProviderSchema = z.enum(['hubspot', 'salesforce', 'pipedrive', 'attio', 'zoho'])
export type CrmTaskProvider = z.infer<typeof crmTaskProviderSchema>

/**
 * Email back-end for `send_email`. Only the built-in Bellum mailer (Resend /
 * Mailpit) exists today; the field is reserved so future per-mailbox routing
 * (Gmail/Outlook, separate PRs) can be selected without a contract change.
 */
export const emailSendProviderSchema = z.enum(['bellum'])
export type EmailSendProvider = z.infer<typeof emailSendProviderSchema>

/**
 * Send the contact's prepared outreach draft (send-email capability, PR #394).
 * `subject`/`body` are accepted for forward-compat but the dispatch sends the
 * reviewed `email_message` draft — never a fabricated body — so all of #394's
 * guard-rails (ownership, idempotency, suppression/opt-out, cadence) still hold.
 */
export const sendEmailIntentSchema = z.object({
  type: z.literal('send_email'),
  contactId: z.string().guid(),
  subject: z.string().trim().min(1).max(300).optional(),
  body: z.string().trim().min(1).max(20_000).optional(),
  provider: emailSendProviderSchema.optional(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})

/** Create a task/note on a CRM contact's timeline (reuses the CRM export/upsert). */
export const createCrmTaskIntentSchema = z.object({
  type: z.literal('create_crm_task'),
  contactId: z.string().guid(),
  crmProvider: crmTaskProviderSchema,
  note: z.string().trim().min(1).max(5000).optional(),
  dueDate: z.string().datetime().optional(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})

/** Enrich a contact via Apollo (reuses ContactsService.enrichContact → 1 crédit). */
export const enrichContactIntentSchema = z.object({
  type: z.literal('enrich_contact'),
  contactId: z.string().guid(),
  /**
   * Absent — the pre-existing behaviour, unchanged — dispatches synchronously,
   * exactly as today. `'queued'` is reserved for D4 of the lot-4 plan (#1931):
   * the chat card calls enrichment synchronously while the web screen already
   * polls a 202, so a card can block the conversation for the length of the
   * Apollo cascade (30-85s). No caller sets it yet; this field only opens the
   * door in the contract; the queue itself is a router-side change.
   */
  mode: z.literal('queued').optional(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})

/**
 * Schedule a reminder. When a calendar is connected the reminder lands on the
 * REAL calendar; with none connected it degrades to an internal reminder
 * persisted in the action journal with its due date — never a silent no-op, and
 * the degrade is always stated in the result's `reason`.
 *
 * The reminder hangs on a CONTACT or on an ACCOUNT — exactly one of the two
 * (enforced by {@link actionIntentSchema}'s refinement). The account form is what
 * lets a *besoin* be followed up (restitution V2 §7): a need belongs to a company,
 * not to a person, and forcing a contact would mean picking one arbitrarily.
 * Ownership of whichever id is supplied is re-resolved server-side.
 */
export const scheduleReminderIntentSchema = z.object({
  type: z.literal('schedule_reminder'),
  contactId: z.string().guid().optional(),
  accountId: z.string().guid().optional(),
  at: z.string().datetime(),
  note: z.string().trim().min(1).max(2000).optional(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})

/** Snooze a previously-journaled action/reminder until a later time. */
export const snoozeIntentSchema = z.object({
  type: z.literal('snooze'),
  targetId: z.string().guid(),
  until: z.string().datetime(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})

/**
 * Create a real event on the user's connected calendar (Google or Microsoft,
 * whichever is linked). Distinct from `schedule_reminder`: a reminder is a note
 * to self on a due date, an event has a duration and can carry attendees — you
 * do not invite a client to a reminder.
 *
 * No calendar connected → `skipped` with the reason, never a silent internal row
 * pretending to be a meeting.
 */
export const createCalendarEventIntentSchema = z.object({
  type: z.literal('create_calendar_event'),
  accountId: z.string().guid().optional(),
  contactId: z.string().guid().optional(),
  title: z.string().trim().min(1).max(300),
  startsAt: z.string().datetime(),
  durationMinutes: z.number().int().min(5).max(600).default(30),
  /** Guests, by email. Empty = an event on the user's own calendar. */
  attendees: z.array(z.string().email()).max(20).default([]),
  note: z.string().trim().max(5000).optional(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})

/**
 * Write a note on a CRM contact's timeline. `create_crm_task` upserts the record
 * (and may carry a due date); this one only appends a note to an EXISTING
 * relationship — the difference matters for CRM hygiene, where re-upserting a
 * record just to log a call is how duplicates are born.
 */
export const createCrmNoteIntentSchema = z.object({
  type: z.literal('create_crm_note'),
  contactId: z.string().guid(),
  note: z.string().trim().min(1).max(5000),
  /**
   * Identifiant de la fiche côté CRM, quand un pas précédent vient de la créer
   * ou de la retrouver. Absent, le routeur va la CHERCHER par email — et refuse
   * plutôt que de la créer : créer une fiche pour pouvoir y écrire une note est
   * exactement la façon dont naissent les doublons (p28).
   */
  crmRecordId: z.string().trim().min(1).max(120).optional(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})

/**
 * Notify the run's owner in-app. This is how a workflow reports back on
 * something that happened without them: « 3 nouveaux signaux sur SNCF ».
 * Never an external send — a notification is not an email.
 */
export const notifyUserIntentSchema = z.object({
  type: z.literal('notify_user'),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().max(2000).optional(),
  /** In-app destination (`/accounts/…`). Relative by contract: no external URL. */
  link: z.string().trim().max(500).regex(/^\//, 'link must be an in-app path').optional(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * FIVE CHAT-CARD SCHEMAS — #1931 (declared in L1, WIRED in L2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Each mirrors one of `PendingActions.tsx`'s eleven chat-card actions that the
 * lot-4 plan moves onto Action OS's governed pipeline (schedule_reminder,
 * enrich_contact and export_contact_to_crm already route through the six
 * schemas above or a CRM export call; find_accounts/open_screen/
 * prepare_consultant_record have no effect and are excluded by the plan).
 *
 * L1 declared them standalone, ABSENT from `actionIntentSchema`, because the
 * router's dispatch `switch` closes over that union with
 * `const _exhaustive: never = intent`. L2 wires the five into the union AND
 * into the switch in the same change — each `case` calls the existing
 * business service through a narrow port (`action-router/card-effect-ports.ts`,
 * GA-07 is at its ceiling).
 */

/**
 * Generate a message draft for a contact (mirrors the `prepare_message` card —
 * draft GENERATION, never a send: `send_email` above is the only intent that
 * can put something in transit, and only once a human has approved it).
 */
export const generateMessageIntentSchema = z.object({
  type: z.literal('generate_message'),
  contactId: z.string().guid(),
  channel: z.enum(['email', 'linkedin', 'phone']),
  /** The angle Laura suggested — never the final wording, generated server-side. */
  angle: z.string().trim().max(300).optional(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
export type GenerateMessageIntent = z.infer<typeof generateMessageIntentSchema>

/**
 * Drop a draft in the connected mailbox (mirrors `prepare_mail_draft`).
 * Distinct from `send_email`: this writes to a PERSONAL mailbox's Drafts
 * folder (D58), `send_email` sends the reviewed outreach draft — neither one
 * sends on its own account.
 */
export const createMailDraftIntentSchema = z.object({
  type: z.literal('create_mail_draft'),
  to: z.string().trim().email(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20_000),
  // #2394.36 — un thread DÉCLARÉ doit être RÉEL : absent reste autorisé (un
  // nouveau message n'a pas de fil), mais une chaîne vide n'identifierait
  // rien et ne doit plus se glisser comme si c'en était un.
  threadId: z.string().trim().min(1).max(200).optional(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
export type CreateMailDraftIntent = z.infer<typeof createMailDraftIntentSchema>

/**
 * Patch a personal routine's schedule/channel or toggle it (mirrors
 * `toggle_routine`). All three of `hour`/`weekday`/`channel` are optional and
 * a patch carries only what is present — `PATCH /routines/:key` semantics,
 * mirrored here so a caller cannot accidentally overwrite a field it never meant to touch.
 */
export const updateRoutineIntentSchema = z.object({
  type: z.literal('update_routine'),
  key: z.string().trim().min(1).max(100),
  enabled: z.boolean().optional(),
  hour: z.number().int().min(0).max(23).optional(),
  /** ISO convention — 1 = Monday, 7 = Sunday. */
  weekday: z.number().int().min(1).max(7).optional(),
  channel: z.enum(['in_app', 'email']).optional(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
export type UpdateRoutineIntent = z.infer<typeof updateRoutineIntentSchema>

/**
 * Patch one workspace/personal setting (mirrors the `update_setting` card).
 * `screen`/`field` are resolved server-side against the real settings catalog
 * before this intent is ever built — an invented key is refused upstream,
 * never carried this far.
 */
export const updateSettingIntentSchema = z.object({
  type: z.literal('update_setting'),
  screen: z.string().trim().min(1).max(100),
  field: z.string().trim().min(1).max(100),
  newValue: z.union([z.boolean(), z.number()]),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
export type UpdateSettingIntent = z.infer<typeof updateSettingIntentSchema>

/** Pin a fact to the workspace's memory (mirrors `pin_memory_fact`), by the same route as the manual pin in Réglages › Mémoire. */
export const pinMemoryFactIntentSchema = z.object({
  type: z.literal('pin_memory_fact'),
  fact: z.string().trim().min(1).max(2000),
  accountId: z.string().guid().optional(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
export type PinMemoryFactIntent = z.infer<typeof pinMemoryFactIntentSchema>

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ROLLBACK — épopée #2771 (#2277.33 → .37)
 * ─────────────────────────────────────────────────────────────────────────────
 * Chacun des cinq cible, par `targetId`, la ligne (`user_actions` ou
 * `outreach_sequences` selon le cas) que le geste d'origine a produite —
 * exactement comme `snooze` cible l'action qu'il reporte. Aucun ne supprime :
 * un rappel s'ÉTEINT, un statut se RESTAURE (une déclaration de plus, jamais
 * une réécriture muette), une tâche CRM se FERME (note rectificative), une
 * séquence s'ARRÊTE (ses étapes passent `skipped`, jamais retirées), un
 * brouillon non envoyé se retire de SA messagerie sans laisser de trace de
 * son contenu ailleurs que là où il n'a jamais été vu.
 */

/** Annule un rappel programmé (`schedule_reminder`) ou reporté (`snooze`). */
export const cancelReminderIntentSchema = z.object({
  type: z.literal('cancel_reminder'),
  targetId: z.string().guid(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
export type CancelReminderIntent = z.infer<typeof cancelReminderIntentSchema>

/**
 * Restaure le contact ciblé au statut qu'il portait AVANT la déclaration
 * journalisée sous `targetId` (`metadata.previous_status`). Refuse plutôt que
 * de deviner quand cette valeur n'a pas été tracée (JAMAIS de donnée fictive).
 */
export const restoreStatusIntentSchema = z.object({
  type: z.literal('restore_status'),
  targetId: z.string().guid(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
export type RestoreStatusIntent = z.infer<typeof restoreStatusIntentSchema>

/** Retire la tâche CRM créée sous `targetId` (`create_crm_task`). */
export const removeCrmTaskIntentSchema = z.object({
  type: z.literal('remove_crm_task'),
  targetId: z.string().guid(),
  /** Motif du retrait, versé en note rectificative quand le CRM le permet. */
  note: z.string().trim().max(2000).optional(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
export type RemoveCrmTaskIntent = z.infer<typeof removeCrmTaskIntentSchema>

/** Clôture (marque terminée) la tâche CRM créée sous `targetId` (`create_crm_task`). */
export const closeCrmTaskIntentSchema = z.object({
  type: z.literal('close_crm_task'),
  targetId: z.string().guid(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
export type CloseCrmTaskIntent = z.infer<typeof closeCrmTaskIntentSchema>

/** Arrête manuellement une séquence d'outreach (`targetId` = l'id de la séquence). */
export const stopSequenceIntentSchema = z.object({
  type: z.literal('stop_sequence'),
  targetId: z.string().guid(),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
export type StopSequenceIntent = z.infer<typeof stopSequenceIntentSchema>

/** Supprime le brouillon déposé sous `targetId`, l'identifiant rendu par `create_mail_draft`. */
export const deleteDraftIntentSchema = z.object({
  type: z.literal('delete_draft'),
  targetId: z.string().trim().min(1).max(200),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
export type DeleteDraftIntent = z.infer<typeof deleteDraftIntentSchema>

/**
 * Applique le diff FIGÉ d'une carte `propose_opportunity_update` (#3076,
 * épopée #2858) — les mêmes routes que l'écran de l'opportunité
 * (`PATCH /projects/:id/stage|amount|btmmp|risks`), jamais un second chemin
 * d'écriture. `changes` reprend la forme déjà validée par
 * `opportunityUpdateChangeSchema` (`copilot-card.ts`) : ce schéma ne la
 * revalide pas, il la relit telle que la carte l'a figée.
 */
export const updateOpportunityIntentSchema = z.object({
  type: z.literal('update_opportunity'),
  projectId: z.string().min(1),
  projectLabel: z.string().min(1),
  changes: z
    .array(
      z.discriminatedUnion('field', [
        z.object({ field: z.literal('stage'), next: z.string().min(1) }),
        z.object({ field: z.literal('estimated_amount'), next: z.number().nonnegative() }),
        z.object({ field: z.literal('next_step'), next: z.string().trim().min(1).max(2000) }),
        z.object({ field: z.literal('risk'), next: z.string().trim().min(1).max(2000) }),
      ]),
    )
    .min(1),
  idempotencyKey: actionDispatchIdempotencyKeySchema.optional(),
})
export type UpdateOpportunityIntent = z.infer<typeof updateOpportunityIntentSchema>

export type SendEmailIntent = z.infer<typeof sendEmailIntentSchema>
export type CreateCrmTaskIntent = z.infer<typeof createCrmTaskIntentSchema>
export type EnrichContactIntent = z.infer<typeof enrichContactIntentSchema>
export type ScheduleReminderIntent = z.infer<typeof scheduleReminderIntentSchema>
export type SnoozeIntent = z.infer<typeof snoozeIntentSchema>
export type CreateCalendarEventIntent = z.infer<typeof createCalendarEventIntentSchema>
export type CreateCrmNoteIntent = z.infer<typeof createCrmNoteIntentSchema>
export type NotifyUserIntent = z.infer<typeof notifyUserIntentSchema>

/**
 * A single typed action to execute.
 *
 * The refinement keeps `schedule_reminder` honest: it targets a contact OR an
 * account, never both and never neither. Expressing it here (rather than as two
 * intent objects) keeps the discriminant on `type` alone — the router still
 * switches on one key, and a caller can't smuggle a target the server won't check.
 */
export const actionIntentSchema = z
  .discriminatedUnion('type', [
    sendEmailIntentSchema,
    createCrmTaskIntentSchema,
    enrichContactIntentSchema,
    scheduleReminderIntentSchema,
    snoozeIntentSchema,
    createCalendarEventIntentSchema,
    createCrmNoteIntentSchema,
    notifyUserIntentSchema,
    // #1931 L2 — les cinq intents des cartes de chat, câblés EN MÊME TEMPS que
    // leurs cinq `case` dans `ActionRouterService.dispatchOne` (switch exhaustif :
    // un membre ajouté ici sans son handler ne compile pas).
    generateMessageIntentSchema,
    createMailDraftIntentSchema,
    updateRoutineIntentSchema,
    updateSettingIntentSchema,
    pinMemoryFactIntentSchema,
    // Épopée #2771 — les cinq rollbacks, câblés EN MÊME TEMPS que leurs `case`
    // dans `ActionRouterService.dispatchOne` (switch exhaustif).
    cancelReminderIntentSchema,
    restoreStatusIntentSchema,
    removeCrmTaskIntentSchema,
    // #2319.114 — câblé EN MÊME TEMPS que son `case` dans `dispatchOne` (switch exhaustif).
    closeCrmTaskIntentSchema,
    stopSequenceIntentSchema,
    deleteDraftIntentSchema,
    // #3076 — câblé EN MÊME TEMPS que son `case` dans `dispatchOne` (switch exhaustif).
    updateOpportunityIntentSchema,
  ])
  .superRefine((intent, ctx) => {
    if (intent.type !== 'schedule_reminder') return
    const targets = [intent.contactId, intent.accountId].filter(Boolean).length
    if (targets !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'schedule_reminder requires exactly one of contactId or accountId',
        path: ['contactId'],
      })
    }
  })
export type ActionIntent = z.infer<typeof actionIntentSchema>

/**
 * Outcome of a dispatch:
 *  - `done`               — the action was performed;
 *  - `queued`             — accepted, will complete asynchronously;
 *  - `skipped`            — a precondition was not met (tool not connected, no
 *                           credit, already sent, opted out, nothing to act on)
 *                           — never an error;
 *  - `failed`             — an error occurred while executing (exception / 5xx);
 *  - `partial`            — several targets, some succeeded and some did not;
 *  - `cancelled`          — the caller (or an approver) called it off before it ran;
 *  - `awaiting_approval`  — held back until someone approves it;
 *  - `unknown`            — the call timed out: we do NOT know whether the remote
 *                           side applied it. Folding this into `failed` would
 *                           re-run an action that may already have happened
 *                           (duplicate send); folding it into `done` would claim
 *                           a success nobody observed. Saying it is the only
 *                           honest option, and the runner reconciles before any
 *                           retry (addendum final p32).
 */
export const actionDispatchStatusSchema = z.enum([
  'queued',
  'done',
  'failed',
  'skipped',
  'partial',
  'cancelled',
  'awaiting_approval',
  'unknown',
])
export type ActionDispatchStatus = z.infer<typeof actionDispatchStatusSchema>

/**
 * What a dispatch PRODUCED that the caller must show rather than re-derive —
 * #1931 L2. Today a single kind: the text of a generated message draft
 * (`generate_message`). Nothing is persisted by that handler and nothing is
 * sent: the draft exists only in this result, which the copilot card stores
 * as its `result.content`. A discriminated union so a future artifact adds a
 * member instead of loosening this one into `unknown`.
 */
export const actionDispatchArtifactSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('message_draft'),
    channel: z.enum(['email', 'linkedin', 'phone']),
    /** `null` for a channel without a subject line (LinkedIn, phone script). */
    subject: z.string().nullable(),
    body: z.string(),
    /**
     * #3234 (#3211.11) — the angle Laura suggested for THIS draft
     * (`GenerateMessageIntent.angle`), carried through rather than dropped.
     * `null` when none was given. Lets the canonical message this artifact
     * becomes (`outreach_messages.reason`) actually record WHY it was
     * written — the same field `fetch_recent_outreach_for_contact` already
     * reads to refuse an identical relance without a new angle (#3211.1):
     * without this, that gate was comparing against a `reason` nobody ever
     * set for a chat-drafted message.
     */
    angle: z.string().nullable(),
  }),
])
export type ActionDispatchArtifact = z.infer<typeof actionDispatchArtifactSchema>

/**
 * CE QU'UNE CLÉ D'IDEMPOTENCE DÉJÀ RÉCLAMÉE SAIT DIRE (#1959.9, #1959.10).
 *
 * Quand un second geste porte une clé déjà réclamée, le routeur ne réexécute
 * rien — c'est le point. Mais jusqu'ici il rendait « Une action identique
 * (même clé) est déjà en cours de traitement » : personne n'était nommé,
 * aucune heure n'était donnée, et la personne devant l'écran ne savait ni à
 * qui parler ni si l'effet avait eu lieu. Les deux informations existaient
 * déjà en base (`action_dispatch_attempts.user_id`, posé par la migration
 * `ActionDispatchAttemptAuthor`, et `completed_at`) : elles ne sortaient pas.
 *
 * ⚠️ `completedAt: null` veut dire « l'effet est ENCORE EN VOL », jamais
 * « exécuté à une heure qu'on ne connaît pas ». L'heure de la RÉCLAMATION
 * n'est pas l'heure de l'exécution : la rendre afficherait une exécution
 * terminée qui ne l'est pas — « non mesuré n'est jamais 0 », appliqué au temps.
 *
 * ⚠️ `actor: null` veut dire « le système, aucune personne derrière » — c'est
 * VRAI, pas un trou : un séquenceur ou un run de fond dispatchent au même
 * titre qu'un clic. L'écran nomme alors la capacité, jamais un inconnu.
 */
export const actionDispatchClaimSchema = z.object({
  /** Nom lisible de l'auteur de la tentative d'origine ; `null` = système. */
  actor: z.string().nullable(),
  /** ISO 8601 — l'heure RÉELLE d'exécution ; `null` tant que l'effet est en vol. */
  completedAt: z.string().datetime().nullable(),
  /** `true` si celui qui rejoue EST l'auteur d'origine — « vous l'avez déjà lancée ». */
  self: z.boolean(),
})
export type ActionDispatchClaim = z.infer<typeof actionDispatchClaimSchema>

export const actionDispatchResultSchema = z.object({
  /** Echoes the dispatched intent's `type` so a bulk result row is self-describing. */
  type: actionIntentTypeSchema,
  status: actionDispatchStatusSchema,
  /** Human-readable reason — always present for `skipped`/`failed`. */
  reason: z.string().optional(),
  /** External reference produced by the tool (e.g. CRM record id, journal id). */
  externalRef: z.string().optional(),
  /**
   * #1931 L2, invariant I4 — « dépensé » = débit OBSERVÉ. The credits the
   * underlying capability ACTUALLY debited for this dispatch, as reported by
   * the code that ran the guarded debit — never the step's estimate recopied.
   *
   * Absent = this handler never debits (the eight pre-existing intents except
   * `enrich_contact`): the runner then counts 0, which is TRUE for them. `0`
   * present = the capability ran and debited nothing (an enrichment that found
   * nothing) — the case D3 used to count as the estimate.
   */
  creditsDebited: z.number().int().min(0).optional(),
  /** See {@link actionDispatchArtifactSchema}. */
  artifact: actionDispatchArtifactSchema.optional(),
  /**
   * #1959.9 / #1959.10 — présent SEULEMENT quand ce résultat relit une
   * tentative déjà réclamée par ailleurs (double clic, second onglet, second
   * utilisateur). Absent sur un dispatch normal : rien n'a été « déjà lancé ».
   */
  claim: actionDispatchClaimSchema.optional(),
})
export type ActionDispatchResult = z.infer<typeof actionDispatchResultSchema>

/** Upper bound on a single bulk dispatch — mirrors the send-email bulk cap (#394). */
export const ACTION_DISPATCH_BULK_MAX = 50

export const dispatchBulkRequestSchema = z.object({
  intents: z.array(actionIntentSchema).min(1).max(ACTION_DISPATCH_BULK_MAX),
})
export type DispatchBulkRequest = z.infer<typeof dispatchBulkRequestSchema>

/**
 * #2400.5 / #2449.29 — LE DRY RUN : les mêmes gestes, et le NIVEAU qu'on veut
 * éprouver.
 *
 * Le niveau est OBLIGATOIRE ici, alors qu'il est optionnel sur un dispatch :
 * une simulation sans niveau n'a rien à simuler, et retomber sur un défaut
 * ferait passer pour un verdict ce qui n'est qu'une supposition. C'est la même
 * discipline que « non mesuré n'est jamais 0 », appliquée à une question.
 */
export const simulateActionLevelRequestSchema = dispatchBulkRequestSchema.extend({
  actionLevel: copilotActionLevelSchema,
})
export type SimulateActionLevelRequest = z.infer<typeof simulateActionLevelRequestSchema>

export const dispatchBulkResponseSchema = z.object({
  results: z.array(actionDispatchResultSchema),
  /** Per-status tally so the UI can summarise a bulk run at a glance. */
  summary: z.object({
    total: z.number().int().nonnegative(),
    done: z.number().int().nonnegative(),
    queued: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  }),
})
export type DispatchBulkResponse = z.infer<typeof dispatchBulkResponseSchema>
