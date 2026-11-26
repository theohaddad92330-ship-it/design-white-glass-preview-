import type {
  ActionRisk,
  ActionTargetKind,
  AtsWriteRequestView,
  CanonicalAction,
  CrmWriteRequestView,
  MyPlanAction,
  OutreachCallTask,
  OutreachMessage,
  OutreachSequence,
  PlaybookApproval,
} from '@bellum/contracts'
import type { ApprovalRequestView } from '../action-os/api'
import { approvalFacts } from '../action-os/queueFilters'
import { sectionOfDue, type TodaySectionKey } from './todayDates'
import { todayStateOf, type TodayStateKey } from './todayStates'

/**
 * Lot L-A (#4164) — LA FILE UNIQUE « AUJOURD'HUI » (modèle pur, sans React).
 *
 * Neuf maisons natives écrivaient chacune leur liste : approbations de l'Action
 * OS, écritures CRM, écritures ERP, envois de playbook, messages d'approche à
 * relire, relances du plan, étapes de séquence, tâches d'appel, tâches. Ce
 * fichier les FOND en un seul type, `TodayItem`, sans jamais déplacer l'écriture :
 * chaque item garde sa maison (`kind` + `nativeId`), et c'est elle qui exécute le
 * geste (valider, cocher, reporter). Aucune liste parallèle n'est écrite ici.
 *
 * Trois règles, toutes de la doctrine :
 *  - une absence ne fait AUCUNE ligne : un groupe ou une section vide n'existe
 *    pas dans le résultat — il n'y a donc jamais un « 0 » à afficher (GA-18/19) ;
 *  - une échéance inconnue n'est pas inventée : seul ce qui ATTEND un geste
 *    maintenant (une validation) tombe dans « Aujourd'hui » à défaut de date ;
 *    une relance sans échéance est « Plus tard » ;
 *  - un filtre change ce qu'on VOIT, jamais ce qui est dû : `unfilteredTotal`
 *    et `dayCount` ne dépendent pas des filtres.
 */

export const TODAY_GROUP_ORDER = ['validate', 'email', 'linkedin', 'call', 'task'] as const
export type TodayGroupKey = (typeof TODAY_GROUP_ORDER)[number]

type TodaySourceKey = 'sequence' | 'plan' | 'laura' | 'automation'

type TodayItemKind =
  | 'approval'
  | 'crm_write'
  | 'erp_write'
  | 'playbook_send'
  | 'message'
  | 'plan_item'
  | 'sequence_step'
  | 'call_task'
  | 'task'

/** « Pourquoi maintenant » : une étape de séquence, un déclencheur, ou une phrase écrite. */
type TodayWhy =
  | { kind: 'step'; position: number; total: number; sequenceName: string }
  | { kind: 'trigger'; trigger: string }
  /** Qui a lancé une approbation de l'Action OS, depuis quoi, et la prochaine étape si on approuve. */
  | { kind: 'trace'; trigger: string; triggeredByName: string | null; nextStepKey: string | null }
  | { kind: 'text'; text: string }
  /** #4163 LF — la source ne dit pas POURQUOI : on NOMME d'où vient la carte (jamais une raison inventée). */
  | { kind: 'origin'; origin: TodayOrigin; accountName: string | null }

/** D'où vient une carte quand sa source n'écrit aucune raison. */
type TodayOrigin = 'plan' | 'task' | 'call' | 'crm' | 'erp' | 'send' | 'approval' | 'sequence' | 'message'

const origin = (kind: TodayOrigin, accountName: string | null = null): TodayWhy => ({
  kind: 'origin',
  origin: kind,
  accountName: accountName || null,
})

/** Une ligne de la prévisualisation figée d'une écriture : champ, nouvelle valeur, ancienne si connue. */
type TodayDetailLine = { label: string; value: string; previous: string | null; key: string | null }

type TodayGestures = {
  /** Valider / envoyer / approuver — la décision de la maison native. */
  validate: boolean
  reject: boolean
  edit: boolean
  /** « Fait » : déclaratif, jamais une preuve d'envoi (c73). */
  done: boolean
  postpone: boolean
}

