import { z } from 'zod'
import {
  ACTION_TARGET_KINDS,
  actionConfidenceSchema,
  MANUAL_ACTION_WEEK_INDEX,
  planActionChannelSchema,
  type ActionPlanItem,
  type MyPlanAction,
  type PlanActionChannel,
} from './action-plan-items.js'
import type { GeneratedPlanPhase, GeneratedPlanStep } from './generated-plan.js'
import type { OutreachCallTask } from './outreach-canonical.js'
import type { Intervention } from './playbook.js'
import type { EvidenceFieldSource } from './provenance.js'
import type { Task } from './task.js'

/**
 * #2395 — UN objet Action, le même sur tout le produit (LAU-FINAL-109).
 *
 * Aujourd'hui, trois LIGNES portent une « chose à faire », chacune avec sa table,
 * son vocabulaire de statut et ses écrans (inventaire complet : ligne #2395.1 du
 * registre `.claude/notes/registre-2026-09-20-chat-lot4.md`) :
 *
 *  - `action_plan_items` — le plan de Laura, l'écran Actions, les relances ;
 *  - `tasks` — les tâches CRM natives, le brief du jour ;
 *  - `outreach_call_tasks` — les tâches d'appel de l'outreach.
 *
 * #2395.10 — UNE quatrième, additive (24/09) : `interventions` — la file du
 * responsable (renouvellement à risque, CRA manquant, facturation bloquée…),
 * remplie par `InterventionsSweeper`, déjà rendue par `DailyGesturesBlock`
 * (`/briefing`). Adaptateur écrit ET testé (`canonicalActionFromIntervention`),
 * MAIS délibérément non branché dans `CanonicalActionsElsewhere.tsx` (écran
 * Actions) : l'y afficher AUSSI dupliquerait la même ligne sur deux écrans, ce
 * que #2395.11 interdit. Sa maison affichée reste `/briefing` seul, pour l'instant.
 *
 * Ce contrat ne les REMPLACE pas (ajout seulement, aucune table renommée ni
 * migrée) : il est la PROJECTION commune dans laquelle chacune se lit, par un
 * adaptateur pur par modèle. Un écran qui lit ce contrat voit la même action,
 * avec les mêmes champs, quelle que soit sa table d'origine.
 *
 * ⚠️ « On n'affiche pas ce qu'on n'a pas » : un champ qu'AUCUN modèle ne
 * renseigne aujourd'hui (collaborateurs, preuves, condition, repli, approbation,
 * automatisation, identifiant externe, conversation, motif d'écartement,
 * version) est `.optional()` et aucun adaptateur ne l'écrit — il est déclaré pour
 * que le schéma soit complet, jamais rempli d'une valeur par défaut. Un champ que
 * CERTAINS modèles portent est `.nullable()` : `null` veut dire « non renseigné
 * sur cette ligne », ce qui n'est ni « 0 » ni « faible » (GA-18 / GA-19).
 */

/** #2395.3 — douze statuts, du suggéré à l'obsolète. Jamais seulement todo/done. */
export const CANONICAL_ACTION_STATUSES = [
  'suggested',
  'accepted',
  'scheduled',
  'in_progress',
  'waiting_external',
  'waiting_internal',
  'blocked',
  'completed',
  'failed',
  'cancelled',
  'dismissed',
  'obsolete',
] as const
export const canonicalActionStatusSchema = z.enum(CANONICAL_ACTION_STATUSES)
type CanonicalActionStatus = z.infer<typeof canonicalActionStatusSchema>

const TERMINAL_STATUSES: ReadonlySet<CanonicalActionStatus> = new Set([
  'completed',
  'failed',
  'cancelled',
  'dismissed',
  'obsolete',
])

/** Une action est OUVERTE tant qu'elle n'a pas atteint un statut terminal. */
export function isCanonicalActionOpen(status: CanonicalActionStatus): boolean {
  return !TERMINAL_STATUSES.has(status)
}

/** #2395.4 — dix-sept types, de l'appel à l'action personnalisée. */
export const CANONICAL_ACTION_TYPES = [
  'call',
  'email',
  'meeting',
  'research',
  'enrich',
  'review',
  'approve',
  'import',
  'update',
  'request',
  'collect',
  'qualify',
  'match',
  'submit',
  'renew',
  'invoice',
  'custom',
] as const
export const canonicalActionTypeSchema = z.enum(CANONICAL_ACTION_TYPES)

