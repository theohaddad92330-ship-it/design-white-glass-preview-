import { z } from 'zod'
import { crmProviderSchema } from './crm-adapter.js'

/**
 * SYNC-A (19/10/2026, décision Louis : « toutes les infos, peu importe le CRM, on puisse les avoir dans
 * Bellum ») — le MIROIR des objets du CRM branché par l'espace : affaires, activités, propriétaires,
 * pipelines et leurs étapes.
 *
 * Jusqu'ici affaires et activités étaient lues À LA DEMANDE (Laura, signaux), jamais copiées. Le miroir
 * les copie dans des tables d'espace (`CRM_MIRROR_TABLES`), clé unique `(workspace_id, provider,
 * external_id)`, et les lecteurs le lisent d'abord.
 *
 * Règles qui tiennent tout :
 *  - un champ que le CRM ne rend pas est `null`, jamais une valeur devinée (« non mesuré » n'est jamais 0) ;
 *  - `status` d'une affaire n'est renseigné que si le CRM le dit lui-même ;
 *  - une fiche disparue du CRM est ARCHIVÉE (`archivedAt`), jamais supprimée ;
 *  - le CORPS d'un e-mail ou d'une note ne se stocke pas (doctrine c96) : une activité garde son type,
 *    son sujet et sa date — les schémas sont STRICTS, un `body` est refusé.
 */

/** Les tables du miroir, dans l'ordre de la migration (une étape suit son pipeline). */
export const CRM_MIRROR_TABLES = ['crm_deals', 'crm_activities', 'crm_owners', 'crm_pipelines', 'crm_stages'] as const

/** Le statut d'une affaire tel que le CRM le dit. CHECK SQL `crm_deals_status_check`. */
export const CRM_MIRROR_DEAL_STATUSES = ['open', 'won', 'lost'] as const
export type CrmMirrorDealStatus = (typeof CRM_MIRROR_DEAL_STATUSES)[number]

/** Le type d'une activité, normalisé. CHECK SQL `crm_activities_kind_check`. */
export const CRM_MIRROR_ACTIVITY_KINDS = ['call', 'meeting', 'task', 'email', 'note'] as const
export type CrmMirrorActivityKind = (typeof CRM_MIRROR_ACTIVITY_KINDS)[number]

const isoDate = z.string().min(1)

/** Ce que porte toute fiche du miroir. */
const mirrorRecord = {
  provider: crmProviderSchema,
  externalId: z.string().min(1).max(255),
  crmUpdatedAt: isoDate.nullable(),
  crmUrl: z.string().url().nullable(),
  /** Les champs propres à l'espace, tels que le CRM les rend (clé = nom d'API du champ). */
  customFields: z.record(z.string(), z.unknown()),
  archivedAt: isoDate.nullable(),
}

export const crmMirrorDealSchema = z
  .object({
    ...mirrorRecord,
    title: z.string().nullable(),
    pipelineExternalId: z.string().nullable(),
    stageExternalId: z.string().nullable(),
    /** Le libellé d'étape tel que le CRM le nomme. */
    stageLabel: z.string().nullable(),
    amount: z.number().finite().nullable(),
    currency: z.string().length(3).nullable(),
    status: z.enum(CRM_MIRROR_DEAL_STATUSES).nullable(),
    lostReason: z.string().nullable(),
    crmCreatedAt: isoDate.nullable(),
    /** L'échéance PRÉVUE — jamais la clôture réelle. */
    expectedCloseDate: isoDate.nullable(),
    closedAt: isoDate.nullable(),
    ownerExternalId: z.string().nullable(),
    accountExternalId: z.string().nullable(),
    /** Le compte Bellum rattaché par les liens existants (`sync_links`), sinon `null`. */
    accountId: z.string().guid().nullable(),
    contactExternalIds: z.array(z.string()),
  })
  .strict()
export type CrmMirrorDeal = z.infer<typeof crmMirrorDealSchema>