export type TodayItem = {
  /** `<kind>:<id natif>` — unique, la clé de dédoublonnage et de React. */
  id: string
  kind: TodayItemKind
  nativeId: string
  group: TodayGroupKey
  source: TodaySourceKey
  dueAt: string | null
  title: string
  accountId: string | null
  accountName: string | null
  contactId: string | null
  contactName: string | null
  /** La fonction du contact quand la source la porte — sert à ne jamais l'écrire deux fois quand elle tient lieu de nom. */
  contactRole: string | null
  why: TodayWhy | null
  /** #4521.2 — le signal cité par la consigne d'une relance du plan, en une ligne, avec sa date si connue. `null` = aucun. */
  signal: { text: string; at: string | null } | null
  /** La nature de la demande, en clé `center.<kindKey>` (écritures CRM / ERP) — `null` ailleurs. */
  kindKey: string | null
  /** Qui est à l'origine d'une écriture CRM : une automatisation, toi, un collègue. */
  originKey: 'system' | 'you' | 'otherUser' | null
  /** La prévisualisation FIGÉE champ par champ (écriture CRM) — jamais un recalcul. */
  detail: TodayDetailLine[] | null
  /** Le reste du résumé d'une approbation, après sa première ligne. */
  body: string | null
  /** Le coût annoncé en crédits : `null` = non mesuré (jamais 0). */
  credits: number | null
  /** La provenance nommée d'une écriture (`target.source.kind`) — `null` = geste direct ou non tracée. */
  sourceKey: string | null
  /** Quand la demande expire. */
  expiresAt: string | null
  /** Un message qui part à un client se lit en ENTIER avant d'être validé : jamais replié. */
  mustReadInFull: boolean
  draft: { subject: string | null; body: string } | null
  /** L'adresse du destinataire quand la maison la porte (envoi de playbook) — pour le `mailto:`. */
  recipient: string | null
  /** Le canal du geste, pour « Copier et ouvrir » (mailto, LinkedIn). */
  channel: 'email' | 'linkedin' | 'phone' | null
  risk: ActionRisk | null
  agent: 'human' | 'automation' | null
  gestures: TodayGestures
  /** Pourquoi on ne peut pas valider, quand c'est le cas (clé de blocage serveur). */
  blockedReason: string | null
  /** Ce que la maison native exige pour écrire (version vue, séquence parente, statut d'appel). */
  version: number | null
  parentId: string | null
  /** L'étape de séquence portée (ou liée) — c'est elle qu'on reporte. */
  stepId: string | null
  /** Le type d'objet visé par une relance du plan — il décide des issues proposées à « Fait ». */
  targetKind: ActionTargetKind | null
  status: string | null
  /** Le lot d'écritures CRM déposées ensemble (`null` = écriture seule). */
  batchId: string | null
}

const NO_GESTURES: TodayGestures = { validate: false, reject: false, edit: false, done: false, postpone: false }

export type TodaySources = {
  approvals: readonly ApprovalRequestView[]
  crm: readonly CrmWriteRequestView[]
  erp: readonly AtsWriteRequestView[]
  sends: readonly PlaybookApproval[]
  messages: readonly OutreachMessage[]
  plan: readonly MyPlanAction[]
  sequences: readonly OutreachSequence[]
  calls: readonly OutreachCallTask[]
  tasks: readonly CanonicalAction[]
}

const base = (
  kind: TodayItemKind,
  nativeId: string,
  fields: Partial<TodayItem> & Pick<TodayItem, 'group' | 'source' | 'title'>,
): TodayItem =>
  withoutRepeatedRole({
    id: `${kind}:${nativeId}`,
    kind,
    nativeId,
    dueAt: null,
    accountId: null,
    accountName: null,
    contactId: null,
    contactName: null,
    contactRole: null,
    why: null,
    signal: null,
    kindKey: null,
    originKey: null,
    detail: null,
    body: null,
    credits: null,
    sourceKey: null,
    expiresAt: null,
    mustReadInFull: false,
    draft: null,
    recipient: null,
    channel: null,
    risk: null,
    agent: null,
    gestures: NO_GESTURES,
    blockedReason: null,
    version: null,
    parentId: null,
    stepId: null,
    targetKind: null,
    status: null,
    batchId: null,
    ...fields,
  })

