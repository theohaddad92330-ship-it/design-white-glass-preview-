import { BadRequestException } from '@nestjs/common'
import { CRM_PROVIDERS, type CrmAdapterOperation, type CrmProvider, type CrmReadObject } from '@bellum/contracts'
import type { CrmObjectKind, CrmTaskInput } from '../crm-task'
import type { CrmCompanyPage, CrmContactPage, HubspotContactInput } from '../hubspot.client'
import type { CrmActivityPage, CrmDealPage, CrmOwnerPage, CrmPipelinePage, CrmReadOptions } from './crm-read-types'

/**
 * #4185 — L'ADAPTATEUR CRM COMMUN, côté API.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Une interface unique (statut, upsert de contact, upsert de société, dépôt
 * d'un besoin, lecture) que chaque CRM branché porte, et un REGISTRE qui les
 * range par fournisseur. Brancher un CRM de plus = écrire un adaptateur ici et
 * l'ajouter au contrat (`@bellum/contracts` › `crm-adapter.ts`) — plus aucun
 * switch à chercher dans le routeur d'actions, l'export de besoin ou l'écran.
 *
 * Un adaptateur ÉCRIT EN DIRECT chez le fournisseur : il ne connaît PAS la
 * porte. C'est voulu (même séparation que `OutboundWriteService`, qui
 * n'appelle aucun fournisseur) : la porte décide, l'adaptateur exécute. Le
 * SEUL appelant légitime de ses écritures est `CrmWriteService` (#4186), et la
 * garde `crm-ecritures-passent-par-la-porte.spec.ts` le tient.
 *
 * Les adaptateurs sont des ENVELOPPES des services existants, sans changement
 * de comportement : chaque méthode délègue à ce que le service faisait déjà.
 */

/** La personne qui part vers le CRM — la forme commune aux cinq connecteurs. */
export type CrmContactInput = HubspotContactInput

/** La société qui part vers le CRM. Un champ absent = inconnu, jamais deviné. */
export type CrmCompanyInput = { name: string; domain?: string | null; industry?: string | null; city?: string | null }

/** Ce que le CRM a fait : `created` = fiche neuve, sinon retrouvée ou mise à jour. */
type CrmUpsertResult = { id: string; created: boolean }

type CrmAdapterStatus = { connected: boolean; accountLabel?: string | null }

/**
 * L'interface. `status` est obligatoire ; une opération optionnelle ABSENTE dit
 * « ce CRM ne la porte pas » — et la matrice du contrat doit dire la même
 * chose (garde `crm-adapter.registry.spec.ts`).
 */
export type CrmAdapter = {
  readonly provider: CrmProvider
  status(userId: string): Promise<CrmAdapterStatus>
  upsertContact?(userId: string, input: CrmContactInput): Promise<CrmUpsertResult>
  upsertCompany?(userId: string, input: CrmCompanyInput): Promise<CrmUpsertResult>
  /** Un besoin, sous la forme idiomatique du CRM (affaire, tâche ou note). */
  taskNote?(userId: string, input: CrmTaskInput): Promise<{ id: string; object: CrmObjectKind }>
  /**
   * #4189 — la LECTURE commune. `contacts` et `companies` sont communs à tous ;
   * `deals`, `activities` et `owners` n'existent que là où le CRM les expose
   * (`CRM_PROVIDER_READ_SCOPE`) — une méthode absente dit « non lu », jamais une
   * page vide qui se lirait « aucun ». `since` (ISO) ne rend que ce qui a bougé
   * après (créé après, pour Attio : `CRM_INCREMENTAL_SYNC`).
   */
  read?: {
    contacts(userId: string, opts: CrmReadOptions): Promise<CrmContactPage>
    companies(userId: string, opts: CrmReadOptions): Promise<CrmCompanyPage>
    deals?(userId: string, opts: CrmReadOptions): Promise<CrmDealPage>
    activities?(userId: string, opts: CrmReadOptions): Promise<CrmActivityPage>
    owners?(userId: string, opts: CrmReadOptions): Promise<CrmOwnerPage>
    /**
     * SYNC-A — les pipelines d'affaires et leurs étapes, pour le MIROIR seulement (`crm_pipelines`,
     * `crm_stages`) : ce n'est pas un objet de `CRM_READ_OBJECTS` (l'écran ne le liste pas).
     */
    pipelines?(userId: string, opts: CrmReadOptions): Promise<CrmPipelinePage>
  }
}

