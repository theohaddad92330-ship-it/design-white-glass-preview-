import { z } from 'zod'
import { APPROVAL_TTL_MS, approvalStateSchema, workflowRunStatusSchema } from './action-os.js'
import {
  createMailDraftIntentSchema,
  crmTaskProviderSchema,
  generateMessageIntentSchema,
  pinMemoryFactIntentSchema,
  scheduleReminderIntentSchema,
} from './action-router.js'
import { compiledNeedSchema } from './need-compilation.js'
import { lauraContextModeSchema } from './laura-context-mode.js'
import { dayClosureSchema } from './day-closure.js'
import { PROJECT_STAGES } from './project.js'
import { COMMERCIAL_TRANSITION_EVIDENCE_KEYS } from './commercial-state-machine.js'
import { missionAmendmentEventTypeSchema, missionPauseCauseSchema } from './mission-amendment.js'
import { focusPlanSchema, focusWeekPlanSchema } from './focus-plan.js'
import { FEEDBACK_MESSAGE_MAX } from './beta-feedback-limits.js'
import { leadDismissReasonSchema } from './qualification-lead.js'

/**
 * Copilot cards — #1931/#1930/#1943/#1952/#1959, lot 4's foundation.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS, AND WHAT IT ISN'T YET
 * ─────────────────────────────────────────────────────────────────────────────
 * Louis's 12/09 decision: every action card the chat proposes moves onto
 * Action OS — a card BECOMES a `workflow_runs` row (`trigger = 'copilot_proposal'`),
 * so it survives a reload instead of living only in a chat response's
 * `context.pending_actions` (D1 of the lot-4 plan). This file is the reading
 * of that object: what Laura can propose (`pendingChatActionSchema`, mirrored
 * byte-for-byte from `apps/ia/app/services/chat_tools.py`), what a card shows
 * before anyone clicks (`cardPreviewSchema`, #1930's eight lines), and what
 * NAME its state carries at any moment (`cardStateOf`, #1931's nine names plus
 * three the lot-4 plan adds).
 *
 * Nothing here is called by production code yet — no route reads or writes a
 * `workflow_runs.preview`/`.result` column, no controller builds a
 * `copilotCardView`. That is L2 (Action OS engine) and L3 (the conversation
 * bridge). This lot only makes the shape exist and PROVES it against its two
 * real sources of truth: the Python tool literals, and the TSX union that
 * renders them today.
 */

// ── What Laura can propose (mirrors `PendingActions.tsx`'s `PendingChatAction`) ──

/**
 * The twelve action shapes `apps/ia/app/services/chat_tools.py` emits under
 * `_proposal()`, TYPED IN ZOD FOR THE FIRST TIME.
 *
 * ⚠️ Until now this contract existed ONLY as a TypeScript union in
 * `PendingActions.tsx`, cast onto the AI's raw JSON without validation —
 * `chat-actions-cross-language.test.ts`'s own docblock says so: « rien ne
 * valide le JSON de l'IA à l'exécution ». This schema does not change that
 * fact by itself (nothing calls `.parse()` on live traffic yet — that wiring
 * is L3's), but it gives L3 something to call.
 *
 * Field choices, and why they stay LOOSE rather than maximally strict:
 *  - id-like fields (`contact_id`, `account_id`…) are non-empty strings, not
 *    `.guid()` — this is the FIRST validation ever applied to a model's raw
 *    tool output, and over-constraining it would turn a slightly-malformed
 *    but recoverable id into a hard parse failure instead of a display bug.
 *  - `at` (the reminder time) is a non-empty string, not `.datetime()`, for
 *    the same reason.
 *  - Snake_case keys are the exact wire shape emitted by Python — matching
 *    `PendingChatAction`'s own docblock convention.
 *  - FREE-TEXT fields that become an intent field are LENGTH-BOUNDED by that
 *    intent field's own limit (R7, security review 13/09/2026): a proposal is
 *    persisted as-is (`workflow_runs.proposal`) and rewritten by « Modifier »,
 *    so an unbounded body was stored before the intent could refuse it. The
 *    limit is READ from the intent schema (`lengthCapOf`), never copied.
 *
 * Literal count and spelling are proven against `chat_tools.py` by
 * `copilot-card.test.ts` (`emittedActions` there mirrors
 * `chat-actions-cross-language.test.ts`'s own extractor) — a twelfth literal
 * added to either side without the other fails that test, not silently.
 */
/**
 * R7 — la borne d'un champ proposé est CELLE du champ d'intent qu'il devient, lue
 * sur ce schéma (un réglage vit à un seul endroit, GA-26). Un champ d'intent sans
 * borne ne peut pas en donner une : le module refuse de se charger plutôt que de
 * laisser passer une proposition non bornée.
 */
function lengthCapOf(schema: z.core.$ZodType): number {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) return lengthCapOf(schema.unwrap())
  if (schema instanceof z.ZodString && schema.maxLength !== null) return schema.maxLength
  throw new Error('copilot-card : un champ d’intent sans borne de longueur ne peut pas borner une proposition')
}
const MESSAGE_ANGLE_MAX = lengthCapOf(generateMessageIntentSchema.shape.angle)
const REMINDER_NOTE_MAX = lengthCapOf(scheduleReminderIntentSchema.shape.note)
const MAIL_DRAFT_SUBJECT_MAX = lengthCapOf(createMailDraftIntentSchema.shape.subject)
const MAIL_DRAFT_BODY_MAX = lengthCapOf(createMailDraftIntentSchema.shape.body)
const MAIL_DRAFT_THREAD_ID_MAX = lengthCapOf(createMailDraftIntentSchema.shape.threadId)
const PINNED_FACT_MAX = lengthCapOf(pinMemoryFactIntentSchema.shape.fact)
/**
 * D1 — la phrase de raison n'alimente AUCUN champ d'intent (la carte d'analyse
 * n'est pas dispatchée par le routeur, voir `copilot-card-catalog.ts`) : elle ne
 * peut donc pas emprunter sa borne à un schéma d'intent comme les autres. Elle
 * est bornée pour la même raison que R7 — une sortie de modèle est persistée
 * telle quelle — sur la borne d'une ligne de prévisualisation (`whatWillHappen`).
 */
const ANALYSIS_REASON_MAX = 500

const CONTACT_CHANNEL = z.enum(['email', 'linkedin', 'phone'])
const ROUTINE_CHANNEL = z.enum(['in_app', 'email'])

/**
 * #1950.22 — LA DÉPENDANCE D'UNE ÉTAPE, DÉCLARÉE PAR LE MODÈLE.
 *
 * Les rangs (0-based, ceux de `pending_actions`, donc le `proposalIndex` d'une
 * carte) des propositions de la MÊME réponse dont celle-ci a besoin. Absent =
 * aucune dépendance : le rang seul n'en crée jamais (#1950.14 revient sur
 * 1950.3 pour l'exécution enchaînée, pas pour ça — une dépendance devinée
 * griserait un geste légitime). La lecture — qui est bloquée, qui attend — vit
 * dans `copilot-plan.ts` (`planStepsOf`), à un seul endroit (GA-26).
 *
 * Une déclaration malformée rend la proposition invalide (comptée, jamais
 * complétée) plutôt que d'effacer en silence une dépendance que le modèle a
 * voulu poser : une étape qui partirait derrière un prérequis échoué est
 * précisément ce que #1950.22 interdit.
 */
const PLAN_DEPENDS_ON = z.array(z.number().int().min(0).max(49)).max(10).optional()

const prepareMessageActionSchema = z.object({
  action: z.literal('prepare_message'),
  depends_on: PLAN_DEPENDS_ON,
  contact_id: z.string().min(1),
  contact_name: z.string().nullable().optional(),
  contact_title: z.string().nullable().optional(),
  account_id: z.string().nullable().optional(),
  channel: CONTACT_CHANNEL,
  angle: z.string().max(MESSAGE_ANGLE_MAX).nullable().optional(),
  cost_credits: z.number().min(0).optional(),
  sends_email: z.boolean().optional(),
})

/**
 * #3894.3 — c74 assoupli le 10/10/2026 (Louis) : un message s'adresse à UN contact
 * par défaut ; à PLUSIEURS seulement sur demande EXPLICITE (« pour Marie et Paul »,
 * « pour les 3 décideurs »). Miroir de `chat_tools.py::prepare_message_for_contacts`.
 * Le schéma dit NON à ce qui n'est pas une demande de plusieurs personnes : moins de
 * deux destinataires distincts, ou l'attestation `explicit_multi_contact` absente.
 * Aucun envoi : chaque destinataire devient sa propre carte « préparer un message »,
 * validable séparément (`PendingActions.tsx`). `skipped` NOMME ceux que les garde-fous
 * du tool unitaire (opt-out, relance identique, collègue actif) ont écartés.
 */
export const MESSAGE_AUDIENCE_MAX_RECIPIENTS = 10

const prepareMessageAudienceActionSchema = z.object({
  action: z.literal('prepare_message_audience'),
  depends_on: PLAN_DEPENDS_ON,
  explicit_multi_contact: z.literal(true),
  channel: CONTACT_CHANNEL,
  angle: z.string().max(MESSAGE_ANGLE_MAX).nullable().optional(),
  recipients: z
    .array(
      z.object({
        contact_id: z.string().min(1),
        contact_name: z.string().nullable().optional(),
        contact_title: z.string().nullable().optional(),
        account_id: z.string().nullable().optional(),
      }),
    )
    .min(2)
    .max(MESSAGE_AUDIENCE_MAX_RECIPIENTS)
    .refine(list => new Set(list.map(r => r.contact_id)).size === list.length, 'Destinataires en double'),
  skipped: z
    .array(z.object({ contact_name: z.string().nullable().optional(), reason: z.string().max(400) }))
    .max(MESSAGE_AUDIENCE_MAX_RECIPIENTS)
    .optional(),
  cost_credits: z.number().min(0).optional(),
  sends_email: z.boolean().optional(),
})

const scheduleReminderActionSchema = z.object({
  action: z.literal('schedule_reminder'),
  depends_on: PLAN_DEPENDS_ON,
  contact_id: z.string().min(1),
  contact_name: z.string().nullable().optional(),
  account_id: z.string().nullable().optional(),
  at: z.string().min(1),
  note: z.string().max(REMINDER_NOTE_MAX).nullable().optional(),
  cost_credits: z.number().min(0).optional(),
  /**
   * #1958.18 — RDV INTERNATIONAL. Déjà calculés côté outil
   * (`resolve_applicable_timezone`, `chat_tools.py:3699-3716`) : `timezone` est
   * le fuseau RÉELLEMENT retenu par l'escalier personne → rendez-vous → espace
   * → défaut ; `contact_timezone` est celui, propre au contact visé, qui a pu
   * y contribuer — rapporté même quand il ne décide pas, pour que Laura puisse
   * signaler l'écart (« 9 h, heure de Paris — Claire est à Montréal »).
   * Absents des DEUX côtés = rien de réglé nulle part, comportement d'avant
   * ce champ à l'identique — jamais un fuseau deviné.
   */
  timezone: z.string().nullable().optional(),
  contact_timezone: z.string().nullable().optional(),
})