const sameText = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * #4163 LF — un contact SANS NOM porte sa fonction à la place du nom (« Responsable des achats… »). Quand le titre
 * de la carte (« Compte froid — Responsable des achats… ») la dit déjà, la ligne « qui » ne la répète pas : la
 * fonction s'écrit UNE fois. Un contact nommé garde sa ligne et son lien, titre ou pas.
 */
function withoutRepeatedRole(item: TodayItem): TodayItem {
  const { contactName, contactRole } = item
  if (!contactName || !contactRole || !sameText(contactName, contactRole)) return item
  return item.title.toLowerCase().includes(contactName.trim().toLowerCase()) ? { ...item, contactName: null } : item
}

const firstLine = (text: string): string =>
  text
    .split('\n')
    .find(line => line.trim().length > 0)
    ?.trim() ?? text

/** Les états où un appel est clos : il ne fait plus aucune ligne. */
const CLOSED_CALL_STATUSES: readonly string[] = [
  'completed',
  'no_answer',
  'wrong_person',
  'qualified',
  'refused',
  'cancelled',
]

/** Les vues de message qui ATTENDENT l'utilisateur (même liste que `OutreachQueuePreview`). */
const WAITING_MESSAGE_VIEWS: readonly string[] = ['to_review', 'modified', 'blocked']

const LINKEDIN_LABEL = /linkedin/i
const CALL_LABEL = /\b(appel|appeler|téléphon\w*|call)\b/i

/**
 * Le geste d'une étape de séquence. Une étape `email` est un e-mail ; un rappel
 * ou une tâche se range par son LIBELLÉ quand il dit LinkedIn ou appel — c'est
 * le texte du modèle de séquence, pas une déduction. Sinon : une tâche.
 */
function stepGroup(kind: string, label: string, templateKey: string | null): TodayGroupKey {
  if (kind === 'email') return 'email'
  // Le modèle nomme le canal (`cold_linkedin`) : ses étapes non e-mail sont des gestes LinkedIn.
  if (templateKey !== null && LINKEDIN_LABEL.test(templateKey)) return 'linkedin'
  if (LINKEDIN_LABEL.test(label)) return 'linkedin'
  if (CALL_LABEL.test(label)) return 'call'
  return 'task'
}

const channelOfGroup = (group: TodayGroupKey): TodayItem['channel'] =>
  group === 'email' ? 'email' : group === 'linkedin' ? 'linkedin' : group === 'call' ? 'phone' : null

function planGroup(channel: MyPlanAction['channel']): TodayGroupKey {
  if (channel === 'email') return 'email'
  if (channel === 'linkedin') return 'linkedin'
  if (channel === 'phone') return 'call'
  return 'task'
}

function readLabel(step: OutreachSequence['steps'][number]): string {
  const label = step.payload?.['label']
  return typeof label === 'string' ? label : ''
}

function readEmailDraft(step: OutreachSequence['steps'][number]): TodayItem['draft'] {
  const draft = step.payload?.['email_draft']
  if (!draft || typeof draft !== 'object') return null
  const { subject, body } = draft as { subject?: unknown; body?: unknown }
  return typeof body === 'string' ? { subject: typeof subject === 'string' ? subject : null, body } : null
}