/** Le nom de la méthode qui porte chaque opération. */
const OPERATION_METHOD: Readonly<Record<CrmAdapterOperation, keyof CrmAdapter>> = {
  status: 'status',
  upsert_contact: 'upsertContact',
  upsert_company: 'upsertCompany',
  task_note: 'taskNote',
  read: 'read',
}

/** Les services existants, réduits à ce que les adaptateurs en lisent. */
export type CrmAdapterDeps = {
  hubspot: {
    getStatus(userId: string): Promise<{ connected: boolean; accountLabel?: string | null }>
    upsertContactDirect(userId: string, input: CrmContactInput): Promise<CrmUpsertResult>
    exportNeed(userId: string, input: CrmTaskInput): Promise<{ id: string; object: CrmObjectKind }>
    listContacts(userId: string, opts: CrmReadOptions): Promise<CrmContactPage>
    listCompanies(userId: string, opts: CrmReadOptions): Promise<CrmCompanyPage>
    listDeals(userId: string, opts: { limit: number; after?: string }): Promise<CrmDealPage>
    listActivities(userId: string, opts: CrmReadOptions): Promise<CrmActivityPage>
    listOwners(userId: string, opts: CrmReadOptions): Promise<CrmOwnerPage>
    listPipelines(userId: string, opts: CrmReadOptions): Promise<CrmPipelinePage>
  }
  hubspotDepth: {
    createCompany(
      userId: string,
      input: { name: string; domain?: string; industry?: string; city?: string },
    ): Promise<CrmUpsertResult>
  }
  salesforce: ExportingService & ReadingService & ReadsDeals & ReadsActivities & ReadsOwners
  pipedrive: ExportingService & ReadingService & ReadsDeals & ReadsActivities & ReadsOwners & ReadsPipelines
  attio: ExportingService & ReadingService & ReadsDeals
  zoho: ExportingService & ReadingService & ReadsDeals & ReadsOwners
  odoo: ReadingService &
    ReadsDeals &
    ReadsActivities &
    ReadsOwners & {
      getStatus(userId: string): Promise<{ connected: boolean; accountLabel?: string | null }>
      exportContact(
        userId: string,
        dto: { name: string; email?: string; phone?: string; jobTitle?: string; companyName?: string },
      ): Promise<{ action: 'created' | 'updated'; partnerId: number }>
      exportCompany(
        userId: string,
        input: { name: string; website?: string | null },
      ): Promise<{ action: 'created' | 'updated'; partnerId: number }>
    }
}

/** #4189 — ce que tout service de CRM relit : ses comptes et ses contacts. */
type ReadingService = {
  listContacts(userId: string, opts: CrmReadOptions): Promise<CrmContactPage>
  listCompanies(userId: string, opts: CrmReadOptions): Promise<CrmCompanyPage>
}
type ReadsDeals = { listDeals(userId: string, opts: CrmReadOptions): Promise<CrmDealPage> }
type ReadsActivities = { listActivities(userId: string, opts: CrmReadOptions): Promise<CrmActivityPage> }
type ReadsOwners = { listOwners(userId: string, opts: CrmReadOptions): Promise<CrmOwnerPage> }
type ReadsPipelines = { listPipelines(userId: string, opts: CrmReadOptions): Promise<CrmPipelinePage> }