/**
 * #2395.7 — d'où vient l'action : créée par l'utilisateur, recommandée par
 * Laura, déclenchée par une règle, issue d'un connecteur, importée, créée par
 * un manager, dérivée d'un événement.
 */
export const CANONICAL_ACTION_SOURCES = ['user', 'laura', 'rule', 'connector', 'import', 'manager', 'event'] as const
export const canonicalActionSourceSchema = z.enum(CANONICAL_ACTION_SOURCES)
type CanonicalActionSource = z.infer<typeof canonicalActionSourceSchema>

/**
 * #2395.9 — les huit résultats attendus (information, validation, rendez-vous,
 * document, paiement, feedback, décision, autre). Les libellés humains vivent
 * dans l'i18n du web ; ici, les clés.
 */
export const CANONICAL_ACTION_EXPECTED_OUTCOMES = [
  'information',
  'validation',
  'meeting',
  'document',
  'payment',
  'feedback',
  'decision',
  'other',
] as const
export const canonicalActionExpectedOutcomeSchema = z.enum(CANONICAL_ACTION_EXPECTED_OUTCOMES)
type CanonicalActionExpectedOutcome = z.infer<typeof canonicalActionExpectedOutcomeSchema>

/**
 * Les modèles d'origine lus aujourd'hui — la maison native de chaque action.
 *
 * #2871 — `generated_plan` est la seule origine SANS table : une étape du plan
 * généré du compte (`raw_analysis`), projetée en lecture seule tant que
 * personne ne l'a actée. Elle ne se modifie donc nulle part — l'acter crée sa
 * ligne `plan_item`, qui la remplace (voir {@link projectAccountPlanActions}).
 */
export const CANONICAL_ACTION_ORIGINS = ['plan_item', 'task', 'call_task', 'intervention', 'generated_plan'] as const
export const canonicalActionOriginSchema = z.enum(CANONICAL_ACTION_ORIGINS)
type CanonicalActionOrigin = z.infer<typeof canonicalActionOriginSchema>

/** L'objet qu'une action vise : les huit natures du plan, plus le compte. */
export const CANONICAL_ACTION_OBJECT_TYPES = ['account', ...ACTION_TARGET_KINDS] as const
export const canonicalActionObjectTypeSchema = z.enum(CANONICAL_ACTION_OBJECT_TYPES)
type CanonicalActionObjectType = z.infer<typeof canonicalActionObjectTypeSchema>

const personRefSchema = z.object({ id: z.string().nullable(), name: z.string().nullable() })