function approvalItem(approval: ApprovalRequestView): TodayItem {
  const facts = approvalFacts(approval)
  const title = firstLine(approval.summary)
  const rest = approval.summary.slice(approval.summary.indexOf(title) + title.length).trim()
  return base('approval', approval.id, {
    group: 'validate',
    source: facts.agent === 'human' ? 'laura' : 'automation',
    title,
    body: rest.length > 0 ? rest : null,
    credits: approval.estimated_credits,
    expiresAt: approval.expires_at,
    accountName: approval.trace?.accountName ?? null,
    why: approval.trace
      ? {
          kind: 'trace',
          trigger: approval.trace.trigger,
          triggeredByName: approval.trace.triggeredByName,
          nextStepKey: approval.nextStepKey ?? null,
        }
      : origin('approval'),
    risk: facts.risk,
    agent: facts.agent,
    gestures: { ...NO_GESTURES, validate: true, reject: true, postpone: true },
  })
}

function crmItem(request: CrmWriteRequestView): TodayItem {
  const preview = (request.preview ?? []).map(line => `${line.field} : ${line.value}`).join(' · ')
  return base('crm_write', request.id, {
    group: 'validate',
    source: request.origin === 'system' ? 'automation' : 'laura',
    title: preview || request.kind,
    why: origin('crm', request.target?.accountName),
    kindKey: `crm.kind.${request.kind}`,
    originKey: request.origin === 'system' ? 'system' : request.requestedByYou ? 'you' : 'otherUser',
    detail: (request.preview ?? []).map(line => ({
      label: line.field,
      value: line.value,
      previous: line.previous ?? null,
      key: line.key ?? null,
    })),
    sourceKey: request.target?.source?.kind ?? null,
    batchId: request.batchId ?? null,
    expiresAt: request.expiresAt,
    accountId: request.target?.accountId ?? null,
    accountName: request.target?.accountName ?? null,
    contactId: request.target?.contactId ?? null,
    contactName: request.target?.contactName ?? null,
    risk: request.target?.risk ?? null,
    agent: request.origin === 'system' ? 'automation' : 'human',
    // Une demande d'avant les clés de ligne se relit très bien, elle ne se révise simplement pas.
    gestures: {
      ...NO_GESTURES,
      validate: true,
      reject: true,
      postpone: true,
      edit: (request.preview ?? []).some(line => Boolean(line.key)),
    },
  })
}

function erpItem(request: AtsWriteRequestView): TodayItem {
  return base('erp_write', request.id, {
    group: 'validate',
    source: 'laura',
    title: firstLine(request.preview),
    why: origin('erp', request.target?.accountName),
    kindKey: `erp.kind.${request.kind}`,
    expiresAt: request.expiresAt,
    accountName: request.target?.accountName ?? null,
    contactName: request.target?.contactName ?? null,
    risk: request.target?.risk ?? null,
    blockedReason: request.canDecide ? null : (request.blockedReason ?? 'cannot_decide'),
    gestures: { ...NO_GESTURES, validate: request.canDecide, reject: request.canDecide, postpone: true },
  })
}

function sendItem(send: PlaybookApproval): TodayItem {
  return base('playbook_send', send.id, {
    group: 'validate',
    source: 'automation',
    title: send.subject,
    why: origin('send', send.target?.accountName),
    accountName: send.target?.accountName ?? null,
    contactName: send.target?.contactName ?? send.recipient,
    draft: { subject: send.subject, body: send.body },
    mustReadInFull: true,
    expiresAt: send.expiresAt,
    recipient: send.recipient,
    channel: 'email',
    agent: 'automation',
    gestures: { ...NO_GESTURES, validate: true, reject: true, postpone: true },
  })
}