type ExportingService = {
  getStatus(userId: string): Promise<{ connected: boolean; accountLabel?: string | null }>
  exportContact(userId: string, input: CrmContactInput): Promise<CrmUpsertResult>
  /** #4188 — retrouver OU créer la société (jamais deux). */
  exportCompany(userId: string, input: { name: string; website?: string | null }): Promise<CrmUpsertResult>
  exportNeed(userId: string, input: CrmTaskInput): Promise<{ id: string; object: CrmObjectKind }>
}

const status = async (
  read: () => Promise<{ connected: boolean; accountLabel?: string | null }>,
): Promise<CrmAdapterStatus> => {
  const raw = await read()
  return { connected: raw.connected === true, accountLabel: raw.accountLabel ?? null }
}

/** Les quatre connecteurs OAuth hors HubSpot se ressemblent : un même gabarit. */
function exportingAdapter(
  provider: CrmProvider,
  service: ExportingService & ReadingService & Partial<ReadsDeals & ReadsActivities & ReadsOwners & ReadsPipelines>,
): CrmAdapter {
  return {
    provider,
    status: userId => status(() => service.getStatus(userId)),
    upsertContact: (userId, input) => service.exportContact(userId, input),
    // #4188 — le domaine CONNU du compte part comme site web ; absent, rien n'est envoyé.
    upsertCompany: (userId, input) =>
      service.exportCompany(userId, { name: input.name, ...(input.domain ? { website: input.domain } : {}) }),
    taskNote: (userId, input) => service.exportNeed(userId, input),
    read: readingOf(service),
  }
}

/**
 * #4189 — la lecture d'un service : comptes et contacts toujours ; une affaire, une
 * activité ou un propriétaire seulement si le SERVICE sait le lire. C'est la présence de
 * la méthode qui porte « ce CRM expose cet objet » — la garde du registre la compare à
 * `CRM_PROVIDER_READ_SCOPE`.
 */
function readingOf(
  service: ReadingService & Partial<ReadsDeals & ReadsActivities & ReadsOwners & ReadsPipelines>,
): NonNullable<CrmAdapter['read']> {
  const { listDeals, listActivities, listOwners, listPipelines } = service
  return {
    contacts: (userId, opts) => service.listContacts(userId, opts),
    companies: (userId, opts) => service.listCompanies(userId, opts),
    ...(listDeals ? { deals: (userId: string, opts: CrmReadOptions) => listDeals.call(service, userId, opts) } : {}),
    ...(listActivities
      ? { activities: (userId: string, opts: CrmReadOptions) => listActivities.call(service, userId, opts) }
      : {}),
    ...(listOwners ? { owners: (userId: string, opts: CrmReadOptions) => listOwners.call(service, userId, opts) } : {}),
    ...(listPipelines
      ? { pipelines: (userId: string, opts: CrmReadOptions) => listPipelines.call(service, userId, opts) }
      : {}),
  }
}

/**
 * Odoo nomme une personne par un `name` unique. Le composer à partir du prénom
 * et du nom n'invente rien ; sans aucun des deux, l'adresse est le seul nom
 * RÉEL qu'on ait. Sans rien, on refuse — jamais un « Contact sans nom ».
 */
function odooName(input: CrmContactInput): string {
  const name = [input.firstName, input.lastName].filter(Boolean).join(' ').trim()
  if (name) return name
  if (input.email?.trim()) return input.email.trim()
  throw new BadRequestException('Ce contact n’a ni nom ni adresse : rien n’a été envoyé.')
}