export const crmMirrorActivitySchema = z
  .object({
    ...mirrorRecord,
    kind: z.enum(CRM_MIRROR_ACTIVITY_KINDS).nullable(),
    subject: z.string().nullable(),
    occurredAt: isoDate.nullable(),
    /** `null` quand le CRM ne dit pas si elle est faite. */
    done: z.boolean().nullable(),
    ownerExternalId: z.string().nullable(),
    accountExternalId: z.string().nullable(),
    accountId: z.string().guid().nullable(),
    contactExternalId: z.string().nullable(),
    contactId: z.string().guid().nullable(),
    dealExternalId: z.string().nullable(),
  })
  .strict()
export type CrmMirrorActivity = z.infer<typeof crmMirrorActivitySchema>

export const crmMirrorOwnerSchema = z
  .object({ ...mirrorRecord, name: z.string().nullable(), email: z.string().nullable() })
  .strict()
export type CrmMirrorOwner = z.infer<typeof crmMirrorOwnerSchema>

export const crmMirrorStageSchema = z
  .object({
    externalId: z.string().min(1).max(255),
    label: z.string().nullable(),
    position: z.number().int().nonnegative().nullable(),
    /** Une étape qui CLÔT l'affaire (gagnée / perdue) quand le CRM le dit, sinon `null`. */
    status: z.enum(CRM_MIRROR_DEAL_STATUSES).nullable(),
  })
  .strict()

export const crmMirrorPipelineSchema = z
  .object({ ...mirrorRecord, label: z.string().nullable(), stages: z.array(crmMirrorStageSchema) })
  .strict()
export type CrmMirrorPipeline = z.infer<typeof crmMirrorPipelineSchema>

/** Le vocabulaire des CRM (Salesforce `Event`, Odoo `phonecall`, Pipedrive `lunch`…) → le type normalisé. */
const ACTIVITY_KIND_ALIASES: Readonly<Record<string, CrmMirrorActivityKind>> = {
  call: 'call',
  calls: 'call',
  phonecall: 'call',
  phone_call: 'call',
  meeting: 'meeting',
  meetings: 'meeting',
  event: 'meeting',
  events: 'meeting',
  task: 'task',
  tasks: 'task',
  todo: 'task',
  deadline: 'task',
  email: 'email',
  emails: 'email',
  mail: 'email',
  note: 'note',
  notes: 'note',
  // Odoo rend le LIBELLÉ du type d'activité, dans la langue de l'instance.
  appel: 'call',
  réunion: 'meeting',
  'rendez-vous': 'meeting',
  tâche: 'task',
  'à faire': 'task',
  'e-mail': 'email',
  courriel: 'email',
}

/** Le type normalisé d'une activité ; un type inconnu reste `null` (jamais rangé au hasard). */
export function crmMirrorActivityKind(raw: string | null | undefined): CrmMirrorActivityKind | null {
  if (!raw) return null
  return ACTIVITY_KIND_ALIASES[raw.trim().toLowerCase()] ?? null
}

/**
 * Ce que la FICHE COMPTE lit du miroir (`GET /crm/mirror/accounts/:id`) : les affaires et les activités
 * du compte, non archivées, tous CRM branchés confondus. `provider` nomme le CRM du CLIENT (ce qu'il a
 * branché) ; un champ absent est `null` — l'écran ne l'affiche pas (jamais « 0 »).
 */
/** Le CRM d'origine d'une fiche miroir : un des six CRM du contrat, ou `demo` (la salle, aucun CRM réel). */
export type CrmMirrorSource = z.infer<typeof crmProviderSchema> | 'demo'
export type CrmMirrorAccountDeal = {
  provider: CrmMirrorSource
  id: string
  title: string | null
  amount: number | null
  currency: string | null
  stage: string | null
  status: CrmMirrorDealStatus | null
  expectedCloseDate: string | null
  closedAt: string | null
  ownerName: string | null
  url: string | null
}
export type CrmMirrorAccountActivity = {
  provider: CrmMirrorSource
  id: string
  kind: CrmMirrorActivityKind | null
  subject: string | null
  occurredAt: string | null
  done: boolean | null
  ownerName: string | null
  url: string | null
}
export type CrmMirrorAccountView = { deals: CrmMirrorAccountDeal[]; activities: CrmMirrorAccountActivity[] }