function messageItem(message: OutreachMessage, sequence: OutreachSequence | undefined): TodayItem {
  const step = sequence?.steps.find(candidate => candidate.id === message.sequence_step_id)
  const position = step ? sequence?.steps.findIndex(candidate => candidate.id === step.id) : undefined
  const reviewable = message.view === 'to_review' || message.view === 'modified'
  const canValidate = message.can_approve && message.blockers.length === 0 && reviewable
  const editable =
    message.can_approve && ['drafted', 'needs_review', 'approved', 'scheduled', 'failed'].includes(message.status)
  // Lot L-D1 (#4167) — préparé par une RÈGLE : la source le dit, et le signal est le « pourquoi maintenant ».
  const fromAutomation = message.source === 'automation'
  return base('message', message.id, {
    group: 'validate',
    source: fromAutomation ? 'automation' : sequence ? 'sequence' : 'laura',
    agent: fromAutomation ? 'automation' : null,
    title: message.subject ?? firstLine(message.body),
    dueAt: step?.due_at ?? null,
    accountId: sequence?.account_id ?? null,
    accountName: message.account_name,
    contactId: message.contact_id,
    contactName: message.contact_name,
    contactRole: message.contact_role ?? null,
    why:
      fromAutomation && message.reason
        ? { kind: 'text', text: message.reason }
        : sequence && position !== undefined
          ? { kind: 'step', position: position + 1, total: sequence.steps.length, sequenceName: sequence.name }
          : message.reason
            ? { kind: 'text', text: message.reason }
            : origin(message.sequence_id ? 'sequence' : 'message'),
    draft: { subject: message.subject, body: message.body },
    channel:
      message.channel === 'email' || message.channel === 'linkedin' || message.channel === 'phone'
        ? message.channel
        : null,
    blockedReason: message.blockers[0] ?? null,
    version: message.current_version,
    parentId: sequence?.id ?? null,
    stepId: step?.id ?? null,
    gestures: { ...NO_GESTURES, validate: canValidate, edit: editable, postpone: Boolean(step) },
  })
}

function planItem(action: MyPlanAction): TodayItem {
  const group = planGroup(action.channel)
  return base('plan_item', action.id, {
    group,
    source: 'plan',
    title: action.label,
    dueAt: action.due_date,
    accountId: action.account_id,
    accountName: action.company_name,
    contactId: action.contact_id,
    // #4521.1/.2 — le contact et le signal résolus par le serveur : la carte les montre sans lire la consigne.
    contactName: action.contact_name ?? null,
    contactRole: action.contact_role ?? null,
    signal: action.signal ?? null,
    why: action.reason ? { kind: 'text', text: action.reason } : origin('plan', action.company_name),
    channel: channelOfGroup(group),
    targetKind: action.target?.kind ?? null,
    gestures: { ...NO_GESTURES, done: true, postpone: true },
  })
}

function stepItem(
  sequence: OutreachSequence,
  step: OutreachSequence['steps'][number],
  index: number,
  fromAutomation: boolean,
): TodayItem {
  const group = stepGroup(step.kind, readLabel(step), sequence.template_key ?? null)
  return base('sequence_step', step.id, {
    group,
    source: fromAutomation ? 'automation' : 'sequence',
    agent: fromAutomation ? 'automation' : null,
    title: readLabel(step) || sequence.name,
    dueAt: step.due_at,
    accountId: sequence.account_id,
    accountName: sequence.account_name,
    contactId: sequence.contact_id,
    contactName: sequence.contact_name,
    contactRole: sequence.contact_role ?? null,
    why: { kind: 'step', position: index + 1, total: sequence.steps.length, sequenceName: sequence.name },
    draft: step.kind === 'email' ? readEmailDraft(step) : null,
    channel: channelOfGroup(group),
    parentId: sequence.id,
    stepId: step.id,
    gestures: { ...NO_GESTURES, done: true, postpone: true },
  })
}

function callItem(call: OutreachCallTask, now: Date): TodayItem {
  return base('call_task', call.id, {
    group: 'call',
    source: call.source === 'automation' ? 'automation' : 'laura',
    agent: call.source === 'automation' ? 'automation' : null,
    title: call.objective,
    // Un appel « à passer » sans date est pour maintenant ; sans date et pas encore prêt, il n'a pas d'échéance.
    dueAt: call.scheduled_at ?? (call.status === 'due' ? now.toISOString() : null),
    contactId: call.contact_id,
    contactName: call.contact_name,
    why: call.reason?.trim() ? { kind: 'text', text: call.reason } : origin('call'),
    draft: call.pitch ? { subject: null, body: call.pitch } : null,
    channel: 'phone',
    status: call.status,
    gestures: { ...NO_GESTURES, done: true, postpone: true },
  })
}