/** Le registre : UNE entrée par fournisseur du contrat — le type l'exige. */
export function buildCrmAdapters(deps: CrmAdapterDeps): Readonly<Record<CrmProvider, CrmAdapter>> {
  return {
    hubspot: {
      provider: 'hubspot',
      status: userId => status(() => deps.hubspot.getStatus(userId)),
      upsertContact: (userId, input) => deps.hubspot.upsertContactDirect(userId, input),
      upsertCompany: (userId, input) =>
        deps.hubspotDepth.createCompany(userId, {
          name: input.name,
          ...(input.domain ? { domain: input.domain } : {}),
        }),
      taskNote: (userId, input) => deps.hubspot.exportNeed(userId, input),
      read: {
        contacts: (userId, opts) => deps.hubspot.listContacts(userId, opts),
        companies: (userId, opts) => deps.hubspot.listCompanies(userId, opts),
        // HJ.4 — la liste des affaires n'a pas de filtre « depuis » : on le tient ici, sur la page lue.
        deals: async (userId, opts) => {
          const page = await deps.hubspot.listDeals(userId, {
            limit: opts.limit,
            ...(opts.after ? { after: opts.after } : {}),
          })
          const since = opts.since ? Date.parse(opts.since) : Number.NaN
          if (Number.isNaN(since)) return page
          const moved = (iso: string | null) => (iso ? Date.parse(iso) > since : true)
          return { ...page, deals: page.deals.filter(deal => moved(deal.modifiedAt)) }
        },
        // SYNC-A — le miroir : activités (portée contacts), propriétaires (portée owners), pipelines.
        activities: (userId, opts) => deps.hubspot.listActivities(userId, opts),
        owners: (userId, opts) => deps.hubspot.listOwners(userId, opts),
        pipelines: (userId, opts) => deps.hubspot.listPipelines(userId, opts),
      },
    },
    salesforce: exportingAdapter('salesforce', deps.salesforce),
    pipedrive: exportingAdapter('pipedrive', deps.pipedrive),
    attio: exportingAdapter('attio', deps.attio),
    // #4187 — Zoho : aucune ligne de switch ailleurs, c'est ICI et dans le contrat que Zoho existe.
    zoho: exportingAdapter('zoho', deps.zoho),
    odoo: {
      provider: 'odoo',
      status: userId => status(() => deps.odoo.getStatus(userId)),
      upsertContact: async (userId, input) => {
        const result = await deps.odoo.exportContact(userId, {
          name: odooName(input),
          ...(input.email ? { email: input.email } : {}),
          ...(input.phone ? { phone: input.phone } : {}),
          ...(input.jobTitle ? { jobTitle: input.jobTitle } : {}),
          ...(input.company ? { companyName: input.company } : {}),
        })
        return { id: String(result.partnerId), created: result.action === 'created' }
      },
      upsertCompany: async (userId, input) => {
        const result = await deps.odoo.exportCompany(userId, {
          name: input.name,
          ...(input.domain ? { website: input.domain } : {}),
        })
        return { id: String(result.partnerId), created: result.action === 'created' }
      },
      read: readingOf(deps.odoo),
    },
  }
}

/** Les opérations qu'un adaptateur implémente RÉELLEMENT (la garde les compare à la matrice). */
export function implementedOperations(adapter: CrmAdapter): CrmAdapterOperation[] {
  return (Object.keys(OPERATION_METHOD) as CrmAdapterOperation[]).filter(
    operation => adapter[OPERATION_METHOD[operation]] !== undefined,
  )
}

/** Les OBJETS qu'un adaptateur relit RÉELLEMENT (la garde les compare à `CRM_PROVIDER_READ_SCOPE`). */
export function implementedReadObjects(adapter: CrmAdapter): CrmReadObject[] {
  const read = adapter.read
  if (!read) return []
  const out: CrmReadObject[] = ['accounts', 'contacts']
  if (read.deals) out.push('deals')
  if (read.activities) out.push('activities')
  if (read.owners) out.push('owners')
  return out
}

/** L'adaptateur d'un fournisseur reçu en texte (une demande en base, un corps de requête) ; `null` = inconnu. */
export function adapterFor(adapters: Readonly<Record<CrmProvider, CrmAdapter>>, provider: string): CrmAdapter | null {
  return (CRM_PROVIDERS as readonly string[]).includes(provider) ? adapters[provider as CrmProvider] : null
}