const enrichContactActionSchema = z.object({
  action: z.literal('enrich_contact'),
  depends_on: PLAN_DEPENDS_ON,
  contact_id: z.string().min(1),
  contact_name: z.string().min(1),
  contact_title: z.string().nullable().optional(),
  account_id: z.string().nullable().optional(),
  /** Server-resolved org anchor — required, never guessed (see `PendingActions.tsx`). */
  organization_name: z.string().min(1),
  /** LOT (15/10) DATA-B.5 — « e-mail seul » / « téléphone seul » : la coordonnée que la fiche n'a pas encore.
   *  Absent = les deux (comportement d'avant). Posé par l'outil, relayé tel quel à `POST contacts/:id/enrich`. */
  only: z.enum(['email', 'phone']).optional(),
  cost_credits: z.number().min(0).optional(),
  credit_kind: z.string().optional(),
})

const exportContactToCrmActionSchema = z.object({
  action: z.literal('export_contact_to_crm'),
  depends_on: PLAN_DEPENDS_ON,
  contact_id: z.string().min(1),
  /** The four CRMs the export card already targets — same schema as the router's. */
  provider: crmTaskProviderSchema,
  contact_name: z.string().nullable().optional(),
  contact_email: z.string().nullable().optional(),
  contact_title: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  account_id: z.string().nullable().optional(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * Épopée #2955 (#2394.6/.19/.43) — le writeback CRM depuis un fil de
 * messagerie : une NOTE sur une fiche DÉJÀ présente dans le CRM, jamais un
 * export (`export_contact_to_crm`, juste au-dessus, reste le seul chemin qui
 * crée ou met à jour une fiche entière). `note` est un texte RÉDIGÉ par le
 * modèle — même statut qu'`action.note` sur `schedule_reminder` — soumis à
 * relecture avant tout départ, jamais une écriture faite.
 */
const proposeCrmNoteActionSchema = z.object({
  action: z.literal('propose_crm_note'),
  depends_on: PLAN_DEPENDS_ON,
  contact_id: z.string().min(1),
  contact_name: z.string().nullable().optional(),
  account_id: z.string().nullable().optional(),
  note: z.string().min(1).max(5000),
  /** Le fil qui motive la note, quand elle vient de `search_mailbox` — jamais requis au dispatch (`create_crm_note` n'en a pas besoin), gardé pour le contexte affiché. */
  thread_id: z.string().nullable().optional(),
  cost_credits: z.number().min(0).optional(),
})

const prepareMailDraftActionSchema = z.object({
  action: z.literal('prepare_mail_draft'),
  depends_on: PLAN_DEPENDS_ON,
  to: z.string().min(1),
  subject: z.string().min(1).max(MAIL_DRAFT_SUBJECT_MAX),
  body: z.string().min(1).max(MAIL_DRAFT_BODY_MAX),
  thread_id: z.string().max(MAIL_DRAFT_THREAD_ID_MAX).optional(),
  /**
   * #2104.26 — le ton DÉCLARÉ par le modèle, jamais déduit du corps. Même
   * règle que `prepare_campaign.tone` (#1935.6) : posé UNIQUEMENT quand
   * l'utilisateur l'a précisé — absent, l'aperçu n'affiche aucune ligne
   * plutôt qu'un ton deviné.
   */
  tone: z.string().nullable().optional(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * G.1 (recette R3 19/10) — « crée un événement demain 23 h » : Laura PRÉPARE l'événement (une carte à valider, comme
 * le brouillon), il se crée au clic sur l'agenda BRANCHÉ (`create_calendar_event`, le routeur d'actions). Elle ne crée
 * rien d'elle-même et n'invite personne sans validation. `starts_at` est une date-heure ISO ; l'agenda de l'espace
 * (Google ou Outlook) est résolu au dispatch, jamais choisi ici.
 */
const prepareCalendarEventActionSchema = z.object({
  action: z.literal('prepare_calendar_event'),
  depends_on: PLAN_DEPENDS_ON,
  title: z.string().min(1).max(300),
  starts_at: z.string().datetime({ offset: true }),
  duration_minutes: z.number().int().min(5).max(600).optional(),
  attendees: z.array(z.string().email()).max(20).optional(),
  note: z.string().max(5000).optional(),
  cost_credits: z.number().min(0).optional(),
})

const findAccountsActionSchema = z.object({
  action: z.literal('find_accounts'),
  depends_on: PLAN_DEPENDS_ON,
  sectors: z.array(z.string()).optional(),
  signals: z.array(z.string()).optional(),
  department: z.string().optional(),
  /**
   * #3876.5 (lot M13, 09/10) — une VILLE, sous le nom canonique de sa commune
   * (résolue par la source officielle côté `chat_tools.py`, jamais devinée).
   * Découvrir la borne à la commune (`?city=`, champ « Ville ») : chercher à
   * Marseille ne devient plus, en silence, chercher dans tout le 13.
   */
  city: z.string().optional(),
  /**
   * #3392 (reste, recette prod 30/09) — codes de région INSEE (ex. `84` pour
   * Auvergne-Rhône-Alpes), même vocabulaire que `REGISTRY_REGIONS`
   * (`discover-registry-vocab.ts`) et `_DISCOVER_REGIONS` (`chat_tools.py`,
   * GA-26). Sans ce champ, la seule contrainte géographique LARGE qu'un
   * profil ESN puisse déclarer (un territoire, pas un département) ne
   * pouvait jamais voyager jusqu'à Découvrir.
   */
  region: z.array(z.string()).optional(),
  headcount: z.string().optional(),
  keywords: z.string().optional(),
  cost_credits: z.number().min(0).optional(),
  /**
   * #2454.4/.5/.9 — le mode de contexte RÉSOLU du tour (`chat.py`,
   * `req.context_mode`), relayé tel quel par `chat_tools.py`. `discoverSearch`
   * (apps/web) le pose en `?context=` sur le lien Découvrir : le clic ne perd
   * plus le mode que la personne avait choisi. Absent = aucun mode connu pour
   * ce tour, jamais deviné.
   */
  context_mode: lauraContextModeSchema.optional(),
  /**
   * #3941.1 — le préréglage « Startup » de Découvrir (moins de 8 ans, SAS/SASU,
   * PME — `discover-query.ts::applyStartupSegment`), posé par `chat_tools.py`
   * quand la demande nomme une startup. Jamais un critère de levée de fonds :
   * aucune source ne permet de CHERCHER par levée, seulement de l'annoncer sur
   * un résultat déjà trouvé (signal `funding`).
   */
  company_profile: z.literal('startup').optional(),
})

const openScreenActionSchema = z.object({
  action: z.literal('open_screen'),
  depends_on: PLAN_DEPENDS_ON,
  route: z.string().min(1),
  label: z.string().min(1),
  highlight: z.string().optional(),
  cost_credits: z.number().min(0).optional(),
})

const prepareConsultantRecordActionSchema = z.object({
  action: z.literal('prepare_consultant_record'),
  depends_on: PLAN_DEPENDS_ON,
  route: z.string().min(1),
  full_name: z.string().min(1),
  available_from: z.string().optional(),
  note: z.string().optional(),
  cost_credits: z.number().min(0).optional(),
})

const toggleRoutineActionSchema = z.object({
  action: z.literal('toggle_routine'),
  depends_on: PLAN_DEPENDS_ON,
  key: z.string().min(1),
  label: z.string().nullable().optional(),
  enabled: z.boolean(),
  hour: z.number().optional(),
  /** ISO convention — 1 = Monday, 7 = Sunday (see `PendingActions.tsx`). */
  weekday: z.number().optional(),
  channel: ROUTINE_CHANNEL.optional(),
  cost_credits: z.number().min(0).optional(),
})

const updateSettingActionSchema = z.object({
  action: z.literal('update_setting'),
  depends_on: PLAN_DEPENDS_ON,
  screen: z.string().min(1),
  field: z.string().min(1),
  field_label: z.string().nullable().optional(),
  old_value: z.union([z.boolean(), z.number()]).nullable().optional(),
  new_value: z.union([z.boolean(), z.number()]),
  cost_credits: z.number().min(0).optional(),
})

const pinMemoryFactActionSchema = z.object({
  action: z.literal('pin_memory_fact'),
  depends_on: PLAN_DEPENDS_ON,
  fact: z.string().min(1).max(PINNED_FACT_MAX),
  account_id: z.string().optional(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * D1 — décision Louis 14/09/2026 : PROPOSER UNE ANALYSE EST UNE CARTE.
 *
 * Mesuré en production le 14/09 à 15:56, « propose seulement » rendait de la
 * prose : le coût, le statut du dossier et deux options, tout sauf le geste.
 * La douzième forme porte les mêmes faits ET le bouton — le clic est la
 * décision, rien n'est lancé ni débité sans lui.
 *
 * ⚠️ `action` porte le nom de l'OUTIL qui s'exécutera (`start_account_analysis`),
 * comme `enrich_contact` — pas celui de l'outil qui a préparé la carte.
 *
 * ⚠️ Les nombres sont OPTIONNELS et jamais `.default(0)` : le pont les rend
 * quand il les connaît, et « non mesuré » n'est pas « mesuré à zéro »
 * (GA-18/GA-19). `analysed_at` `null` veut dire « jamais analysé », pas
 * « analysé à une date inconnue ».
 *
 * `plan_token` est la PREUVE qu'une préparation a eu lieu (HMAC 30 min émis par
 * `copilot-bridge.controller.ts::analysisPlan`) : sans lui la carte n'a rien à
 * lancer. Il ne porte aucun pouvoir que le porteur du JWT n'ait déjà — la route
 * de lancement de l'écran exige la même permission `analysis:run`.
 */
const startAccountAnalysisActionSchema = z.object({
  action: z.literal('start_account_analysis'),
  depends_on: PLAN_DEPENDS_ON,
  company: z.string().min(1),
  account_id: z.string().nullable().optional(),
  /** ISO date of the existing dossier, `null` when the account was never analysed. */
  analysed_at: z.string().nullable().optional(),
  plan_token: z.string().min(1),
  preset: z.string().nullable().optional(),
  /** The model's own one-line justification for THIS account — shown as its sentence, never as a fact. */
  reason: z.string().max(ANALYSIS_REASON_MAX).nullable().optional(),
  cost_credits: z.number().min(0).optional(),
  credits_left: z.number().min(0).optional(),
  /** Balance AFTER the launch, subtracted server-side: the screen never holds a second truth. */
  credits_left_after: z.number().min(0).optional(),
  /**
   * #1957.3 — the number of sources/objects this run targets, shown next to
   * the cost, on the SAME card. Positive-only by construction: the bridge
   * only emits this key when it has a real measurement (contacts already on
   * file for a KNOWN account, `analysisPlan`), never a guessed zero. "Not
   * measured" is not "measured at zero" (GA-18/GA-19) — a brand-new account
   * simply omits the key, it never carries `0`.
   */
  objects_count: z.number().int().positive().optional(),
})

/**
 * #1995 — décision Louis 14/09/2026 : la fiche d'une personne que seul le CRM
 * connecté connaît se crée sur geste de l'utilisateur.
 *
 * ⚠️ Aucun `contact_id` : la fiche n'existe PAS encore, c'est tout le problème.
 * Les champs sont ceux que le CRM a donnés, repris tels quels — le serveur
 * refuse le doublon (e-mail puis nom) et l'ambiguïté, il ne fusionne jamais.
 *
 * Le clic emprunte la route de l'écran (`POST /accounts/:id/contacts/from-crm`),
 * pas le routeur d'actions : comme `start_account_analysis`, lui inventer un
 * intent ferait un second chemin d'écriture à côté de celui qui existe.
 */
const createContactFromCrmActionSchema = z.object({
  action: z.literal('create_contact_from_crm'),
  depends_on: PLAN_DEPENDS_ON,
  account_id: z.string().min(1),
  /** Le nom CANONIQUE du dossier possédé, résolu server-side — jamais celui tapé dans la conversation. */
  company: z.string().min(1),
  full_name: z.string().min(1),
  job_title: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  /** L'identifiant de la ligne CRM d'origine — la trace de provenance, jamais un id Bellum. */
  crm_reference: z.string().nullable().optional(),
  cost_credits: z.number().min(0).optional(),
  /**
   * #1995 bis — le rappel demandé sur CETTE personne, en attente que le clic
   * de création révèle un `contact_id` (`schedule_reminder_for_contact` reste
   * hors de portée jusque-là). `null`/absent = aucun rappel demandé dans le
   * message d'origine — jamais une date inventée pour « faire complet ».
   */
  pending_reminder_at: z.string().min(1).nullable().optional(),
  pending_reminder_note: z.string().max(REMINDER_NOTE_MAX).nullable().optional(),
})

/**
 * Épopée #2853 (#2157.1) — « Créer une cible » depuis Laura : la même
 * capacité que le dossier compte (`useCreateTargetFromAccount.ts`, #2164.44),
 * accessible depuis la conversation — jamais un second moteur de création.
 *
 * ⚠️ `account_id` est celui d'un compte du PORTEFEUILLE, résolu server-side
 * (comme `create_contact_from_crm` ci-dessus) : `company` est le nom
 * CANONIQUE du dossier, jamais celui tapé dans la conversation. Aucune
 * écriture ici — l'outil IA relit le compte et propose ; c'est le clic qui
 * appelle `POST /target-lists` puis `POST /target-lists/:id/items`
 * (`targetListsApi`, réutilisé tel quel, GA-26).
 *
 * `source`/`provenance: 'laura'` (jamais `'analysis'`) : née d'une
 * conversation, pas d'un dossier compte déjà ouvert — les deux surfaces sont
 * routées séparément par #2853.
 */
const createTargetListFromAccountActionSchema = z.object({
  action: z.literal('create_target_list_from_account'),
  depends_on: PLAN_DEPENDS_ON,
  account_id: z.string().min(1),
  /** Le nom CANONIQUE du dossier possédé, résolu server-side. */
  company: z.string().min(1),
  /** Le nom de LISTE demandé dans la conversation. `null`/absent retombe sur un nom générique. */
  name: z.string().min(1).nullable().optional(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * Épopée #2781 (#2150.30, LOT j1 26/09) — « Ajouter au portefeuille » depuis
 * Laura : LA MÊME porte que #2150.32 (CRM, `useAddCrmCompanyToPortfolio.ts`)
 * et #2150.42 (recherche globale, `useAddAccountToPortfolio.ts`) —
 * `POST /accounts/portfolio` (`accountsApi.addToPortfolio`), réutilisée telle
 * quelle (GA-26). Décision « tranché sans Louis » : UNIFORMITÉ avec les deux
 * portes déjà livrées plutôt qu'un régime à part façon
 * `c84_analyse_recherche_enrichissement_partent_sans_carte` — ADD attribue le
 * compte à son commercial (une ÉCRITURE), ce n'est pas une lecture interne :
 * elle garde donc sa carte de confirmation, même famille que
 * `create_target_list_from_account` ci-dessus.
 *
 * Aucune écriture côté outil IA : `company_name` est repris TEL QUEL depuis la
 * conversation (pas de résolution server-side, contrairement à
 * `create_target_list_from_account` qui relit un compte déjà POSSÉDÉ) — c'est
 * le clic qui appelle réellement `POST /accounts/portfolio`, dédoublonnage
 * SIREN/nom compris.
 */
const addAccountToPortfolioActionSchema = z.object({
  action: z.literal('add_account_to_portfolio'),
  depends_on: PLAN_DEPENDS_ON,
  company_name: z.string().min(1),
  /** Facultatifs — repris SEULEMENT si déjà cités dans la conversation. */
  siren: z.string().min(1).nullable().optional(),
  sector: z.string().min(1).nullable().optional(),
  website: z.string().min(1).nullable().optional(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * #1903.10 / #1935 — LAURA PRÉPARE UNE CAMPAGNE : objectif, audience, persona,
 * relation, canal, ton.
 *
 * ⚠️ Aucune écriture, comme `find_accounts` : le clic n'appelle rien, il ouvre
 * l'écran Séquences déjà pré-rempli, où la création reste un geste PAR CONTACT
 * avec le brouillon de chaque étape relisible avant le premier clic (#1935.24).
 *
 * `excluded` porte les contacts que la conversation a cités mais que l'audience
 * ÉCARTE, avec la raison : un contact retiré en silence se relit comme un
 * oubli, et le commercial le rajouterait à la main sans savoir pourquoi il
 * n'était pas là.
 */
const prepareCampaignActionSchema = z.object({
  action: z.literal('prepare_campaign'),
  depends_on: PLAN_DEPENDS_ON,
  objective: z.string().min(1),
  persona: z.string().nullable().optional(),
  /** Le persona a été DÉDUIT de l'audience, il n'a pas été demandé — se dit à l'écran. */
  persona_derived: z.boolean().optional(),
  relation: z.string().nullable().optional(),
  channels: z.array(z.string()).optional(),
  tone: z.string().nullable().optional(),
  mode: z.string().optional(),
  template: z.string().nullable().optional(),
  /** `sequence_campaign`, ou `call_list` quand SEUL le téléphone est visé (#1935.14). */
  output_kind: z.string().optional(),
  /**
   * #2367.16 — 6 des 13 dimensions du contrat d'intention (LAU-FINAL-082)
   * n'avaient pas de champ NOMMÉ : nombre annoncé, urgence, niveau d'autonomie
   * voulu, résultat attendu, durée envisagée, besoin de connecteur déclaré.
   * Même règle que `relation`/`tone` : posées par `chat_tools.py::prepare_campaign`
   * UNIQUEMENT quand la personne les a dites — jamais une valeur devinée.
   */
  expected_count: z.number().int().nonnegative().optional(),
  urgency: z.string().nullable().optional(),
  autonomy_level: z.string().nullable().optional(),
  expected_outcome: z.string().nullable().optional(),
  duration: z.string().nullable().optional(),
  needs_connector: z.boolean().optional(),
  contacts: z.array(
    z.object({
      contact_id: z.string().min(1),
      full_name: z.string().nullable().optional(),
      title: z.string().nullable().optional(),
      account_id: z.string().nullable().optional(),
      account_name: z.string().nullable().optional(),
      has_email: z.boolean().optional(),
      has_phone: z.boolean().optional(),
    }),
  ),
  excluded: z
    .array(
      z.object({
        contact_id: z.string().optional(),
        full_name: z.string().nullable().optional(),
        reason: z.string().min(1),
      }),
    )
    .optional(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * #2322 — LAURA A COMPILÉ UN BESOIN depuis une source (un email, un compte
 * rendu, une transcription, des notes de terrain, une fiche CRM collée).
 *
 * ⚠️ Carte de NAVIGATION, comme `find_accounts` et `prepare_campaign` : le clic
 * n'écrit RIEN, il ouvre le créateur de besoin sur le bon compte. La création
 * reste le geste de la personne, sur l'écran qui la fait déjà — lui inventer un
 * intent de routeur ferait un SECOND chemin d'écriture à côté de
 * `POST /projects/needs`.
 *
 * ⚠️ `compiled` porte TOUT ce que la source disait, avec la citation de chaque
 * champ : c'est la carte qui se lit, pas le formulaire qui s'ouvre. Et
 * `dropped` dit ce qui a été ÉCARTÉ — une extraction silencieusement amputée
 * est pire qu'une extraction refusée.
 */
const compileNeedActionSchema = z.object({
  action: z.literal('compile_need'),
  depends_on: PLAN_DEPENDS_ON,
  compiled: compiledNeedSchema,
  /** Ce que le compilateur a jeté, et pourquoi (`sans_extrait`, `champ_inconnu`,
   *  `valeur_inattendue`, `conversion_interdite`). Vide = rien n'a été écarté. */
  dropped: z.array(z.object({ field: z.string().min(1), reason: z.string().min(1) })).optional(),
  /** Les comptes qui portent le MÊME nom, quand le rapprochement n'a pas pu
   *  trancher (#2322.16). On ne choisit pas le plus proche : on demande. */
  account_candidates: z.array(z.object({ account_id: z.string().min(1), company_name: z.string().min(1) })).optional(),
  /** Compiler ne débite rien — le tour de conversation est déjà payé. `0` est
   *  MESURÉ, pas une absence : la carte peut dire « aucun crédit » sans mentir. */
  cost_credits: z.number().min(0).optional(),
})

/**
 * #2392 (LAU-FINAL-106) — LA CLÔTURE DE FIN DE JOURNÉE, compilée par l'API
 * (`BriefingService.dayClosure`) et relayée telle quelle par l'outil
 * `compile_day_closure`.
 *
 * ⚠️ Carte d'ÉCRAN, comme `create_contact_from_crm` : elle n'est pas persistée
 * comme un run à dispatcher. La carte porte une décision PAR tâche restée
 * ouverte, montre le diff, et le clic « Valider » passe par la route de l'écran
 * des tâches (`PATCH /tasks/:id`) — lui inventer un intent de routeur ferait un
 * SECOND chemin d'écriture sur le même geste. Rien ne part sans ce clic.
 */
const dayClosureActionSchema = z.object({
  action: z.literal('day_closure'),
  depends_on: PLAN_DEPENDS_ON,
  closure: dayClosureSchema,
  /** Compiler ne débite rien : `0` est MESURÉ, pas une absence. */
  cost_credits: z.number().min(0).optional(),
})

/**
 * #2423.9 — LAURA PROPOSE UN AVENANT à une mission déjà signée (TJM, société,
 * lieu, télétravail, pause, dates, contrat, rôle, contact de facturation, bon
 * de commande, remplacement de consultant, périmètre, renouvellement, préavis).
 *
 * Miroir exact de `chat_tools.py::propose_mission_amendment` (~l.6551, `payload`) :
 * `action`, `mission_id`, `event_type`, `effective_from`, `proof`, `cost_credits`
 * TOUJOURS ; `previous_term`/`new_term`/`pause_cause`/`note` SEULEMENT quand
 * l'outil les a posés. `event_type`/`pause_cause` réutilisent le vocabulaire de
 * `mission-amendment.ts` (`MISSION_AMENDMENT_EVENT_TYPES`/`MISSION_PAUSE_CAUSES`)
 * au lieu de le recopier une troisième fois (GA-26).
 *
 * ⚠️ Le clic n'accepte rien : il enregistre la proposition (même porte que
 * `POST delivery/missions/:id/amendments`, `records:write`, espace vérifié).
 * L'avenant reste `proposed` — l'accepter/l'activer est un geste distinct, posé
 * dans le dossier de la mission (doctrine : Laura prépare, un humain valide,
 * jamais un accord obtenu).
 *
 * `previous_term`/`new_term` restent `Record<string, unknown>` comme dans
 * `proposeMissionAmendmentSchema` : seize types d'événements ne partagent pas la
 * même forme de terme. Un terme absent ne fait AUCUNE ligne à l'écran — jamais
 * une valeur inventée (voir `PendingActions.tsx`).
 */
const proposeMissionAmendmentActionSchema = z.object({
  action: z.literal('propose_mission_amendment'),
  depends_on: PLAN_DEPENDS_ON,
  mission_id: z.string().min(1),
  event_type: missionAmendmentEventTypeSchema,
  /** AAAA-MM-JJ — jamais devinée depuis « aujourd'hui » (même contrat que l'outil). */
  effective_from: z.string().min(1),
  /** Obligatoire côté outil : jamais un avenant sans preuve. */
  proof: z.string().min(1),
  previous_term: z.record(z.string(), z.unknown()).optional(),
  new_term: z.record(z.string(), z.unknown()).optional(),
  /** Exigée seulement pour `pause_start`, déjà validée par l'outil avant émission. */
  pause_cause: missionPauseCauseSchema.optional(),
  note: z.string().optional(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * #2391 (LAU-FINAL-105) — LAURA PROPOSE UN PLAN DE JOURNÉE (« focus plan »).
 *
 * Miroir exact de `chat_tools.py::propose_focus_plan` (`focus-plan.ts` porte
 * le détail de chaque champ et ce que ce lot ne couvre pas). L'outil ne fait
 * QUE des lectures réelles d'agenda (`list_agenda`/`find_free_slots`) : aucun
 * bloc n'est créé avant le clic de l'utilisateur — même famille que
 * `day_closure`/`propose_mission_amendment`, jamais la famille #2723
 * (analyse/recherche/enrichissement) qui, elle, part sans carte.
 */
const proposeFocusPlanActionSchema = z.object({
  action: z.literal('propose_focus_plan'),
  depends_on: PLAN_DEPENDS_ON,
  plan: focusPlanSchema,
  /** Compiler ne débite rien : `0` est MESURÉ, pas une absence. */
  cost_credits: z.number().min(0).optional(),
})

/**
 * #2770.55-.62 — LAURA PROPOSE UN PLAN DE SEMAINE : une suite de plans de
 * journée (`focusWeekPlanSchema`). Même famille que `propose_focus_plan` : rien
 * n'est écrit à la proposition, chaque bloc se valide sur la carte de SON jour.
 */
const proposeWeeklyPlanActionSchema = z.object({
  action: z.literal('propose_weekly_plan'),
  depends_on: PLAN_DEPENDS_ON,
  plan: focusWeekPlanSchema,
  cost_credits: z.number().min(0).optional(),
})

/**
 * #2324.39 — LAURA PRÉPARE UNE MISE À JOUR D'OPPORTUNITÉ, diff à l'appui.
 *
 * Miroir de `chat_tools.py::propose_opportunity_update`. Le DIFF est FIGÉ à la
 * préparation : l'outil lit l'état actuel (`POST /internal/copilot/projects/read`)
 * et ne garde que les champs qui CHANGENT — un « avant » inconnu vaut `null`,
 * jamais « 0 » (GA-18). La carte le montre champ par champ AVANT le clic.
 *
 * ⚠️ #3076 (épopée #2858) — carte GOUVERNÉE (#1998) depuis ce lot, plus une
 * carte d'ÉCRAN. Posée ici à l'origine (#2324.39) au motif que « le clic
 * emprunte les routes de l'écran, aucun second chemin d'écriture » — vrai,
 * mais une carte de cette famille n'est JAMAIS persistée
 * (`context.pending_actions` ne survit pas au rechargement,
 * `chat-message-context.ts`) : la proposition s'évaporait avant même le clic,
 * et le Centre d'actions n'en gardait aucune trace. Le clic reste le geste du
 * commercial (auto-approuvé au clic, comme `export_contact_to_crm`) et
 * n'emprunte toujours qu'UN chemin d'écriture
 * (`ActionRouterService.dispatchUpdateOpportunity` appelle les MÊMES méthodes
 * que `PATCH /projects/:id/stage|amount|btmmp|risks`, `records:write`, espace
 * vérifié) — mais la PROPOSITION, elle, est désormais persistée avant le clic.
 * Gagné/perdu n'y entrent toujours pas : la clôture garde son panneau d'effets
 * et sa raison de perte, à l'écran.
 */
const OPPORTUNITY_UPDATE_STAGES = PROJECT_STAGES.filter(stage => stage !== 'won' && stage !== 'lost') as [
  string,
  ...string[],
]
const opportunityUpdateStageSchema = z.enum(OPPORTUNITY_UPDATE_STAGES)
const opportunityUpdateChangeSchema = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('stage'),
    previous: z.enum(PROJECT_STAGES).nullable(),
    next: opportunityUpdateStageSchema,
  }),
  z.object({
    field: z.literal('estimated_amount'),
    previous: z.number().nonnegative().nullable(),
    next: z.number().nonnegative(),
  }),
  z.object({
    field: z.literal('next_step'),
    previous: z.string().nullable(),
    next: z.string().trim().min(1).max(2000),
  }),
  // #2324.37 — le RISQUE de l'affaire (`projects.risks`, PATCH /projects/:id/risks).
  z.object({
    field: z.literal('risk'),
    previous: z.string().nullable(),
    next: z.string().trim().min(1).max(2000),
  }),
])
const proposeOpportunityUpdateActionSchema = z.object({
  action: z.literal('propose_opportunity_update'),
  depends_on: PLAN_DEPENDS_ON,
  project_id: z.string().min(1),
  project_label: z.string().min(1),
  company_name: z.string().nullable().optional(),
  changes: z.array(opportunityUpdateChangeSchema).min(1),
  /** Obligatoire côté outil : jamais une mise à jour sans source. */
  proof: z.string().min(1),
  cost_credits: z.number().min(0).optional(),
})

/**
 * #3871.1 (lot V11, 07/10, recette prod 2e passe) — LAURA PROPOSE QU'UN
 * CONTACT PASSE EN HISTORIQUE, SANS L'EXÉCUTER.
 *
 * Miroir de `chat_tools.py::propose_contact_departure` : l'utilisateur
 * déclare qu'un contact a quitté l'entreprise ; une correction humaine gagne
 * toujours sur le signal calculé (`employerMismatch`) — l'état visé est
 * TOUJOURS `historique`, jamais `rejete` (ce terminal, lui, reste réservé à
 * un écartement explicite via `/contacts/:id/exclude`). On ARCHIVE, on ne
 * supprime jamais. Le clic emprunte la porte déjà là du contact
 * (`POST /contacts/:id/departed`) — aucun second chemin d'écriture.
 */
const proposeContactDepartureActionSchema = z.object({
  action: z.literal('propose_contact_departure'),
  depends_on: PLAN_DEPENDS_ON,
  contact_id: z.string().min(1),
  contact_name: z.string().nullable().optional(),
  account_id: z.string().nullable().optional(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * #2320.26/.27 (épopée #2967) — LAURA PROPOSE UNE TRANSITION DE BESOIN, SANS
 * L'EXÉCUTER.
 *
 * Miroir de `chat_tools.py::propose_need_transition` : le verdict
 * (`needTransitionCheck`, `ProjectPipelineService`) est déjà LU côté outil
 * avant l'émission — une transition refusée (ordre des statuts, gates
 * need-level) ne produit jamais cette carte. `reason` reste `null` quand
 * l'outil n'en a pas reçu : la porte serveur (`PATCH /projects/needs/:id
 * /status`) la redemandera elle-même si le statut visé l'exige, jamais devinée
 * ici. Le clic emprunte CETTE MÊME route — aucun second chemin d'écriture.
 */
const proposeNeedTransitionActionSchema = z.object({
  action: z.literal('propose_need_transition'),
  depends_on: PLAN_DEPENDS_ON,
  need_id: z.string().min(1),
  from_status: z.string().min(1),
  to_status: z.string().min(1),
  reason: z.string().nullable(),
  /** #2967 (lot V39) — les preuves que les gardes CANONIQUES traversées
   *  exigent (`evaluateCommercialTransition`), lues par l'outil dans
   *  `needTransitionCheck.canonical` — nommées avant le clic (#2320.27).
   *  Absent = l'outil ne les a pas transmises, jamais « aucune ». */
  missing_evidence: z.array(z.enum(COMMERCIAL_TRANSITION_EVIDENCE_KEYS)).optional(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * #2376 (LAU-FINAL-091) — LE BRIEF D'APPEL compilé par Laura AVANT un appel de
 * prospection (motion `cold_call_qualification`, `WORKFLOW_OUTCOME_CATALOG` —
 * `workflow-outcomes.ts` — dont les `drafts` nomment déjà `call_brief`,
 * `3_to_5_questions`, `objection_hints`).
 *
 * ⚠️ `contact_name`/`contact_title`/`organization_name` sont LUS sur la fiche du
 * contact côté outil (même lecture scopée que `enrich_contact`,
 * `_resolve_owned_contact`), jamais écrits par le modèle : un `contact_id`
 * inventé ne doit jamais produire de carte. Le reste — `reason`, `objective`,
 * `opening_question`, `next_questions`, `objection`, `fallback`,
 * `expected_outcome` — est la PRÉPARATION de Laura, un CADRE et non un script
 * imposé (issue #2376 §OUVERTURE : « Ce texte est un cadre, pas un script
 * obligatoire »).
 *
 * ⚠️ Carte de LECTURE, comme `compile_need`/`day_closure` : le clic n'écrit
 * rien (`cardTargetKey` ci-dessous). Les sept branches de traitement d'objection
 * et le mode live (checklist, notes, minuteur, faits à vérifier) sont du texte
 * de RÉFÉRENCE rendu par `CallBriefCard.tsx` à partir des mêmes champs —
 * jamais persistés, jamais un second appel réseau.
 */
const prepareColdCallActionSchema = z.object({
  action: z.literal('prepare_cold_call'),
  depends_on: PLAN_DEPENDS_ON,
  contact_id: z.string().min(1),
  /** Identité — lue sur la fiche, jamais inventée. */
  contact_name: z.string().min(1),
  /** Fonction — `null` quand la fiche ne la porte pas (jamais devinée). */
  contact_title: z.string().nullable(),
  /** Entreprise — même ancre que `enrich_contact` (`entity`, sinon le compte). */
  organization_name: z.string().min(1),
  /** Ce qu'on sait déjà de ce contact/compte. `null` : rien à en dire. */
  context: z.string().nullable(),
  reason: z.string().min(1),
  objective: z.string().min(1),
  opening_question: z.string().min(1),
  /** « Deux questions suivantes » (§AVANT L'APPEL) — la borne haute tolère un
   *  modèle qui en propose une troisième plutôt que de rejeter toute la carte. */
  next_questions: z.array(z.string().min(1)).min(1).max(4),
  objection: z.string().min(1),
  fallback: z.string().min(1),
  expected_outcome: z.string().min(1),
  /** Compiler ne débite rien — même raison que `compile_need`/`day_closure`. */
  cost_credits: z.number().min(0).optional(),
})

/**
 * Épopée #2872 (#2367.6, LOT c5 clôture 26/09) — LAURA PROPOSE UN PUSH DE
 * PROFIL vers une affaire, depuis `find_needs`.
 *
 * ⚠️ Carte d'ÉCRAN, même famille que `open_screen`/`prepare_consultant_record` :
 * AUCUNE lecture, AUCUNE écriture, AUCUN appel au pont. Le classement et le
 * push restent un clic humain sur `/consultants?matchProjectId=…` — cet outil
 * ne fait que router.
 */
const pushProfileActionSchema = z.object({
  action: z.literal('push_profile'),
  depends_on: PLAN_DEPENDS_ON,
  route: z.string().min(1),
  project_id: z.string().min(1),
  consultant_id: z.string().min(1).optional(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * #2987.56 (épopée #2987, LOT écrivain 28/09) — LAURA PROPOSE UNE DÉCISION
 * SUR UNE NOTE DE FRAIS SOUMISE, SANS L'EXÉCUTER.
 *
 * Miroir de `chat_tools.py::propose_expense_report_decision` : la note est
 * déjà RELUE (`expense_reports_pending_decision`) côté outil avant
 * l'émission — une note qui n'est plus dans la file des SOUMISES (déjà
 * décidée, hors de l'espace ou du droit de l'appelant) ne produit jamais
 * cette carte. `reason` reste `null` sur une validation ; un refus l'exige
 * déjà côté outil (jamais deviné). Le clic emprunte la MÊME route que
 * l'écran (`POST /expenses/reports/:id/validate|reject`, `finance:write`) —
 * aucun second chemin d'écriture. Le montant n'y figure JAMAIS : ni l'outil
 * ni cette carte n'ont le droit de le voir (`canReadFinance: false` en dur
 * côté pont).
 */
const decideExpenseReportActionSchema = z.object({
  action: z.literal('decide_expense_report'),
  depends_on: PLAN_DEPENDS_ON,
  expense_report_id: z.string().min(1),
  decision: z.enum(['validate', 'reject']),
  reference: z.string().nullable(),
  bearer_name: z.string().nullable(),
  account_name: z.string().nullable(),
  period_month: z.string().nullable(),
  reason: z.string().nullable(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * #1952.3 / #1952.7 (épopée #2844, lot P07 30/09) — LE LANCEMENT D'UN TRAVAIL
 * LONG, PROPOSÉ PAR LAURA : le matching massif de plusieurs besoins, ou la
 * recherche hors vivier d'UN besoin. Miroir de `chat_tools.py::propose_long_job`.
 * Le clic emprunte la route déjà là de l'écran (`POST needs/match/bulk`,
 * `POST projects/needs/:id/external-sourcing/search/bulk`) — aucun second chemin
 * d'écriture. Zéro crédit : aucun prix de lot inventé.
 */
const proposeLongJobActionSchema = z.object({
  action: z.literal('propose_long_job'),
  depends_on: PLAN_DEPENDS_ON,
  job: z.enum(['bulk_matching', 'multi_source_search']),
  need_ids: z.array(z.string().min(1)).min(1).max(50),
  /** Les besoins tels que l'outil les a LUS dans l'espace — `label` absent = jamais deviné. */
  needs: z.array(z.object({ need_id: z.string().min(1), label: z.string().nullable().optional() })).optional(),
  max_per_source: z.number().int().min(1).max(50).optional(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * #2434.56 (épopée #3579) — L'ENRICHISSEMENT EN MASSE, PROPOSÉ PAR LAURA, avec
 * son COÛT TOTAL annoncé avant le clic : « enrichis ces dix contacts » à la voix
 * ou au clavier. Miroir de `chat_tools.py::propose_bulk_enrichment`. Le clic est
 * la porte de confirmation de dépense (jamais un enchaînement) et emprunte la
 * route unitaire déjà là (`POST contacts/:id/enrich`, facturée au contact
 * RÉSOLU) — aucun second chemin d'écriture. `cost_credits` = plafond (un crédit
 * par contact) : ce qui n'est pas trouvé n'est pas débité.
 */
const BULK_ENRICHMENT_MAX_CONTACTS = 10

const proposeBulkEnrichmentActionSchema = z.object({
  action: z.literal('propose_bulk_enrichment'),
  depends_on: PLAN_DEPENDS_ON,
  /** Les contacts tels que l'outil les a LUS dans l'espace — jamais un identifiant deviné. */
  contacts: z
    .array(
      z.object({
        contact_id: z.string().min(1),
        contact_name: z.string().min(1),
        organization_name: z.string().min(1),
        /** LOT (15/10) DATA-B.5 — la seule coordonnée qui manque à CE contact (absent = les deux). */
        only: z.enum(['email', 'phone']).optional(),
      }),
    )
    .min(1)
    .max(BULK_ENRICHMENT_MAX_CONTACTS),
  /** Le plafond total annoncé : un crédit par contact, débité seulement sur ce qui est trouvé. */
  cost_credits: z.number().min(0).optional(),
  credit_kind: z.string().optional(),
})

/**
 * #3345.2 (LAU-FINAL-255, moitié écriture) — LAURA PROPOSE D'ÉCARTER OU DE
 * METTRE EN VEILLE UNE PISTE À QUALIFIER, SANS L'EXÉCUTER. Miroir de
 * `chat_tools.py::propose_qualification_lead_decision`. Le clic emprunte la
 * MÊME route que l'écran Opportunités (`POST /accounts/:id/qualification-leads
 * /:leadKey/decision`, `records:write`) — aucun second chemin d'écriture, et
 * `leadDecisionInputSchema` y revalide : écartement = motif, veille = échéance.
 * Rien n'est supprimé : la décision est réversible depuis l'écran.
 */
const decideQualificationLeadActionSchema = z.object({
  action: z.literal('decide_qualification_lead'),
  depends_on: PLAN_DEPENDS_ON,
  account_id: z.string().min(1),
  account_name: z.string().nullable(),
  lead_key: z.string().min(1),
  /** L'intitulé de la piste tel que l'outil l'a LU — `null` = jamais deviné. */
  lead_label: z.string().nullable(),
  decision: z.enum(['dismissed', 'snoozed']),
  reason: leadDismissReasonSchema.nullable(),
  note: z.string().nullable(),
  snoozed_until: z.string().nullable(),
  cost_credits: z.number().min(0).optional(),
})

/**
 * #3950.1 (décision Louis 09/10/2026) — LAURA PEUT LANCER L'EXPORT DU VIVIER.
 *
 * La posture de `/settings/vivier-export` passe de `forbidden` à `write`
 * (`laura-settings-catalog.ts`) : Laura peut lancer l'export sur demande
 * (« exporte mon vivier », « exporte les dispos pour l'ATS »), via le MÊME
 * service que le bouton de l'écran (`VivierExportMenu`) — jamais un second
 * chemin d'export. `mode` dit laquelle des deux options de la modale est
 * visée ; le clic appelle `GET talents/export/ats` ou `POST
 * talents/export/bulk` directement (`PendingActions.tsx`), jamais le routeur
 * d'intents (même famille que `propose_long_job`). La règle d'espace « qui
 * peut exporter » (`/settings/workspace-rules`) continue de tenir le clic —
 * ce lot ne lui ouvre pas de second chemin.
 */
const launchVivierExportActionSchema = z.object({
  action: z.literal('launch_vivier_export'),
  depends_on: PLAN_DEPENDS_ON,
  mode: z.enum(['ats', 'bulk']),
  cost_credits: z.number().min(0).optional(),
})

/**
 * #3869.a (lot M05, 09/10) — LA RECHERCHE ACTIVE DE NOUVELLES PERSONNES SUR UN
 * RÔLE NON POURVU, PROPOSÉE PAR LAURA. Miroir de
 * `chat_tools.py::propose_people_search`. Laura PROPOSE (le compte lu dans le
 * portefeuille, les rôles à chercher, le coût annoncé) ; le clic emprunte la
 * MÊME route que la découverte fraîche de `/accounts` (`POST
 * contacts/discover/:accountId`, `ContactDiscoveryService.run`) — aucun second
 * chemin d'écriture, débit APRÈS succès et seulement si quelqu'un est trouvé.
 * Rien n'est envoyé : une personne trouvée devient un contact à vérifier, jamais
 * un destinataire.
 */
const PEOPLE_SEARCH_MAX_ROLES = 5

const proposePeopleSearchActionSchema = z.object({
  action: z.literal('propose_people_search'),
  depends_on: PLAN_DEPENDS_ON,
  /** Le compte tel que l'outil l'a LU dans le portefeuille — jamais un identifiant deviné. */
  account_id: z.string().min(1),
  company_name: z.string().min(1),
  /** Les rôles NON POURVUS à chercher (fonctions, jamais des noms de personnes).
   *  #4057 — facultatifs dès qu'une `expertise` est nommée (« interlocuteurs
   *  cyber de X ») : l'outil IA exige l'un OU l'autre, jamais les deux. */
  roles: z.array(z.string().min(1).max(120)).max(PEOPLE_SEARCH_MAX_ROLES).default([]),
  /** #4058 — l'expertise cherchée, le secteur du client et le périmètre : trois
   *  champs DISTINCTS jusqu'à l'exécution (voir `contact-discovery.ts`). */
  expertise: z.string().trim().min(1).max(120).optional(),
  sector: z.string().trim().min(1).max(120).optional(),
  scope: z.string().trim().min(1).max(120).optional(),
  cost_credits: z.number().min(0).optional(),
  credit_kind: z.string().optional(),
})

/**
 * #2433.7 (épopée #2876, lot M10 09/10) — LAURA PRÉPARE UN SIGNALEMENT DE BUG
 * depuis une capture de BellumAI elle-même (règle CAPTURE INTERFACE,
 * `bellum_advisor.py`) : jusqu'ici la phrase « tu prépares un signalement »
 * n'avait aucun outil derrière elle.
 *
 * Aucune écriture côté outil IA : `message` est le constat VISIBLE (ce que
 * l'image montre, et la route ou les étapes données par la personne) — jamais
 * une cause serveur devinée. Le clic appelle `POST /feedback` (catégorie
 * `bug`, `feedbackApi.create`), LA MÊME porte que le formulaire de
 * signalement — jamais un second chemin, et le refus en salle de
 * démonstration y reste la porte (`feedback.controller.ts`). Même plafond que
 * ce formulaire (`FEEDBACK_MESSAGE_MAX`).
 */
const prepareBugReportActionSchema = z.object({
  action: z.literal('prepare_bug_report'),
  depends_on: PLAN_DEPENDS_ON,
  message: z.string().trim().min(1).max(FEEDBACK_MESSAGE_MAX),
  /** La route NOMMÉE par la personne (« sur /accounts »), jamais devinée depuis l'image. */
  route: z.string().min(1).max(500).nullable().optional(),
  cost_credits: z.number().min(0).optional(),
})

export const pendingChatActionSchema = z.discriminatedUnion('action', [
  prepareMessageActionSchema,
  scheduleReminderActionSchema,
  enrichContactActionSchema,
  exportContactToCrmActionSchema,
  prepareMailDraftActionSchema,
  prepareCalendarEventActionSchema,
  findAccountsActionSchema,
  openScreenActionSchema,
  prepareConsultantRecordActionSchema,
  toggleRoutineActionSchema,
  updateSettingActionSchema,
  pinMemoryFactActionSchema,
  startAccountAnalysisActionSchema,
  createContactFromCrmActionSchema,
  createTargetListFromAccountActionSchema,
  addAccountToPortfolioActionSchema,
  prepareCampaignActionSchema,
  compileNeedActionSchema,
  dayClosureActionSchema,
  proposeMissionAmendmentActionSchema,
  proposeFocusPlanActionSchema,
  proposeOpportunityUpdateActionSchema,
  prepareColdCallActionSchema,
  pushProfileActionSchema,
  proposeNeedTransitionActionSchema,
  decideExpenseReportActionSchema,
  // Épopée #2955 (#2394.6/.19/.43) — EN FIN de liste (GA-08).
  proposeCrmNoteActionSchema,
  // #1952.3 / #1952.7 (épopée #2844) — EN FIN de liste (GA-08).
  proposeLongJobActionSchema,
  // #2770.55-.62 — le plan de semaine, EN FIN de liste (GA-08).
  proposeWeeklyPlanActionSchema,
  // #3345.2 — EN FIN de liste (GA-08).
  decideQualificationLeadActionSchema,
  // #2434.56 (épopée #3579) — EN FIN de liste (GA-08).
  proposeBulkEnrichmentActionSchema,
  // #3871.1 (lot V11, 07/10) — EN FIN de liste (GA-08).
  proposeContactDepartureActionSchema,
  // #3950.1 (décision Louis 09/10/2026) — EN FIN de liste (GA-08).
  launchVivierExportActionSchema,
  // #3869.a (lot M05, 09/10) — EN FIN de liste (GA-08).
  proposePeopleSearchActionSchema,
  // #2433.7 (lot M10, 09/10) — EN FIN de liste (GA-08).
  prepareBugReportActionSchema,
  // #3894.3 (lot RAE2, 10/10) — EN FIN de liste (GA-08).
  prepareMessageAudienceActionSchema,
])
export type PendingChatAction = z.infer<typeof pendingChatActionSchema>

/** The twenty-six literals themselves — `copilot-card.test.ts` proves this list is exhaustive. */
export const PENDING_CHAT_ACTION_TYPES = pendingChatActionSchema.options.map(option => option.shape.action.value) as [
  string,
  ...string[],
]

// ── The preview shown before anyone clicks (#1930's eight lines) ────────────

/**
 * The eight things #1930 requires every card to show before a decision:
 * « Ce qui va être fait / Objet concerné / Destination / Contenu ou
 * modification / Donnée utilisée / Coût / Connexion utilisée / Ce qui ne sera
 * pas fait » — verbatim from the issue, in that order.
 *
 * `costCredits` and `connectionUsed`/`destination`/`content`/`dataUsed` are
 * NULLABLE, never defaulted to an empty string or a zero: an action with no
 * destination (a settings patch) states `destination: null`, not `""` — the
 * doctrine question applies here as much as to a score ("si cette valeur est
 * absente, est-ce vrai qu'il n'y a rien ?"). `whatWillHappen` and
 * `whatWillNotHappen` are the two lines #1930's own example always fills
 * ("Créer un brouillon Gmail…" / "aucun envoi automatique"), so they stay required.
 */
export const cardPreviewSchema = z.object({
  /** "Ce qui va être fait." */
  whatWillHappen: z.string().trim().min(1).max(500),
  /** "Objet concerné." */
  targetObject: z.string().trim().min(1).max(300),
  /** "Destination." `null` when the action has none (an internal setting, a pinned fact). */
  destination: z.string().trim().max(300).nullable(),
  /** "Contenu ou modification." */
  content: z.string().trim().max(5000).nullable(),
  /** "Donnée utilisée." What informed the proposal — a signal, a past exchange, a filter. */
  dataUsed: z.string().trim().max(500).nullable(),
  /**
   * "Coût." `null` = NOT MEASURED (doctrine: never a silent 0). A genuinely
   * free action states `0` explicitly — that is the difference this field
   * exists to keep visible.
   */
  costCredits: z.number().int().min(0).nullable(),
  /**
   * "Connexion utilisée." Names the CAPABILITY (« votre CRM », « votre
   * messagerie ») — never a vendor name outside Réglages › Intégrations
   * (doctrine `c58`-adjacent rule, guarded elsewhere by `tool-capability-digest.spec.ts`).
   * `null` when the action needs no connected tool.
   */
  connectionUsed: z.string().trim().max(200).nullable(),
  /** "Ce qui ne sera pas fait." #1930's own example: "aucun envoi automatique". */
  whatWillNotHappen: z.string().trim().min(1).max(500),
})
export type CardPreview = z.infer<typeof cardPreviewSchema>

// ── The result shown after something happened (#1931's after-action fields) ─

/**
 * #1931's "après chaque action, afficher" list: résultat, date, acteur, objet,
 * destination, identifiant ou lien, coût, prochaine étape — eight fields,
 * `null` where the run hasn't reached that point yet rather than a guess.
 */
export const cardResultSchema = z.object({
  /** "Résultat." Free text, e.g. "Le brouillon a été créé dans Gmail. Aucun message n'a été envoyé." */
  outcome: z.string().trim().min(1).max(1000),
  /** "Date." `null` only for a run not yet finished. */
  occurredAt: z.string().datetime().nullable(),
  /** "Acteur." `null` for a routine/system trigger — never a fabricated name (mirrors `runTraceSchema`'s own rule). */
  actorName: z.string().trim().max(200).nullable(),
  /** "Objet." */
  targetObject: z.string().trim().min(1).max(300),
  /** "Destination." */
  destination: z.string().trim().max(300).nullable(),
  /** "Identifiant ou lien." #1930's CTA example: "Ouvrir le brouillon". */
  externalRef: z.string().trim().max(500).nullable(),
  /** "Coût." The MEASURED spend, never the estimate recopied — `null` = not measured. */
  creditsSpent: z.number().int().min(0).nullable(),
  /** "Prochaine étape." `null` when there isn't one. */
  nextStep: z.string().trim().max(500).nullable(),
  /**
   * #2105.39 — "Outil utilisé." Mirrors `cardPreviewSchema.connectionUsed`
   * (same capability name, injected — never a vendor). Before this field, the
   * preview named the tool (« votre agenda », « votre CRM »…) but the result
   * dropped it: `cardResultOf` only ever copied `destination`, which for 5 of
   * the 7 effectful actions is `null` (no destination) or, for a mail draft,
   * the RECIPIENT — not the tool. An executed card then showed no tool at all
   * for `enrich_contact`, `prepare_message`, `toggle_routine`,
   * `update_setting` and `pin_memory_fact`. `null` when the action needed no
   * connected tool, exactly like the preview.
   */
  connectionUsed: z.string().trim().max(200).nullable(),
  /**
   * L2 (#1931) — what the action PRODUCED, when it produced text the user must
   * read: the body of a generated message draft (`generate_message` persists
   * nothing anywhere else, so without this field the draft would vanish on
   * reload — D1 again, one level down). Optional: every L1 result stays valid.
   */
  content: z.string().max(20_000).optional(),
  /**
   * #1943.17 — "Support si nécessaire." Optional like `content`: every result
   * already written elsewhere in this repo stays valid without it. `true`
   * only on a failure the person cannot self-diagnose (today, a timeout —
   * `unknown_outcome`); absent/`false` elsewhere, never guessed from a reason
   * string.
   */
  supportSuggested: z.boolean().optional(),
  /**
   * #1943.14 — "Ce qui a malgré tout réussi." Optional, comme `content` : tout
   * résultat déjà écrit ailleurs reste valide sans lui. Ne se peuple que sur un
   * run `partial` (#1943.7) — un `done`/`failed` n'a rien de PARTIEL à nommer,
   * `outcome` le dit déjà en entier. Chaque phrase vient de `WorkflowStep.intent`
   * (la même que la prévisualisation), jamais recopiée à un second endroit (GA-26).
   */
  succeeded: z.string().trim().max(1000).optional(),
  /**
   * #1943.13 — "Ce qui n'a pas été fait." Miroir de `succeeded` : `null` un
   * pas manqué se nomme par sa RAISON (`WorkflowRunStep.reason`) quand elle
   * existe, sinon par sa propre phrase déclarée — jamais une valeur devinée.
   */
  notDone: z.string().trim().max(1000).optional(),
  /**
   * #2366.1 / #2366.2 — le message canonique (`outreach_messages`) que ce
   * résultat a éventuellement créé (`generate_message`, source `laura`).
   * Optionnel comme `content` : chaque résultat déjà écrit ailleurs dans ce
   * dépôt reste valide sans lui. Sa présence est ce qui permet au fil de
   * RELIRE l'objet à jour (fiche Contact / centre d'approbation le lisent
   * déjà) au lieu de garder pour toujours le texte figé de `content` —
   * jamais une seconde version propre au fil (#2366.2).
   */
  outreachMessageId: z.string().guid().optional(),
  /**
   * #1952.32 (#2844) — "Ce qui doit être vérifié." Optionnel comme `content` :
   * chaque résultat déjà écrit ailleurs dans ce dépôt reste valide sans lui.
   * Nomme ce qu'un signal de confiance RÉEL (jamais un pourcentage deviné)
   * marque comme non confirmé — aujourd'hui, l'e-mail d'un contact que
   * l'analyse a touché (`contacts.email_confidence`, #2120.68 : `medium` =
   * trouvé non confirmé, `low` = deviné ; `high`/`null` ne posent aucune
   * ligne, jamais devinés comme « à vérifier »). Absent/vide = rien à
   * vérifier, ou aucun signal — la LISTE ne fait alors AUCUNE ligne (doctrine :
   * on n'affiche pas ce qu'on n'a pas).
   */
  toVerify: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
  /**
   * #3416.x2 — « Ce que ça apprend » d'une ANALYSE DE COMPTE : le résultat réel
   * relevé au règlement du run (contacts trouvés, dont e-mail vérifié). Absent
   * tant que l'analyse n'est pas réussie ou qu'aucun contact n'existe — la
   * ligne ne s'affiche alors pas (une absence n'est pas un zéro). Jamais un
   * texte libre : l'écran le formule dans la langue de la personne.
   */
  analysisFound: z.object({ contacts: z.number().int().min(1), verifiedEmails: z.number().int().min(0) }).optional(),
})
export type CardResult = z.infer<typeof cardResultSchema>

// ── The card's state, by name (#1931's nine + the lot-4 plan's three) ───────

/**
 * The thirteen names a copilot card's state can carry.
 *
 * The first nine are #1931's own list, verbatim ("LAURA — NE PLUS FAIRE
 * DISPARAÎTRE UNE ACTION"): Suggérée, Préparée, À valider, En cours, Exécutée,
 * Partielle, Échouée, Reportée, Refusée. Four more come from the lot-4 plan's
 * "État persisté" section and #1943 ("ÉTATS DE RÉSILIENCE"): Expirée,
 * Obsolète, Résultat inconnu, Rien n'est parti.
 *
 * English literal values (the codebase's convention for exported enums); the
 * French names above are what a screen shows — mapping them is L4's job, not
 * this contract's.
 */
export const copilotCardStateSchema = z.enum([
  /** Suggérée — Laura raised it, nothing resolved yet (`run.preview` is still `null`). */
  'suggested',
  /** Préparée — the eight-line preview is ready; a user click is the only thing missing. */
  'prepared',
  /** À valider — a SYSTEM-triggered proposal awaits a visible approval (`run.status === 'awaiting_approval'`). */
  'awaiting_review',
  /** En cours. */
  'running',
  /** Exécutée. */
  'executed',
  /** Partielle. */
  'partial',
  /** Échouée. */
  'failed',
  /** Reportée — `run.status === 'snoozed'`. */
  'snoozed',
  /** Refusée — approval `rejected` + run `cancelled` (the plan's own persisted-state rule). */
  'rejected',
  /** Expirée — the approval's 3-day window passed before a decision. */
  'expired',
  /** Obsolète — `run.status === 'superseded'`: the world changed under the card before anyone decided. */
  'superseded',
  /** Résultat inconnu — `run.status === 'unknown'`: a timeout, never folded into `failed`. */
  'unknown_outcome',
  /** Rien n'est parti — `run.status === 'blocked'`: no executable step, or all were skipped. */
  'blocked',
])
export type CopilotCardState = z.infer<typeof copilotCardStateSchema>

/**
 * ⚠️ THIS MAPPING IS THIS LOT'S OWN RECONSTRUCTION — READ BEFORE RELYING ON IT.
 *
 * The lot-4 plan names the thirteen states and says "mapping exact" lives
 * elsewhere, but no such table exists in
 * `.claude/notes/plan-lot4-action-os-2026-09-12.md` at the time this was
 * written — its "État persisté" section gives the PIECES (a card is a run;
 * `snoozed`/`superseded` are new run statuses; refusal is `rejected` +
 * `cancelled`; `unknown` excludes a retry button) but not a run-status → card-
 * state table. This function is that table, built from those pieces plus
 * #1931 and #1943's own wording. It is deliberately EXHAUSTIVE on
 * `WorkflowRunStatus` (the `never` branch below) so that a future run status
 * added without updating this file fails to compile here, rather than
 * silently rendering as `undefined`.
 *
 * `run.preview` is the one field this reconstruction ADDS to tell `suggested`
 * apart from `prepared` — both are `status: 'planned'` otherwise, and #1931
 * lists them as two distinct names. The migration's `preview jsonb NULL`
 * column is exactly this: `null` until Action OS has resolved a target and
 * computed the eight-line preview.
 *
 * L2 (13/09/2026) — CONFIRMED against the engine, with two corrections:
 *  - the open question is closed: a `planned` run never carries a `pending`
 *    approval (`WorkflowRunnerService.insertRun` sets `awaiting_approval` as
 *    soon as it opens one, and `CopilotCardService.confirm` does the same for a
 *    card a manager must decide), so `awaiting_review` rightly maps from
 *    `awaiting_approval` alone;
 *  - `planned` could never EXPIRE and `snoozed` stayed « Reportée » forever.
 *    Both now read the card's dates (`createdAt`, `snoozedUntil` — optional,
 *    so L1's callers keep the exact table): 3 days after the proposal, or after
 *    the chosen report date, an unlaunched card is `expired` ({@link cardExpiresAt}).
 */
export const copilotCardRunSchema = z.object({
  status: workflowRunStatusSchema,
  /** `null` = the raw suggestion; set once Action OS has computed the preview. */
  preview: cardPreviewSchema.nullable(),
  /**
   * L2 — when the card was PROPOSED (`workflow_runs.created_at`). Optional so
   * L1's callers keep their exact table; absent, a card cannot expire (no date
   * to count from — never an invented deadline).
   */
  createdAt: z.string().datetime().optional(),
  /** L2 — `workflow_runs.snoozed_until`: the chosen report date, which RESTARTS the 3-day expiry. */
  snoozedUntil: z.string().datetime().nullable().optional(),
})
export type CopilotCardRun = z.infer<typeof copilotCardRunSchema>

export const copilotCardApprovalSchema = z.object({
  state: approvalStateSchema,
  expiresAt: z.string().datetime(),
})
export type CopilotCardApproval = z.infer<typeof copilotCardApprovalSchema>

function approvalHasExpired(approval: CopilotCardApproval | null, now: Date): boolean {
  if (!approval) return false
  if (approval.state === 'expired') return true
  return approval.state === 'pending' && new Date(approval.expiresAt).getTime() <= now.getTime()
}

/**
 * L2 (#1931, arbitrage du 12/09 « expiration de 3 jours relancée ») — THE
 * deadline of a card that nobody has launched yet: 3 days (`APPROVAL_TTL_MS`,
 * the doctrine's constant) from the chosen report date when there is one,
 * otherwise from the proposal. `null` when neither date is known.
 *
 * One derivation, one place (GA-26): `cardStateOf` reads it, and the API refuses
 * a confirm past it with the same function — two copies would disagree the day
 * the rule moves.
 */
export function cardExpiresAt(run: { createdAt?: string; snoozedUntil?: string | null }): Date | null {
  const anchor = run.snoozedUntil ?? run.createdAt
  if (!anchor) return null
  return new Date(new Date(anchor).getTime() + APPROVAL_TTL_MS)
}

function cardHasExpired(run: CopilotCardRun, now: Date): boolean {
  const deadline = cardExpiresAt(run)
  return deadline !== null && deadline.getTime() <= now.getTime()
}

/** A not-yet-launched card: `suggested` without a preview, `prepared` with one — unless its deadline passed. */
function liveProposalState(run: CopilotCardRun, now: Date): CopilotCardState {
  if (cardHasExpired(run, now)) return 'expired'
  return run.preview ? 'prepared' : 'suggested'
}

/**
 * PURE — same run, same approval, same clock in ⇒ same name out. `now` is a
 * parameter (never `Date.now()` read inside) so this stays testable without a
 * fake clock library, the same discipline `workflow-intents.ts`'s
 * `buildRunIntents` already holds for its own `now`.
 */
export function cardStateOf(run: CopilotCardRun, approval: CopilotCardApproval | null, now: Date): CopilotCardState {
  switch (run.status) {
    case 'blocked':
      return 'blocked'
    case 'unknown':
      return 'unknown_outcome'
    case 'done':
      return 'executed'
    case 'partial':
      return 'partial'
    case 'failed':
      return 'failed'
    case 'running':
      return 'running'
    case 'snoozed':
      // L2 — « Reportée » tant que la date choisie n'est pas là. Passée, la
      // carte REVIENT (arbitrage du 12/09) avec 3 jours devant elle, comptés
      // depuis cette date : ni une carte gelée pour toujours, ni une carte
      // expirée à cause de son âge d'avant le report.
      if (run.snoozedUntil && new Date(run.snoozedUntil).getTime() <= now.getTime()) {
        return liveProposalState(run, now)
      }
      return 'snoozed'
    case 'superseded':
      return 'superseded'
    case 'cancelled':
      return 'rejected'
    case 'awaiting_approval':
      return approvalHasExpired(approval, now) ? 'expired' : 'awaiting_review'
    case 'planned':
      // L2 — confirmé contre le moteur : un run `planned` n'a JAMAIS
      // d'approbation `pending` (le runner pose `awaiting_approval` dès qu'il en
      // ouvre une, `insertRun`), donc la question laissée ouverte par L1 ne se
      // pose pas. Ce qui manquait est l'EXPIRATION : 3 jours après la
      // proposition, une carte non lancée est « Expirée ».
      return liveProposalState(run, now)
    case 'draft':
    case 'to_confirm':
      // #2276 — statuts du job composite (`trigger = 'laura_job'`), que les
      // lectures de cartes ne ramènent pas (`trigger = 'copilot_proposal'`).
      // Lus quand même, ils disent la même chose qu'une carte pas encore lancée.
      return liveProposalState(run, now)
    default: {
      const exhaustive: never = run.status
      throw new Error(`cardStateOf: unhandled WorkflowRunStatus ${String(exhaustive)}`)
    }
  }
}

// ── What a card lets you DO in each state (#1943) ───────────────────────────

/** The six gestures of `action-os.ts` (`confirmCardRequestSchema` and its siblings), by name. */
export const cardGestureSchema = z.enum(['confirm', 'reject', 'snooze', 'modify', 'retry', 'cancel'])
export type CardGesture = z.infer<typeof cardGestureSchema>

/**
 * The gestures a card OFFERS in a given state — the single place the API checks
 * before acting and the screen reads before drawing a button (GA-26).
 *
 * Three rules carry the table:
 *  - **`retry` exists only on `failed`.** Never on `unknown_outcome`: a timeout
 *    is not a failure, and replaying something that may already have left is
 *    worse than doing nothing (doctrine). #1943 « réessayer sans envoyer deux
 *    fois une action externe ».
 *  - **`confirm` needs a preview.** `suggested` has none: nobody validates what
 *    they have not been shown (#1930's eight lines).
 *  - **Once something left, nothing is offered but its result.** A running
 *    card cannot be cancelled here — the plan keeps « annuler un enrichissement
 *    parti » out of scope, and a cancel that does not undo what the run wrote
 *    would be narrower than the write (memory: `annulation-plus-etroite-que-lecriture`).
 */
export function cardAllowedGestures(state: CopilotCardState): readonly CardGesture[] {
  switch (state) {
    case 'suggested':
      return ['reject', 'snooze']
    case 'prepared':
    case 'snoozed':
      return ['confirm', 'reject', 'snooze', 'modify']
    case 'awaiting_review':
      return ['cancel']
    case 'failed':
      return ['retry']
    case 'running':
    case 'executed':
    case 'partial':
    case 'rejected':
    case 'expired':
    case 'superseded':
    case 'unknown_outcome':
    case 'blocked':
      return []
    default: {
      const exhaustive: never = state
      throw new Error(`cardAllowedGestures: unhandled CopilotCardState ${String(exhaustive)}`)
    }
  }
}

// ── The two reads of the Actions screen (arbitrage du 12/09) ────────────────

/**
 * « En cours » — « une carte y apparaît dès qu'elle est lancée ou attend un
 * manager ». A launched card keeps its result here (executed, partial, failed,
 * unknown, blocked): the decision names when a card ENTERS the screen, not a
 * moment it leaves it — see the open question in the L2 report.
 */
export const CARD_STATES_IN_ACTIONS_CURRENT: readonly CopilotCardState[] = [
  'awaiting_review',
  'running',
  'executed',
  'partial',
  'failed',
  'unknown_outcome',
  'blocked',
]

/** « Historique pour refusées et expirées. » */
export const CARD_STATES_IN_ACTIONS_HISTORY: readonly CopilotCardState[] = ['rejected', 'expired']

// ── The assembled view (what a screen would render) ─────────────────────────

export const copilotCardViewSchema = z.object({
  /** The `workflow_runs.id` this card IS. */
  id: z.string().guid(),
  /** What Laura proposed, unchanged — the eleven-shape union above. */
  action: pendingChatActionSchema,
  state: copilotCardStateSchema,
  preview: cardPreviewSchema,
  /** `null` until something has actually happened. */
  result: cardResultSchema.nullable(),
  /** The reporter's target date, only meaningful when `state === 'snoozed'`. */
  snoozedUntil: z.string().datetime().nullable(),
})
export type CopilotCardView = z.infer<typeof copilotCardViewSchema>

// ── Identity (the plan's "Clés" — one format, so nobody reconstructs it) ────

/**
 * A copilot card's stable key: one run per (thread, turn, rank in that turn).
 * Format fixed HERE (GA-26) so the callers that will need it — card creation
 * (L2), the conversation bridge (L3), and any read path (L4) — derive it
 * rather than reconstruct it by hand.
 */
export function copilotCardIdempotencyKey(turnId: string, proposalIndex: number): string {
  return `card:${turnId}:${proposalIndex}`
}

// ── How many cards one reply may carry (#1943.3 — décision de Louis du 13/09) ─

/**
 * « 3 au plus, 1 principale — garde dans le CODE, pas seulement le prompt. »
 *
 * The same number is held in TWO languages, on purpose: the IA orchestrator
 * stops stacking proposals at the source (`_MAX_CARDS_PER_REPLY`,
 * `apps/ia/app/services/chat_orchestrator.py`), and the API cuts again when it
 * persists them (defence in depth — a replayed or hand-built `done` event must
 * not open a fourth card). `copilot-card.test.ts` READS the Python literal and
 * fails if the two ever differ.
 */
export const MAX_CARDS_PER_REPLY = 3

/** Keeps the first `MAX_CARDS_PER_REPLY` proposals, in order, and COUNTS the rest (never silently). */
export function capReplyProposals<T>(proposals: readonly T[]): { kept: T[]; dropped: number } {
  return {
    kept: proposals.slice(0, MAX_CARDS_PER_REPLY),
    dropped: Math.max(0, proposals.length - MAX_CARDS_PER_REPLY),
  }
}

/** The primary card of a reply is its FIRST proposal — one derivation (GA-26), read by the API and the screen. */
export function isPrimaryCardIndex(proposalIndex: number | null | undefined): boolean {
  return proposalIndex === 0
}

// ── « The same target » — what makes a card obsolete (#1943.6) ─────────────

/**
 * The identity of what a card ACTS ON, type included — two cards with the same
 * key would do the same thing to the same object. `null` for the three
 * navigation shapes, which are never persisted.
 *
 * Deliberately narrow: an id when the proposal carries one, the recipient
 * address (case-insensitive) for a mail draft, the setting's coordinates for a
 * setting. Never a NAME — two contacts called « Claire Dubois » are two targets
 * (memory: `jointure-par-nom-entre-deux-referentiels`).
 */
export function cardTargetKey(action: PendingChatAction): string | null {
  switch (action.action) {
    case 'enrich_contact':
      return `enrich_contact:contact:${action.contact_id}`
    case 'export_contact_to_crm':
      return `export_contact_to_crm:contact:${action.contact_id}:${action.provider}`
    case 'prepare_message':
      return `prepare_message:contact:${action.contact_id}:${action.channel}`
    case 'schedule_reminder':
      return `schedule_reminder:contact:${action.contact_id}`
    case 'prepare_mail_draft':
      return `prepare_mail_draft:to:${action.to.trim().toLowerCase()}:${action.thread_id ?? ''}`
    case 'prepare_calendar_event':
      return `prepare_calendar_event:${action.starts_at}:${action.title.trim().toLowerCase()}`
    case 'toggle_routine':
      return `toggle_routine:${action.key}`
    case 'update_setting':
      return `update_setting:${action.screen}:${action.field}`
    case 'pin_memory_fact':
      return `pin_memory_fact:${action.account_id ?? ''}:${action.fact.trim()}`
    case 'find_accounts':
    case 'open_screen':
    case 'prepare_consultant_record':
    case 'push_profile':
      return null
    /**
     * D1 — la carte d'analyse n'est PAS persistée comme un run à dispatcher
     * (`copilot-card-catalog.ts` : le clic passe par la route de l'écran,
     * `POST /analysis/start`, et Action OS SUIT le lancement via
     * `ANALYSIS_TRACKING_DEFINITION_KEY`). Sans carte persistée, il n'y a rien à
     * dédoublonner : une clé de cible ici désignerait un objet qui n'existe pas.
     */
    case 'start_account_analysis':
      return null
    /**
     * #1995 — même raison : le clic passe par la route de l'écran
     * (`POST /accounts/:id/contacts/from-crm`), aucune carte n'est persistée,
     * donc il n'y a rien à dédoublonner. Et la clé se ferait sur un NOM — deux
     * homonymes chez deux sociétés ne sont pas la même cible.
     */
    case 'create_contact_from_crm':
      return null
    /**
     * Épopée #2853 (#2157.1) — même famille que `create_contact_from_crm` :
     * le clic passe par la route de l'écran (`POST /target-lists` puis
     * `.../items`), aucune carte n'est persistée dans Action OS. Et la clé se
     * ferait sur quoi ? Deux listes différentes proposées sur le même compte
     * ne sont pas la même cible.
     */
    case 'create_target_list_from_account':
      return null
    /**
     * Épopée #2781 (#2150.30, LOT j1 26/09) — même famille : le clic passe
     * par la route de l'écran (`POST /accounts/portfolio`), aucune carte
     * n'est persistée dans Action OS. Et la clé se ferait sur quoi ? Le
     * dédoublonnage (SIREN/nom) est déjà tenu côté serveur par la porte
     * elle-même (#2150.32/#2150.42).
     */
    case 'add_account_to_portfolio':
      return null
    /**
     * #1935 — même famille que `find_accounts` / `open_screen` : le clic OUVRE
     * l'écran Séquences pré-rempli, il n'écrit rien et ne persiste aucune
     * carte. Il n'y a donc rien à dédoublonner, et une clé se ferait sur une
     * AUDIENCE — deux campagnes vers les mêmes contacts avec deux objectifs
     * différents ne sont pas la même cible.
     */
    case 'prepare_campaign':
      return null
    /**
     * #2322 — même famille : le clic ouvre le créateur de besoin, il n'écrit
     * rien. Et la clé se ferait sur quoi ? Deux emails différents qui parlent
     * du même compte ne sont pas le même besoin — dédoublonner sur le compte
     * effacerait le second.
     */
    case 'compile_need':
      return null
    /**
     * #2392 — la clôture de journée n'est pas persistée (le clic passe par
     * `PATCH /tasks/:id`) : rien à dédoublonner.
     */
    case 'day_closure':
      return null
    /**
     * #2423.9 — même famille que `create_contact_from_crm`/`start_account_analysis` :
     * le clic passe par la route de l'écran (`POST delivery/missions/:id/amendments`),
     * aucune carte n'est persistée dans Action OS. Rien à dédoublonner ici — la
     * seule dédoublonnage possible vivrait côté serveur, hors de ce fichier.
     */
    case 'propose_mission_amendment':
      return null
    /**
     * #2391 — même famille : la carte se rend depuis `plan` (le composant lit
     * l'action brute, jamais Action OS), aucun run n'est persisté ici. Rien à
     * dédoublonner — la clé se ferait sur la DATE, mais deux plans proposés
     * le même jour à deux moments du fil ne sont pas la même proposition : le
     * second peut porter des blocs différents après un message entre les deux.
     */
    case 'propose_focus_plan':
      return null
    // #2770.55-.62 — même famille : le plan de semaine se rend depuis `plan`.
    case 'propose_weekly_plan':
      return null
    // #2324.39 — même famille : le clic passe par les routes de l'opportunité,
    // aucune carte n'est persistée dans Action OS.
    case 'propose_opportunity_update':
      return null
    /**
     * #2376 — même famille que `compile_need`/`day_closure` : le clic n'ouvre
     * aucune écriture (la carte se lit elle-même, branches et mode live
     * compris). Rien n'est persisté, donc rien à dédoublonner.
     */
    case 'prepare_cold_call':
      return null
    /**
     * #2320.26/.27 (épopée #2967) — même famille que `propose_opportunity_update` :
     * le clic passe par la porte d'état du besoin (`PATCH /projects/needs/:id
     * /status`), aucune carte n'est persistée dans Action OS.
     */
    case 'propose_need_transition':
      return null
    /**
     * #2987.56 — même famille que `propose_need_transition` : le clic passe
     * par la route de l'écran (`POST expenses/reports/:id/validate|reject`),
     * aucune carte n'est persistée dans Action OS.
     */
    case 'decide_expense_report':
      return null
    /**
     * #3345.2 — même famille : le clic passe par la route de l'écran
     * Opportunités (`POST …/qualification-leads/:leadKey/decision`), aucune
     * carte n'est persistée dans Action OS.
     */
    case 'decide_qualification_lead':
      return null
    /**
     * Épopée #2955 (#2394.6/.19/.43) — la note et le contact visé : une
     * seconde note préparée sur le même fil (relance, précision) n'est pas la
     * même carte, même règle que `prepare_message`/`schedule_reminder`.
     */
    case 'propose_crm_note':
      return `propose_crm_note:contact:${action.contact_id}:${action.note.trim()}`
    /**
     * #3871.1 — le contact visé : une seconde proposition sur le même contact
     * n'est pas une nouvelle carte (même règle que `propose_crm_note`).
     */
    case 'propose_contact_departure':
      return `propose_contact_departure:contact:${action.contact_id}`
    /**
     * #1952.3 / #1952.7 — le travail ET les besoins visés : un lot sur d'autres
     * besoins, ou l'autre travail sur les mêmes, n'est pas la même carte.
     */
    case 'propose_long_job':
      return `propose_long_job:${action.job}:${[...action.need_ids].sort().join(',')}`
    // #3950.1 — le mode SEUL suffit : deux lancements du même mode ne sont pas
    // deux propositions distinctes (même règle que `toggle_routine:${key}`).
    case 'launch_vivier_export':
      return `launch_vivier_export:${action.mode}`
    /**
     * #2433.7 — même famille que `create_contact_from_crm` : le clic passe par
     * la route du formulaire (`POST /feedback`), aucune carte n'est persistée
     * dans Action OS — rien à dédoublonner.
     */
    case 'prepare_bug_report':
      return null
    /** #3894.3 — l'ensemble des destinataires ET le canal : une autre audience n'est pas la même carte. */
    case 'prepare_message_audience':
      return `prepare_message_audience:${action.channel}:${action.recipients
        .map(recipient => recipient.contact_id)
        .sort()
        .join(',')}`
    /** #2434.56 — l'ensemble des contacts visés : un autre lot n'est pas la même carte. */
    case 'propose_bulk_enrichment':
      return `propose_bulk_enrichment:${action.contacts
        .map(contact => contact.contact_id)
        .sort()
        .join(',')}`
    /** #3869.a — le compte ET les rôles cherchés : d'autres rôles ne sont pas la même carte. */
    case 'propose_people_search':
      return `propose_people_search:${action.account_id}:${[...action.roles].sort().join(',')}:${action.expertise ?? ''}:${action.sector ?? ''}:${action.scope ?? ''}`
    default: {
      const exhaustive: never = action
      throw new Error(`cardTargetKey: unhandled action ${JSON.stringify(exhaustive)}`)
    }
  }
}

/**
 * The card types for which « already done elsewhere » makes a still-pending card
 * obsolete: doing them twice on the same target changes nothing (the contact is
 * enriched, the record exists in the CRM, the fact is pinned). A second DRAFT,
 * MESSAGE or REMINDER for the same person stays legitimate — a newer one in the
 * same thread replaces the older, but one executed elsewhere does not.
 */
export const CARD_TYPES_OBSOLETE_ONCE_EXECUTED: readonly PendingChatAction['action'][] = [
  'enrich_contact',
  'export_contact_to_crm',
  'pin_memory_fact',
]