function taskItem(action: CanonicalAction): TodayItem {
  return base('task', action.origin.id, {
    group: 'task',
    source: 'plan',
    title: action.title,
    dueAt: action.due_at,
    accountId: action.account_id,
    accountName: action.account_name,
    contactId: action.contact_id,
    why: action.objective ? { kind: 'text', text: action.objective } : origin('task', action.account_name),
    gestures: { ...NO_GESTURES, done: true, postpone: true },
  })
}

/** Les items de TOUTES les maisons, une seule liste. Une maison sans rien à dire n'ajoute rien. */
export function buildTodayItems(sources: TodaySources, now: Date): TodayItem[] {
  const sequenceById = new Map(sources.sequences.map(sequence => [sequence.id, sequence]))
  const messageStepIds = new Set(
    sources.messages.flatMap(message => (message.sequence_step_id ? [message.sequence_step_id] : [])),
  )

  // Lot L-D1 (#4167) — une séquence est née d'une règle quand l'un de ses messages l'est : la maison
  // native (messages) porte la provenance, aucune colonne de plus sur la séquence.
  const automationSequenceIds = new Set(
    sources.messages.flatMap(message =>
      message.source === 'automation' && message.sequence_id ? [message.sequence_id] : [],
    ),
  )

  const stepItems = sources.sequences.flatMap(sequence => {
    if (sequence.status !== 'active') return []
    const ordered = [...sequence.steps].sort((a, b) => a.position - b.position)
    // Seule la PROCHAINE étape à faire : les suivantes ne sont pas dues, les lister noierait la file.
    const index = ordered.findIndex(step => step.status === 'pending')
    const next = ordered[index]
    if (!next || messageStepIds.has(next.id)) return []
    return [stepItem({ ...sequence, steps: ordered }, next, index, automationSequenceIds.has(sequence.id))]
  })

  return [
    ...sources.sends.map(sendItem),
    ...sources.approvals.map(approvalItem),
    ...sources.erp.map(erpItem),
    ...sources.crm.map(crmItem),
    ...sources.messages
      .filter(message => message.view !== null && WAITING_MESSAGE_VIEWS.includes(message.view))
      .map(message => messageItem(message, message.sequence_id ? sequenceById.get(message.sequence_id) : undefined)),
    ...sources.plan.map(planItem),
    ...stepItems,
    ...sources.calls.filter(call => !CLOSED_CALL_STATUSES.includes(call.status)).map(call => callItem(call, now)),
    // Seules les tâches propres : le plan et les appels ont déjà leur maison ici (#2395.11).
    ...sources.tasks.filter(action => action.origin.model === 'task').map(taskItem),
  ]
}

export type TodayFilters = {
  gesture?: TodayGroupKey
  accountId?: string
  source?: TodaySourceKey
  risk?: ActionRisk
  agent?: 'human' | 'automation'
  /** Théo C actions-aujourdhui.N2 — la pastille d'état. */
  state?: TodayStateKey
}

/** Une carte de la file : une demande seule, ou un LOT d'écritures CRM déposées ensemble. */
type TodayEntry = { kind: 'item'; item: TodayItem } | { kind: 'batch'; batchId: string; items: TodayItem[] }

/**
 * #4167 (L-D2) — plusieurs écritures CRM du même `batchId` tiennent sur UNE carte, à la place de la
 * première. Un lot d'un seul élément reste une carte seule (jamais un lot deviné) ; seules les
 * écritures CRM se regroupent. Ce regroupement est un affichage : chaque écriture garde sa décision.
 */
export function groupBatches(items: readonly TodayItem[]): TodayEntry[] {
  const members = new Map<string, TodayItem[]>()
  for (const item of items) {
    if (item.kind !== 'crm_write' || !item.batchId) continue
    members.set(item.batchId, [...(members.get(item.batchId) ?? []), item])
  }
  const emitted = new Set<string>()
  return items.flatMap((item): TodayEntry[] => {
    const lot = item.kind === 'crm_write' && item.batchId ? members.get(item.batchId) : undefined
    if (!lot || lot.length < 2 || !item.batchId) return [{ kind: 'item', item }]
    if (emitted.has(item.batchId)) return []
    emitted.add(item.batchId)
    return [{ kind: 'batch', batchId: item.batchId, items: lot }]
  })
}