export const canonicalActionSchema = z.object({
  /** `<origine>:<id natif>` — unique sur tout le produit, la clé de dédoublonnage (#2395.11). */
  action_id: z.string().min(1),
  /** La maison native : c'est là que l'action se modifie, jamais dans une copie. */
  origin: z.object({ model: canonicalActionOriginSchema, id: z.string().min(1) }),
  workspace_id: z.string().guid(),
  object_type: canonicalActionObjectTypeSchema.nullable(),
  object_id: z.string().nullable(),
  object_label: z.string().nullable(),
  account_id: z.string().nullable(),
  account_name: z.string().nullable(),
  contact_id: z.string().nullable(),
  opportunity_id: z.string().nullable().optional(),
  need_id: z.string().nullable(),
  talent_id: z.string().nullable().optional(),
  mission_id: z.string().nullable().optional(),
  /** `null` = non typée : aucun type n'est déduit d'un libellé libre. */
  type: canonicalActionTypeSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  objective: z.string().nullable(),
  /** Rangée dans l'enum SEULEMENT quand la valeur stockée en est une. */
  expected_outcome: canonicalActionExpectedOutcomeSchema.nullable(),
  /** Le résultat attendu saisi en texte libre, tel quel, quand il n'est pas une des huit clés. */
  expected_outcome_note: z.string().nullable(),
  owner: personRefSchema.nullable(),
  collaborators: z.array(personRefSchema).optional(),
  /** Un jour (`YYYY-MM-DD`) ou un instant ISO — tel que la maison native le porte. */
  due_at: z.string().nullable(),
  priority: z.enum(['normal', 'high']).nullable(),
  status: canonicalActionStatusSchema,
  /** Le statut dans le vocabulaire de la maison native, pour qu'aucune nuance ne se perde. */
  native_status: z.string(),
  source: canonicalActionSourceSchema.nullable(),
  source_at: z.string().nullable(),
  evidence: z.array(z.string()).optional(),
  confidence: actionConfidenceSchema.nullable(),
  channel: planActionChannelSchema.nullable(),
  connector: z.string().nullable().optional(),
  /** Crédits. `0` est une mesure (gratuit), `null` une absence. */
  cost_credits: z.number().int().min(0).nullable(),
  permission: z.string().nullable().optional(),
  approval: z.string().nullable().optional(),
  automation_id: z.string().nullable().optional(),
  parent_action_id: z.string().nullable().optional(),
  /** `action_id` des actions à faire AVANT celle-ci. */
  dependencies: z.array(z.string()),
  condition: z.string().nullable().optional(),
  fallback: z.string().nullable().optional(),
  result: z.string().nullable(),
  external_id: z.string().nullable().optional(),
  conversation_id: z.string().nullable().optional(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
  dismissed_reason: z.string().nullable().optional(),
  version: z.number().int().optional(),
})
export type CanonicalAction = z.infer<typeof canonicalActionSchema>

/**
 * `unavailable` — les maisons qu'on n'a PAS pu lire. Une lecture en échec n'est
 * pas « rien à faire » : l'écran la nomme au lieu de rendre une liste amputée
 * comme si elle était complète.
 */
export const listCanonicalActionsResponseSchema = z.object({
  actions: z.array(canonicalActionSchema),
  unavailable: z.array(canonicalActionOriginSchema),
})
export type ListCanonicalActionsResponse = z.infer<typeof listCanonicalActionsResponseSchema>

/**
 * #2395.9 — un texte libre qui n'est pas littéralement une des huit clés ne se
 * range JAMAIS de force (il reste en note) ; mais quand le CANAL déjà connu du
 * geste dit sans ambiguïté ce qu'il vise (une réunion), l'attendu se déduit du
 * canal — sans jamais perdre le texte libre écrit à côté.
 */
function expectedOutcomeOf(
  raw: string | null,
  channel?: PlanActionChannel | null,
): {
  expected_outcome: CanonicalActionExpectedOutcome | null
  expected_outcome_note: string | null
} {
  const value = raw?.trim() || null
  const known = value ? canonicalActionExpectedOutcomeSchema.safeParse(value) : null
  if (known?.success) return { expected_outcome: known.data, expected_outcome_note: null }
  const fromChannel = channel ? (EXPECTED_OUTCOME_OF_CHANNEL[channel] ?? null) : null
  return { expected_outcome: fromChannel, expected_outcome_note: value }
}

function actionIdOf(model: CanonicalActionOrigin, id: string): string {
  return `${model}:${id}`
}

const PLAN_STATUS: Record<MyPlanAction['execution_status'], CanonicalActionStatus> = {
  todo: 'accepted',
  snoozed: 'scheduled',
  prepared: 'in_progress',
  done: 'completed',
  // #2317.12 — le douzième statut canonique (`obsolete`, #2395.3) existait
  // déjà SANS qu'aucune maison native ne puisse l'atteindre : le plan de
  // Laura est la première à l'écrire réellement (geste manuel du menu
  // d'exécution, `ActionPlanItemsService`/`applyStatus`).
  obsolete: 'obsolete',
}

/** `pipeline` = nos services déterministes (provenance.ts) : une RÈGLE, pas Laura. */
const FIELD_SOURCE_TO_ACTION: Record<EvidenceFieldSource, CanonicalActionSource> = {
  human: 'user',
  connector: 'connector',
  pipeline: 'rule',
  model: 'laura',
}

/** Seules les natures SANS ambiguïté donnent un type ; le reste reste non typé. */
const TYPE_OF_TARGET: Partial<Record<CanonicalActionObjectType, z.infer<typeof canonicalActionTypeSchema>>> = {
  meeting: 'meeting',
}

/**
 * #2395.4 — le CANAL déjà écrit par le plan de Laura détermine le type SANS
 * deviner, exactement comme la cible « meeting » juste au-dessus : un appel
 * téléphonique est un `call`, un e-mail un `email`, une réunion un `meeting`.
 * LinkedIn n'a pas de correspondance sans ambiguïté dans les dix-sept types
 * (ni « message », ni « social ») et reste absent de cette table — jamais un
 * type inventé pour occuper la case.
 */
const TYPE_OF_CHANNEL: Partial<Record<PlanActionChannel, z.infer<typeof canonicalActionTypeSchema>>> = {
  phone: 'call',
  email: 'email',
  meeting: 'meeting',
}

/**
 * #2395.9 — un canal réunion dit, PAR CONSTRUCTION, que l'attendu est le
 * rendez-vous lui-même : le geste EST la réunion. Les autres canaux restent
 * ambigus (un appel peut viser une info, une validation, une décision…) et ne
 * déterminent donc rien ici — le texte libre reste la seule source pour eux.
 */
const EXPECTED_OUTCOME_OF_CHANNEL: Partial<Record<PlanActionChannel, CanonicalActionExpectedOutcome>> = {
  meeting: 'meeting',
}

/** #2395.1 — une ligne `action_plan_items` (plan de Laura, écran Actions, relances). */
export function canonicalActionFromPlanItem(item: MyPlanAction, workspaceId: string): CanonicalAction {
  const target = item.target
  // #2395.4 — la cible « meeting » gagne (comme avant) ; sinon le canal déjà
  // connu (téléphone/e-mail/réunion) détermine le type sans qu'on le devine.
  const typeFromChannel = item.channel ? (TYPE_OF_CHANNEL[item.channel] ?? null) : null
  return {
    action_id: actionIdOf('plan_item', item.id),
    origin: { model: 'plan_item', id: item.id },
    workspace_id: workspaceId,
    object_type: target ? target.kind : 'account',
    object_id: target ? target.id : item.account_id,
    object_label: target ? target.label : item.company_name,
    account_id: item.account_id,
    account_name: item.company_name,
    contact_id: item.contact_id,
    need_id: target?.kind === 'need' ? target.id : null,
    type: (target ? TYPE_OF_TARGET[target.kind] : undefined) ?? typeFromChannel,
    title: item.label,
    description: item.reason,
    objective: null,
    ...expectedOutcomeOf(item.expected_outcome, item.channel),
    owner: item.assigned_to || item.owner_name ? { id: item.assigned_to, name: item.owner_name } : null,
    due_at: item.due_date,
    priority: null,
    status: PLAN_STATUS[item.execution_status],
    native_status: item.execution_status,
    source: item.provenance ? FIELD_SOURCE_TO_ACTION[item.provenance.source] : null,
    source_at: item.provenance?.at ?? null,
    confidence: item.confidence,
    channel: target?.kind === 'meeting' ? 'meeting' : item.channel,
    cost_credits: item.cost_credits,
    dependencies: item.depends_on_item_id ? [actionIdOf('plan_item', item.depends_on_item_id)] : [],
    result: item.result,
    created_by: null,
    created_at: item.created_at,
    completed_at: item.completed_at,
  }
}

const TASK_STATUS: Record<Task['status'], CanonicalActionStatus> = {
  todo: 'accepted',
  done: 'completed',
  cancelled: 'cancelled',
}

function taskObject(task: Task): Pick<CanonicalAction, 'object_type' | 'object_id' | 'object_label'> {
  if (task.projectId) return { object_type: 'project', object_id: task.projectId, object_label: task.projectLabel }
  if (task.contactId) return { object_type: 'contact', object_id: task.contactId, object_label: task.contactName }
  if (task.accountId) return { object_type: 'account', object_id: task.accountId, object_label: task.accountName }
  return { object_type: null, object_id: null, object_label: null }
}

/** #2395.1 — une ligne `tasks` (tâches CRM natives, brief du jour). */
export function canonicalActionFromTask(task: Task, workspaceId: string): CanonicalAction {
  // #2395.4/#2395.9 (épopée #2901) — même dérivation que le plan de Laura
  // (`TYPE_OF_CHANNEL`/`EXPECTED_OUTCOME_OF_CHANNEL`, GA-26) : le canal posé
  // à la création détermine le type SANS deviner un texte libre.
  const typeFromChannel = task.channel ? (TYPE_OF_CHANNEL[task.channel] ?? null) : null
  return {
    action_id: actionIdOf('task', task.id),
    origin: { model: 'task', id: task.id },
    workspace_id: workspaceId,
    ...taskObject(task),
    account_id: task.accountId,
    account_name: task.accountName,
    contact_id: task.contactId,
    need_id: null,
    type: typeFromChannel,
    title: task.title,
    description: task.details,
    // #2395.8 (épopée #2871) — la colonne existe désormais (`tasks.objective`) ;
    // `null` pour toute tâche créée avant elle, jamais un objectif deviné.
    objective: task.objective,
    ...expectedOutcomeOf(null, task.channel),
    owner: task.ownerId || task.ownerName ? { id: task.ownerId, name: task.ownerName } : null,
    due_at: task.dueOn,
    priority: task.priority,
    status: TASK_STATUS[task.status],
    native_status: task.status,
    // Une tâche ne s'écrit que par un geste humain (`POST /tasks`) ; sans
    // `created_by`, on ne sait pas qui — la source reste non renseignée.
    source: task.createdById ? 'user' : null,
    source_at: task.createdById ? task.createdAt : null,
    confidence: null,
    channel: task.channel,
    cost_credits: null,
    dependencies: [],
    result: task.resultNote,
    created_by: task.createdById,
    created_at: task.createdAt,
    completed_at: task.completedAt,
  }
}

const CALL_STATUS: Record<OutreachCallTask['status'], CanonicalActionStatus> = {
  proposed: 'suggested',
  ready: 'accepted',
  scheduled: 'scheduled',
  due: 'scheduled',
  callback: 'scheduled',
  started: 'in_progress',
  completed: 'completed',
  qualified: 'completed',
  refused: 'completed',
  no_answer: 'failed',
  wrong_person: 'failed',
  cancelled: 'cancelled',
}

/** #2395.1 — une ligne `outreach_call_tasks` (tâches d'appel). */
export function canonicalActionFromCallTask(call: OutreachCallTask, workspaceId: string): CanonicalAction {
  return {
    action_id: actionIdOf('call_task', call.id),
    origin: { model: 'call_task', id: call.id },
    workspace_id: workspaceId,
    object_type: 'contact',
    object_id: call.contact_id,
    object_label: call.contact_name,
    account_id: null,
    account_name: null,
    contact_id: call.contact_id,
    need_id: null,
    type: 'call',
    title: call.reason,
    description: call.pitch,
    objective: call.objective,
    ...expectedOutcomeOf(call.expected_outcome),
    owner: call.user_id ? { id: call.user_id, name: null } : null,
    due_at: call.scheduled_at,
    priority: null,
    status: CALL_STATUS[call.status],
    native_status: call.status,
    // La surface d'où l'appel a été posé : Laura le recommande, toute autre
    // surface est un geste de l'utilisateur (`POST /outreach/call-tasks`).
    source: call.source === 'laura' ? 'laura' : 'user',
    source_at: call.created_at,
    confidence: null,
    channel: 'phone',
    cost_credits: null,
    dependencies: [],
    result: null,
    created_by: null,
    created_at: call.created_at,
    completed_at: null,
  }
}

/** Seuls deux des six sujets d'intervention sont un `object_type` du contrat
 *  (`account`, `project`) : les autres (mission, submission, user, workspace)
 *  n'ont pas de nature déclarée ici — `mission_id` les porte à part, le reste
 *  reste `null` plutôt qu'une valeur devinée (GA-18/GA-19). */
const INTERVENTION_OBJECT_TYPE: Partial<Record<Intervention['subjectType'], CanonicalActionObjectType>> = {
  account: 'account',
  project: 'project',
}

const INTERVENTION_STATUS: Record<Intervention['state'], CanonicalActionStatus> = {
  open: 'suggested',
  acknowledged: 'in_progress',
  resolved: 'completed',
}

/**
 * #2395.10 — une ligne `interventions` (la file du responsable : renouvellement
 * à risque, CRA manquant, facturation bloquée… — déjà rendue par
 * `DailyGesturesBlock`, `/briefing`).
 *
 * `detail` est la seule phrase que la maison porte (« ce qui est arrivé, en
 * une phrase, avec ses chiffres ») : elle devient le `title`, jamais recomposée
 * depuis `kind` (un enum ne s'écrit pas comme une phrase sans i18n, et
 * l'adaptateur reste pur, sans dépendance de traduction).
 */
export function canonicalActionFromIntervention(item: Intervention, workspaceId: string): CanonicalAction {
  const objectType = INTERVENTION_OBJECT_TYPE[item.subjectType] ?? null
  return {
    action_id: actionIdOf('intervention', item.id),
    origin: { model: 'intervention', id: item.id },
    workspace_id: workspaceId,
    object_type: objectType,
    object_id: item.subjectId,
    object_label: item.subjectLabel,
    account_id: item.subjectType === 'account' ? item.subjectId : null,
    account_name: item.subjectType === 'account' ? item.subjectLabel : null,
    contact_id: null,
    need_id: null,
    mission_id: item.subjectType === 'mission' ? item.subjectId : null,
    type: null,
    title: item.detail,
    description: null,
    objective: null,
    expected_outcome: null,
    expected_outcome_note: null,
    owner: item.ownerId || item.ownerName ? { id: item.ownerId, name: item.ownerName } : null,
    due_at: null,
    priority: null,
    status: INTERVENTION_STATUS[item.state],
    native_status: item.state,
    // Détecté par une règle (`InterventionsSweeper`), jamais par Laura ni un
    // geste humain.
    source: 'rule',
    source_at: item.openedAt,
    confidence: null,
    channel: null,
    cost_credits: null,
    dependencies: [],
    result: null,
    created_by: null,
    created_at: item.openedAt,
    completed_at: item.resolvedAt,
  }
}

/**
 * #2871 — ce qu'il faut savoir du compte pour projeter son plan généré.
 *
 * `analysisVersion` est l'instant qui a PRODUIT le plan (`accounts.last_analyzed_at`) :
 * il entre dans l'identifiant, si bien qu'une ré-analyse donne des ids neufs à
 * des étapes neuves, jamais l'id d'une ancienne étape à une nouvelle.
 */
export type GeneratedPlanContext = {
  workspaceId: string
  accountId: string
  accountName: string | null
  analysisVersion: string
}

/**
 * L'identifiant NATIF d'une étape générée : compte, version d'analyse, rang
 * (phase, étape) DU PLAN. Déterministe — deux lectures du même plan donnent le
 * même id, sans qu'aucune ligne ne soit écrite pour le fixer.
 */
export function generatedPlanStepId(
  accountId: string,
  analysisVersion: string,
  weekIndex: number,
  stepIndex: number,
): string {
  return `${accountId}:${analysisVersion}:${weekIndex}-${stepIndex}`
}

const GENERATED_STEP_POSITION = /:(\d+)-(\d+)$/

/** Le rang (phase, étape) d'une action projetée depuis le plan généré ; `null` pour toute autre maison. */
export function generatedPlanStepPosition(action: CanonicalAction): { weekIndex: number; stepIndex: number } | null {
  if (action.origin.model !== 'generated_plan') return null
  const match = GENERATED_STEP_POSITION.exec(action.origin.id)
  return match ? { weekIndex: Number(match[1]), stepIndex: Number(match[2]) } : null
}

/**
 * #2871 — une étape du plan GÉNÉRÉ du compte, projetée sans être écrite.
 *
 * Statut `suggested` : Laura la propose, personne ne l'a encore actée. Rien
 * n'est deviné — le `responsable` du générateur mêle le porteur et le contact
 * visé (pas attribuable : `owner` reste `null`), son `deadline` est un horizon
 * relatif (`J+1`), pas une date (`due_at` reste `null`), et seul un des quatre
 * canaux canoniques est retenu, comme au semis des lignes persistées.
 */
export function canonicalActionFromGeneratedPlanStep(
  step: GeneratedPlanStep,
  weekIndex: number,
  stepIndex: number,
  context: GeneratedPlanContext,
): CanonicalAction {
  const id = generatedPlanStepId(context.accountId, context.analysisVersion, weekIndex, stepIndex)
  const knownChannel = step.outil ? planActionChannelSchema.safeParse(step.outil.trim().toLowerCase()) : null
  const channel = knownChannel?.success ? knownChannel.data : null
  return {
    action_id: actionIdOf('generated_plan', id),
    origin: { model: 'generated_plan', id },
    workspace_id: context.workspaceId,
    object_type: 'account',
    object_id: context.accountId,
    object_label: context.accountName,
    account_id: context.accountId,
    account_name: context.accountName,
    contact_id: null,
    need_id: null,
    type: channel ? (TYPE_OF_CHANNEL[channel] ?? null) : null,
    title: step.text,
    description: null,
    objective: null,
    ...expectedOutcomeOf(step.expectedOutcome ?? null, channel),
    owner: null,
    due_at: null,
    priority: null,
    status: 'suggested',
    native_status: 'generated',
    source: 'laura',
    source_at: context.analysisVersion,
    confidence: null,
    channel,
    cost_credits: null,
    dependencies: [],
    result: null,
    created_by: null,
    created_at: context.analysisVersion,
    completed_at: null,
  }
}

/**
 * #2871 (#2395.1/.5/.11) — LE PLAN DU COMPTE, au contrat canonique : les étapes
 * générées ET les lignes persistées, une seule fois chacune.
 *
 *  - chaque étape exprimée du plan, dans l'ordre du plan ; une étape sans
 *    texte n'est pas une action (même règle que le semis), mais elle ne
 *    renumérote pas les suivantes — le rang reste celui du PLAN ;
 *  - une étape ACTÉE (une ligne `action_plan_items` à son rang) GAGNE : la
 *    ligne revendique l'id déterministe de l'étape qu'elle recouvre, et
 *    prend sa place ;
 *  - les lignes persistées hors du plan courant (plan régénéré depuis) ne
 *    disparaissent pas : elles suivent ; les saisies à la main viennent en
 *    dernier.
 *
 * Aucun filtre « ouvertes » ici (à la différence de {@link mergeCanonicalActions}) :
 * la fiche compte montre aussi ce qui est fait.
 */
export function projectAccountPlanActions(input: {
  context: GeneratedPlanContext
  weeks: readonly GeneratedPlanPhase[]
  persisted: readonly ActionPlanItem[]
}): CanonicalAction[] {
  const { context, weeks, persisted } = input
  const asCanonical = (item: ActionPlanItem) =>
    canonicalActionFromPlanItem({ ...item, company_name: context.accountName }, context.workspaceId)
  const manual = persisted.filter(item => item.week_index >= MANUAL_ACTION_WEEK_INDEX)
  const claimed = new Map<string, ActionPlanItem>()
  for (const item of persisted) {
    if (item.week_index >= MANUAL_ACTION_WEEK_INDEX) continue
    claimed.set(generatedPlanStepId(context.accountId, context.analysisVersion, item.week_index, item.step_index), item)
  }
  const projected: CanonicalAction[] = []
  const placed = new Set<string>()
  weeks.forEach((week, weekIndex) => {
    week.items.forEach((step, stepIndex) => {
      const id = generatedPlanStepId(context.accountId, context.analysisVersion, weekIndex, stepIndex)
      const acted = claimed.get(id)
      if (acted) {
        projected.push(asCanonical(acted))
        placed.add(acted.id)
      } else if (step.text.trim()) {
        projected.push(canonicalActionFromGeneratedPlanStep(step, weekIndex, stepIndex, context))
      }
    })
  })
  const outsidePlan = [...claimed.values()].filter(item => !placed.has(item.id))
  return [...projected, ...outsidePlan.map(asCanonical), ...manual.map(asCanonical)]
}

/**
 * #2395.11 — la fusion : une action n'apparaît qu'UNE fois (dédoublonnage par
 * `action_id`) et seules les ouvertes restent. Tri : les datées d'abord, la plus
 * proche en tête ; les non datées ensuite, la plus récente en premier.
 */
export function mergeCanonicalActions(...lists: readonly CanonicalAction[][]): CanonicalAction[] {
  const byId = new Map<string, CanonicalAction>()
  for (const list of lists) {
    for (const action of list) {
      if (!isCanonicalActionOpen(action.status) || byId.has(action.action_id)) continue
      byId.set(action.action_id, action)
    }
  }
  return [...byId.values()].sort((a, b) => {
    if (a.due_at && b.due_at) return a.due_at.slice(0, 10).localeCompare(b.due_at.slice(0, 10))
    if (a.due_at) return -1
    if (b.due_at) return 1
    return b.created_at.localeCompare(a.created_at)
  })
}