type TodayGroup = { key: TodayGroupKey; count: number; items: TodayItem[] }
type TodaySection = { key: TodaySectionKey; count: number; groups: TodayGroup[] }

export type TodayQueueOptions = {
  gestures: TodayGroupKey[]
  accounts: { id: string; name: string }[]
  sources: TodaySourceKey[]
  risks: ActionRisk[]
  agents: ('human' | 'automation')[]
}

type TodayQueue = {
  sections: TodaySection[]
  /** Ce qui reste après filtres. */
  total: number
  /** Ce qui est dû, filtres ignorés — un filtre change ce qu'on voit, jamais ce qui est dû. */
  unfilteredTotal: number
  /** Les gestes du jour : en retard + aujourd'hui. */
  dayCount: number
  /** #4353.1 — la part en retard de `dayCount`, nommée à part (« dont N en retard »), filtres ignorés. */
  overdueCount: number
  options: TodayQueueOptions
}

const SECTION_ORDER: readonly TodaySectionKey[] = ['overdue', 'today', 'week', 'later']

/** La section d'un item : sa date, sinon « aujourd'hui » pour une validation, « plus tard » pour le reste. */
function sectionOf(item: TodayItem, now: Date): TodaySectionKey {
  return sectionOfDue(item.dueAt, now) ?? (item.group === 'validate' ? 'today' : 'later')
}

function compareItems(a: TodayItem, b: TodayItem): number {
  if (a.dueAt && b.dueAt) {
    const delta = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
    if (delta !== 0 && !Number.isNaN(delta)) return delta
  } else if (a.dueAt || b.dueAt) {
    return a.dueAt ? -1 : 1
  }
  return a.title.localeCompare(b.title, 'fr')
}

function matches(item: TodayItem, filters: TodayFilters): boolean {
  if (filters.gesture && item.group !== filters.gesture) return false
  if (filters.accountId && item.accountId !== filters.accountId) return false
  if (filters.source && item.source !== filters.source) return false
  if (filters.risk && item.risk !== filters.risk) return false
  if (filters.agent && item.agent !== filters.agent) return false
  if (filters.state && todayStateOf(item) !== filters.state) return false
  return true
}

export function buildTodayQueue(items: readonly TodayItem[], filters: TodayFilters, now: Date): TodayQueue {
  const kept = items.filter(item => matches(item, filters)).sort(compareItems)

  const sections = SECTION_ORDER.flatMap(sectionKey => {
    const inSection = kept.filter(item => sectionOf(item, now) === sectionKey)
    const groups = TODAY_GROUP_ORDER.flatMap(groupKey => {
      const inGroup = inSection.filter(item => item.group === groupKey)
      return inGroup.length > 0 ? [{ key: groupKey, count: inGroup.length, items: inGroup }] : []
    })
    return groups.length > 0 ? [{ key: sectionKey, count: inSection.length, groups }] : []
  })

  const accounts = new Map<string, string>()
  for (const item of items) if (item.accountId && item.accountName) accounts.set(item.accountId, item.accountName)
  const present = <T>(pick: (item: TodayItem) => T | null): T[] =>
    [...new Set(items.flatMap(item => pick(item) ?? []))] as T[]

  return {
    sections,
    total: kept.length,
    unfilteredTotal: items.length,
    dayCount: items.filter(item => {
      const section = sectionOf(item, now)
      return section === 'overdue' || section === 'today'
    }).length,
    overdueCount: items.filter(item => sectionOf(item, now) === 'overdue').length,
    options: {
      gestures: TODAY_GROUP_ORDER.filter(group => items.some(item => item.group === group)),
      accounts: [...accounts].map(([id, name]) => ({ id, name })),
      sources: present(item => item.source),
      risks: present(item => item.risk),
      agents: present(item => item.agent),
    },
  }
}
