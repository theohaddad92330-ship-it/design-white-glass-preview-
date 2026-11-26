import { Logger } from '@nestjs/common'
import type { HubspotConfig } from './crm-config'
import { latestIso, type CrmPresenceContact, type CrmPresenceDeal } from './crm-presence'
import type { CrmTaskInput } from './crm-task'
import type { CrmActivityPage, CrmOwnerPage, CrmPipelinePage, CrmReadOptions } from './adapter/crm-read-types'

/**
 * Thin HubSpot REST wrapper. No SDK — a handful of endpoints (token, token-info,
 * search/create/update contact, list, note engagement, presence read-back) are
 * enough, and staying on `fetch` keeps the dependency surface small. Every call
 * checks `res.ok` (code rule) and surfaces a clear error rather than an invented
 * fallback.
 */

const TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token'
const TOKEN_INFO_URL = 'https://api.hubapi.com/oauth/v1/access-tokens'
const REVOKE_URL = 'https://api.hubapi.com/oauth/v1/refresh-tokens'
const CONTACTS_URL = 'https://api.hubapi.com/crm/v3/objects/contacts'
const DEALS_URL = 'https://api.hubapi.com/crm/v3/objects/deals'
const CONTACTS_SEARCH_URL = 'https://api.hubapi.com/crm/v3/objects/contacts/search'
const COMPANIES_URL = 'https://api.hubapi.com/crm/v3/objects/companies'
const DEALS_LIST_URL = 'https://api.hubapi.com/crm/v3/objects/deals'
const COMPANIES_SEARCH_URL = 'https://api.hubapi.com/crm/v3/objects/companies/search'
const DEALS_SEARCH_URL = 'https://api.hubapi.com/crm/v3/objects/deals/search'
/**
 * #1934.18 — les pipelines d'affaires ET leurs stades.
 *
 * ⚠️ Portée : la référence de `GET /crm/v3/pipelines/{objectType}` liste des
 * portées ALTERNATIVES (une seule suffit), dont `crm.objects.deals.read` —
 * déjà demandée par défaut — et `crm.objects.deals.write`. Aucune portée de plus
 * à demander, relu le 16/09/2026 sur developers.hubspot.com.
 */
const DEAL_PIPELINES_URL = 'https://api.hubapi.com/crm/v3/pipelines/deals'
const NOTES_URL = 'https://api.hubapi.com/crm/v3/objects/notes'
/** SYNC-A — les propriétaires (portée `crm.objects.owners.read`, ajoutée le 19/10/2026 : reconnexion requise). */
const OWNERS_URL = 'https://api.hubapi.com/crm/v3/owners'
const OBJECTS_URL = 'https://api.hubapi.com/crm/v3/objects'
/** Tâches et réunions — les deux objets d'engagement que les méta-analyses
 *  réclament le plus (§5.3 n°1 « tâche de relance après chaque call », n°2
 *  « loguer les RDV dans le CRM »). */
const TASKS_URL = 'https://api.hubapi.com/crm/v3/objects/tasks'
const MEETINGS_URL = 'https://api.hubapi.com/crm/v3/objects/meetings'

/** How many matched contacts/deals the presence read-back returns (the total
 *  count is reported separately by HubSpot's `total`). */
const PRESENCE_PAGE = 5

/** Contact properties fetched when importing/searching (HubSpot returns only what you ask for). */
const READ_PROPERTIES = ['email', 'firstname', 'lastname', 'company', 'jobtitle', 'phone']
/**
 * Objets maximum par requête de liste, imposé par HubSpot.
 *
 * Au-delà, l'API répond 400 « You can only request at most 100 objects in one
 * request » — l'appel entier échoue, y compris pour les 100 premiers qu'elle
 * aurait pu rendre.
 */
export const HUBSPOT_MAX_PAGE_SIZE = 100
/** HubSpot-defined association type id for a Note → Contact. */
const NOTE_TO_CONTACT_TYPE_ID = 202
/** HubSpot-defined association type id for a Deal → Company. */
const DEAL_TO_COMPANY_TYPE_ID = 341
/** Associations HubSpot-defined des engagements vers un contact. */
const TASK_TO_CONTACT_TYPE_ID = 204
const MEETING_TO_CONTACT_TYPE_ID = 200

type HubspotTokens = {
  accessToken: string
  refreshToken: string | null
  /** seconds until the access token expires */
  expiresIn: number
}

type HubspotTokenInfo = {
  hubId: string | null
  hubDomain: string | null
  scopes: string | null
  user: string | null
}

export type HubspotContactInput = {
  email?: string
  firstName?: string
  lastName?: string
  company?: string
  jobTitle?: string
  phone?: string
  linkedinUrl?: string
}

/** Small, front-facing shape for a CRM contact read back from HubSpot. Consumed
 *  structurally through `CrmContactPage` (not exported by name on purpose). */
type CrmContact = {
  id: string
  email: string | null
  firstName: string | null
  lastName: string | null
  company: string | null
  jobTitle: string | null
  phone: string | null
  /** #4189 — date de modification (ISO) quand le CRM la rend ; `null` sinon. */
  modifiedAt?: string | null
}

/** A page of imported CRM contacts + the opaque cursor for the next page. */
export type CrmContactPage = {
  contacts: CrmContact[]
  /** Opaque cursor to pass as `after` for the next page; null when exhausted. */
  nextAfter: string | null
}

/** Result of an upsert: whether HubSpot got a brand new record or an update. */
export type UpsertResult = { id: string; created: boolean }

/** #2388.24 — one company row, trimmed to what a reprise needs. */
type CrmCompany = {
  id: string
  name: string | null
  domain?: string | null
  modifiedAt?: string | null
  /** #4603 — `siren` n'est pas standard HubSpot : lu quand le portail l'a créé, absent sinon. */
  siren?: string | null
}

/** A page of imported CRM companies + the opaque cursor for the next page. */
export type CrmCompanyPage = {
  companies: CrmCompany[]
  /** Opaque cursor to pass as `after` for the next page; null when exhausted. */
  nextAfter: string | null
}

/** #1934.18 — un pipeline d'affaires tel que le portail le rend : ses stades
 *  ACTIFS, dans l'ordre du portail. `id` est ce que `dealstage` attend. */
export type HubspotDealPipeline = { id: string; label: string; stages: Array<{ id: string; label: string }> }

const logger = new Logger('HubspotClient')

async function readError(res: Response): Promise<string> {
  // SYNC-C — un quota dépassé se DIT « 429 » (et son Retry-After) : la synchro fréquente recule au lieu de compter une panne.
  if (res.status === 429) return `HTTP 429 Too Many Requests (retry-after ${res.headers?.get?.('retry-after') ?? '?'})`
  try {
    const body = (await res.json()) as { message?: string; error_description?: string }
    return body?.message || body?.error_description || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

function toTokens(data: Record<string, unknown>): HubspotTokens {
  return {
    accessToken: String(data['access_token'] ?? ''),
    refreshToken: data['refresh_token'] ? String(data['refresh_token']) : null,
    expiresIn: Number(data['expires_in'] ?? 0),
  }
}

/** Map our contact input onto HubSpot's snake-cased contact properties. */
function toProperties(input: HubspotContactInput): Record<string, string> {
  const properties: Record<string, string> = {}
  if (input.email) properties['email'] = input.email
  if (input.firstName) properties['firstname'] = input.firstName
  if (input.lastName) properties['lastname'] = input.lastName
  if (input.company) properties['company'] = input.company
  if (input.jobTitle) properties['jobtitle'] = input.jobTitle
  if (input.phone) properties['phone'] = input.phone
  if (input.linkedinUrl) properties['hs_linkedin_url'] = input.linkedinUrl
  return properties
}

/** SYNC-C — la date de modification quand HubSpot la rend (propriété demandée) ; absente = clé absente, jamais une date devinée. */
function modifiedAtOf(p: Record<string, unknown>): { modifiedAt?: string } {
  const raw = p['hs_lastmodifieddate'] ?? p['lastmodifieddate']
  if (raw == null || raw === '') return {}
  const ms = typeof raw === 'number' || /^\d+$/.test(String(raw)) ? Number(raw) : Date.parse(String(raw))
  return Number.isNaN(ms) ? {} : { modifiedAt: new Date(ms).toISOString() }
}

/** Read a HubSpot object row into our small CRM contact DTO (empty → null). */
function toCrmContact(row: { id?: unknown; properties?: Record<string, unknown> }): CrmContact {
  const p = row.properties ?? {}
  const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
  return {
    id: String(row.id ?? ''),
    email: str(p['email']),
    firstName: str(p['firstname']),
    lastName: str(p['lastname']),
    company: str(p['company']),
    jobTitle: str(p['jobtitle']),
    phone: str(p['phone']),
    ...modifiedAtOf(p),
  }
}

/** Read a HubSpot company row into our small CRM company DTO (empty → null). */
/** HJ.4 — une affaire telle que HubSpot la rend ; `status` ne vient que de ses indicateurs de clôture. */
type HubspotDealRead = {
  id: string
  title: string | null
  amount: number | null
  currency: string | null
  stage: string | null
  status: 'open' | 'won' | 'lost' | null
  closeDate: string | null
  closedAt: string | null
  createdAt: string | null
  /** SYNC-A — la PREMIÈRE société associée (identifiant HubSpot), sinon `null`. */
  accountId: string | null
  accountName: null
  modifiedAt: string | null
  ownerId: string | null
  pipelineId: string | null
  stageId: string | null
  lostReason: string | null
  contactIds: string[]
}
export type HubspotDealPage = { deals: HubspotDealRead[]; nextAfter: string | null }

const DEAL_READ_PROPERTIES = [
  'dealname',
  'amount',
  'deal_currency_code',
  'dealstage',
  'closedate',
  'createdate',
  'hs_lastmodifieddate',
  'hs_is_closed',
  'hs_is_closed_won',
  'hs_closed_won_date',
  // SYNC-A — le miroir.
  'hubspot_owner_id',
  'pipeline',
  'closed_lost_reason',
]

type HubspotRow = {
  id?: unknown
  properties?: Record<string, unknown>
  associations?: Record<string, { results?: Array<{ id?: unknown }> }>
}

/** Les identifiants associés d'un type (`companies`, `contacts`, `deals`), dans l'ordre rendu. */
function associatedIds(row: HubspotRow, type: string): string[] {
  return (row.associations?.[type]?.results ?? []).flatMap(item =>
    item.id == null || item.id === '' ? [] : [String(item.id)],
  )
}

/**
 * SYNC-A — les objets d'ACTIVITÉ lus, dans l'ordre du curseur (`<type>:<after>`), et les propriétés
 * de chacun : sujet, date, statut — JAMAIS le corps (`hs_call_body`, `hs_note_body`…, doctrine c96).
 * Une note n'a pas de sujet : `null`, son texte n'est pas lu.
 */
const ACTIVITY_OBJECTS = [
  { type: 'calls', kind: 'call', subject: 'hs_call_title', status: null },
  { type: 'meetings', kind: 'meeting', subject: 'hs_meeting_title', status: null },
  { type: 'tasks', kind: 'task', subject: 'hs_task_subject', status: 'hs_task_status' },
  { type: 'notes', kind: 'note', subject: null, status: null },
] as const

function dealText(value: unknown): string | null {
  return value == null || value === '' ? null : String(value)
}

/**
 * Le statut d'une affaire HubSpot : ses indicateurs de clôture d'abord (`hs_is_closed_won`, `hs_is_closed`),
 * puis les étapes natives `closedwon` / `closedlost`. Un pipeline personnalisé aux étapes renommées reste
 * LISIBLE par les indicateurs ; sans aucun des deux, `null` — jamais deviné d'un libellé.
 */
export function toDealRead(row: HubspotRow): HubspotDealRead {
  const p = row.properties ?? {}
  const stage = dealText(p['dealstage'])
  const closedFlag = dealText(p['hs_is_closed'])
  const wonFlag = dealText(p['hs_is_closed_won'])
  let status: HubspotDealRead['status'] = null
  if (wonFlag === 'true' || stage === 'closedwon') status = 'won'
  else if (closedFlag === 'true' || stage === 'closedlost') status = 'lost'
  else if (closedFlag === 'false') status = 'open'
  const amount = dealText(p['amount'])
  const parsed = amount == null ? Number.NaN : Number(amount)
  const closeDate = dealText(p['closedate'])
  return {
    id: String(row.id ?? ''),
    title: dealText(p['dealname']),
    amount: Number.isFinite(parsed) ? parsed : null,
    currency: dealText(p['deal_currency_code']),
    stage,
    status,
    closeDate,
    // La clôture RÉELLE : la date de gain si elle existe, sinon `closedate` d'une affaire déjà close.
    closedAt: dealText(p['hs_closed_won_date']) ?? (status === 'won' || status === 'lost' ? closeDate : null),
    createdAt: dealText(p['createdate']),
    accountId: associatedIds(row, 'companies')[0] ?? null,
    accountName: null,
    modifiedAt: dealText(p['hs_lastmodifieddate']),
    ownerId: dealText(p['hubspot_owner_id']),
    pipelineId: dealText(p['pipeline']),
    stageId: stage,
    lostReason: dealText(p['closed_lost_reason']),
    contactIds: associatedIds(row, 'contacts'),
  }
}

function toCrmCompany(row: { id?: unknown; properties?: Record<string, unknown> }): CrmCompany {
  const p = row.properties ?? {}
  const name = p['name']
  return {
    id: String(row.id ?? ''),
    name: name == null || name === '' ? null : String(name),
    ...(p['siren'] == null || p['siren'] === '' ? {} : { siren: String(p['siren']) }),
    ...modifiedAtOf(p),
  }
}

export class HubspotClient {
  constructor(private readonly config: HubspotConfig) {}

  /** Exchange an authorization `code` for tokens (grant_type=authorization_code). */
  async exchangeCode(code: string): Promise<HubspotTokens> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code,
      }),
    })
    if (!res.ok) throw new Error(`HubSpot token exchange failed: ${await readError(res)}`)
    return toTokens((await res.json()) as Record<string, unknown>)
  }

  /** Refresh an expired access token (grant_type=refresh_token). */
  async refresh(refreshToken: string): Promise<HubspotTokens> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) {
      // #1836 — le STATUT porte une vérité que le message perd.
      //
      // Le classifieur (`classifyProviderError`) ne voit qu'une chaîne, et le
      // corps d'un refus OAuth range `invalid_grant` dans un champ que
      // `readError` ne lit pas — il en ressortait « HTTP 400 », qui se classe
      // en panne passagère et s'affiche « réessaie dans un moment ». Or un 4xx
      // sur un grant `refresh_token` EST un refus d'autorisation (RFC 6749 :
      // `invalid_grant` sort en 400) : rien ne repassera sans l'utilisateur.
      // Un 5xx ou une coupure réseau, eux, restent une panne — et le témoin
      // « socket hang up » de `crm.service.spec.ts` tient cette frontière.
      const detail = await readError(res)
      const refused = res.status >= 400 && res.status < 500
      throw new Error(
        refused
          ? `HubSpot token refresh failed: refresh token invalid (HTTP ${res.status}) — ${detail}`
          : `HubSpot token refresh failed: ${detail}`,
      )
    }
    const tokens = toTokens((await res.json()) as Record<string, unknown>)
    // A refresh response may omit refresh_token — keep the existing one.
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken }
  }

  /** Portal metadata for the access token — used to label the connection. */
  async tokenInfo(accessToken: string): Promise<HubspotTokenInfo> {
    const res = await fetch(`${TOKEN_INFO_URL}/${accessToken}`)
    if (!res.ok) {
      logger.warn(`HubSpot token-info failed: ${await readError(res)}`)
      return { hubId: null, hubDomain: null, scopes: null, user: null }
    }
    const data = (await res.json()) as Record<string, unknown>
    return {
      hubId: data['hub_id'] != null ? String(data['hub_id']) : null,
      hubDomain: data['hub_domain'] ? String(data['hub_domain']) : null,
      scopes: Array.isArray(data['scopes']) ? (data['scopes'] as string[]).join(' ') : null,
      user: data['user'] ? String(data['user']) : null,
    }
  }

  /**
   * Révoque le jeton chez HubSpot (`DELETE /oauth/v1/refresh-tokens/{token}`).
   *
   * Endpoint public et documenté. Il invalide la concession entière — jetons
   * d'accès compris — et retire l'application des intégrations du portail. Sans
   * lui, se « déconnecter » ne retirait rien côté client.
   */
  async revoke(refreshToken: string): Promise<void> {
    const res = await fetch(`${REVOKE_URL}/${encodeURIComponent(refreshToken)}`, {
      method: 'DELETE',
    })
    // 404 = le jeton n'existe déjà plus : le résultat voulu est acquis.
    if (!res.ok && res.status !== 404) throw new Error(`HubSpot token revocation failed: ${res.status}`)
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }

  /** Create a contact. Returns the new HubSpot contact id. */
  async createContact(accessToken: string, input: HubspotContactInput): Promise<{ id: string }> {
    const res = await fetch(CONTACTS_URL, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ properties: toProperties(input) }),
    })
    if (!res.ok) throw new Error(`HubSpot create contact failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string }
    return { id: String(data?.id ?? '') }
  }

  /** Patch an existing contact's properties in place. Returns its id. */
  async updateContact(accessToken: string, id: string, input: HubspotContactInput): Promise<{ id: string }> {
    const res = await fetch(`${CONTACTS_URL}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ properties: toProperties(input) }),
    })
    if (!res.ok) throw new Error(`HubSpot update contact failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string }
    return { id: String(data?.id ?? id) }
  }

  /** Find a contact id by exact email match, or null if none exists. */
  async findContactIdByEmail(accessToken: string, email: string): Promise<string | null> {
    const res = await fetch(CONTACTS_SEARCH_URL, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
        properties: ['email'],
        limit: 1,
      }),
    })
    if (!res.ok) throw new Error(`HubSpot contact search failed: ${await readError(res)}`)
    const data = (await res.json()) as { results?: Array<{ id?: string }> }
    const first = data?.results?.[0]
    return first?.id ? String(first.id) : null
  }

  /**
   * Find a contact by exact email match, WITH HubSpot's own `lastmodifieddate`
   * (#2261.13, 19/09) — the SOURCE timestamp the latency measurement needs:
   * when the record changed in HubSpot, read the same way `searchStaleContacts`
   * already parses it (epoch-ish string → ISO, `null` when absent/unparseable,
   * never a guess).
   */
  async findContactByEmail(
    accessToken: string,
    email: string,
  ): Promise<{ id: string; lastModifiedAt: string | null } | null> {
    const res = await fetch(CONTACTS_SEARCH_URL, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
        properties: ['email', 'lastmodifieddate'],
        limit: 1,
      }),
    })
    if (!res.ok) throw new Error(`HubSpot contact search failed: ${await readError(res)}`)
    const data = (await res.json()) as { results?: Array<{ id?: string; properties?: Record<string, unknown> }> }
    const first = data?.results?.[0]
    if (!first?.id) return null
    const raw = first.properties?.['lastmodifieddate']
    const parsed = raw != null && raw !== '' ? Date.parse(String(raw)) : Number.NaN
    return { id: String(first.id), lastModifiedAt: Number.isNaN(parsed) ? null : new Date(parsed).toISOString() }
  }

  /**
   * Upsert a contact keyed by email: if one already exists in the portal it is
   * updated in place (no duplicate), otherwise a new one is created. Without an
   * email there is nothing to match on, so we always create.
   */
  async upsertContact(accessToken: string, input: HubspotContactInput): Promise<UpsertResult> {
    if (input.email) {
      const existingId = await this.findContactIdByEmail(accessToken, input.email)
      if (existingId) {
        const updated = await this.updateContact(accessToken, existingId, input)
        return { id: updated.id, created: false }
      }
    }
    const created = await this.createContact(accessToken, input)
    return { id: created.id, created: true }
  }

  /** List the portal's contacts, one page at a time (opaque `after` cursor). */
  async listContacts(accessToken: string, opts: { limit: number; after?: string }): Promise<CrmContactPage> {
    // La borne est celle du FOURNISSEUR : au-delà de 100, HubSpot répond 400
    // « You can only request at most 100 objects in one request » et l'appel
    // entier échoue. Elle est appliquée ICI, dans le seul endroit qui connaît
    // HubSpot — un appelant qui demande 200 obtient une première page de 100 et
    // un curseur, ce qui est vrai, plutôt qu'une erreur qui ne dit rien de sa
    // demande. Le débit à 200 se fait alors en boucle, chez l'appelant.
    const pageSize = Math.min(Math.max(Math.trunc(opts.limit), 1), HUBSPOT_MAX_PAGE_SIZE)
    const params = new URLSearchParams({ limit: String(pageSize), properties: READ_PROPERTIES.join(',') })
    if (opts.after) params.set('after', opts.after)
    const res = await fetch(`${CONTACTS_URL}?${params.toString()}`, {
      method: 'GET',
      headers: this.authHeaders(accessToken),
    })
    if (!res.ok) throw new Error(`HubSpot list contacts failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      results?: Array<{ id?: string; properties?: Record<string, unknown> }>
      paging?: { next?: { after?: string } }
    }
    return {
      contacts: (data?.results ?? []).map(toCrmContact),
      nextAfter: data?.paging?.next?.after ? String(data.paging.next.after) : null,
    }
  }

  /**
   * SYNC-C — ce qui a bougé APRÈS `since` (API search, `hs_lastmodifieddate` croissant) : la lecture « depuis »
   * que la liste simple n'a pas. Ordre croissant ⇒ une page tronquée n'a rien laissé de plus ancien derrière
   * (`CRM_INCREMENTAL_SYNC.hubspot.ordered`). Borne fournisseur de 100 appliquée ICI.
   */
  async searchModifiedSince(
    accessToken: string,
    kind: 'contacts' | 'companies',
    opts: { since: string; limit: number; after?: string },
  ): Promise<{ contacts: CrmContact[]; companies: CrmCompany[]; nextAfter: string | null }> {
    const sinceMs = Date.parse(opts.since)
    if (Number.isNaN(sinceMs)) throw new Error('HubSpot search: date « depuis » illisible')
    const page = await this.search(accessToken, kind === 'contacts' ? CONTACTS_SEARCH_URL : COMPANIES_SEARCH_URL, {
      filterGroups: [{ filters: [{ propertyName: 'hs_lastmodifieddate', operator: 'GT', value: String(sinceMs) }] }],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' }],
      properties:
        kind === 'contacts' ? [...READ_PROPERTIES, 'hs_lastmodifieddate'] : ['name', 'siren', 'hs_lastmodifieddate'],
      limit: Math.min(Math.max(Math.trunc(opts.limit), 1), HUBSPOT_MAX_PAGE_SIZE),
      ...(opts.after ? { after: opts.after } : {}),
    })
    return {
      contacts: kind === 'contacts' ? page.results.map(toCrmContact) : [],
      companies: kind === 'companies' ? page.results.map(toCrmCompany) : [],
      nextAfter: page.nextAfter,
    }
  }

  /** HJ.4 — une page des affaires du portail (curseur opaque, borne fournisseur de 100 appliquée ICI). */
  async listDeals(accessToken: string, opts: { limit: number; after?: string }): Promise<HubspotDealPage> {
    const pageSize = Math.min(Math.max(Math.trunc(opts.limit), 1), HUBSPOT_MAX_PAGE_SIZE)
    const params = new URLSearchParams({
      limit: String(pageSize),
      properties: DEAL_READ_PROPERTIES.join(','),
      // SYNC-A — la société et les contacts liés (portées de lecture déjà accordées).
      associations: 'companies,contacts',
    })
    if (opts.after) params.set('after', opts.after)
    const res = await fetch(`${DEALS_LIST_URL}?${params.toString()}`, {
      method: 'GET',
      headers: this.authHeaders(accessToken),
    })
    if (!res.ok) throw new Error(`HubSpot list deals failed: ${await readError(res)}`)
    const data = (await res.json()) as { results?: HubspotRow[]; paging?: { next?: { after?: string } } }
    return {
      deals: (data?.results ?? []).map(toDealRead),
      nextAfter: data?.paging?.next?.after ? String(data.paging.next.after) : null,
    }
  }

  /**
   * SYNC-A — les activités du portail : appels, rendez-vous, tâches, notes, lus L'UN APRÈS L'AUTRE sous un
   * seul curseur `<type>:<after>` (`calls:` → `meetings:` → `tasks:` → `notes:`). Portée : celle des
   * contacts (`crm.objects.contacts.read`), déjà accordée. Pas de filtre « depuis » côté liste : le miroir
   * relit et garde la date de modification.
   */
  async listActivities(accessToken: string, opts: CrmReadOptions): Promise<CrmActivityPage> {
    const [type = 'calls', after = ''] = (opts.after ?? 'calls:').split(/:(.*)/s)
    const index = ACTIVITY_OBJECTS.findIndex(object => object.type === type)
    const object = ACTIVITY_OBJECTS[index]
    if (!object) throw new Error('HubSpot list activities: curseur invalide.')
    const pageSize = Math.min(Math.max(Math.trunc(opts.limit), 1), HUBSPOT_MAX_PAGE_SIZE)
    const properties = ['hs_timestamp', 'hubspot_owner_id', 'hs_lastmodifieddate']
    if (object.subject) properties.push(object.subject)
    if (object.status) properties.push(object.status)
    const params = new URLSearchParams({
      limit: String(pageSize),
      properties: properties.join(','),
      associations: 'companies,contacts,deals',
    })
    if (after) params.set('after', after)
    const res = await fetch(`${OBJECTS_URL}/${object.type}?${params.toString()}`, {
      method: 'GET',
      headers: this.authHeaders(accessToken),
    })
    if (!res.ok) throw new Error(`HubSpot list ${object.type} failed: ${await readError(res)}`)
    const data = (await res.json()) as { results?: HubspotRow[]; paging?: { next?: { after?: string } } }
    const nextOfType = data?.paging?.next?.after ? String(data.paging.next.after) : null
    const following = ACTIVITY_OBJECTS[index + 1]
    return {
      activities: (data?.results ?? []).map(row => {
        const p = row.properties ?? {}
        const status = object.status ? dealText(p[object.status]) : null
        return {
          id: String(row.id ?? ''),
          subject: object.subject ? dealText(p[object.subject]) : null,
          kind: object.kind,
          dueAt: dealText(p['hs_timestamp']),
          done: status === null ? null : status === 'COMPLETED',
          modifiedAt: dealText(p['hs_lastmodifieddate']),
          ownerId: dealText(p['hubspot_owner_id']),
          accountId: associatedIds(row, 'companies')[0] ?? null,
          contactId: associatedIds(row, 'contacts')[0] ?? null,
          dealId: associatedIds(row, 'deals')[0] ?? null,
          url: null,
        }
      }),
      nextAfter: nextOfType ? `${object.type}:${nextOfType}` : following ? `${following.type}:` : null,
    }
  }

  /** SYNC-A — les propriétaires du portail (`GET /crm/v3/owners`, curseur opaque). */
  async listOwners(accessToken: string, opts: CrmReadOptions): Promise<CrmOwnerPage> {
    const params = new URLSearchParams({ limit: String(Math.min(Math.max(Math.trunc(opts.limit), 1), 500)) })
    if (opts.after) params.set('after', opts.after)
    const res = await fetch(`${OWNERS_URL}?${params.toString()}`, {
      method: 'GET',
      headers: this.authHeaders(accessToken),
    })
    if (!res.ok) throw new Error(`HubSpot list owners failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      results?: Array<{ id?: unknown; email?: unknown; firstName?: unknown; lastName?: unknown }>
      paging?: { next?: { after?: string } }
    }
    return {
      owners: (data?.results ?? []).flatMap(row => {
        if (row.id == null || row.id === '') return []
        const name = [dealText(row.firstName), dealText(row.lastName)].filter(Boolean).join(' ') || null
        return [{ id: String(row.id), name, email: dealText(row.email) }]
      }),
      nextAfter: data?.paging?.next?.after ? String(data.paging.next.after) : null,
    }
  }

  /**
   * SYNC-A — les pipelines d'affaires et TOUTES leurs étapes (archivées comprises : une affaire peut y
   * être), rangées par `displayOrder`. Gagnée / perdue : la probabilité de clôture que HubSpot porte
   * (`1.0` / `0.0`) sur une étape close ; sinon `open` si HubSpot la dit ouverte, `null` s'il ne dit rien.
   */
  async listPipelines(accessToken: string): Promise<CrmPipelinePage> {
    const res = await fetch(DEAL_PIPELINES_URL, { method: 'GET', headers: this.authHeaders(accessToken) })
    if (!res.ok) throw new Error(`HubSpot list pipelines failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      results?: Array<{
        id?: unknown
        label?: unknown
        stages?: Array<{
          id?: unknown
          label?: unknown
          displayOrder?: unknown
          metadata?: { isClosed?: unknown; probability?: unknown }
        }>
      }>
    }
    return {
      pipelines: (data?.results ?? []).flatMap(pipeline => {
        const id = dealText(pipeline.id)
        if (!id) return []
        const stages = (pipeline.stages ?? [])
          .flatMap(stage => {
            const stageId = dealText(stage.id)
            if (!stageId) return []
            const closed = dealText(stage.metadata?.isClosed)
            const probability = Number(dealText(stage.metadata?.probability) ?? Number.NaN)
            const status: 'open' | 'won' | 'lost' | null =
              closed === 'false'
                ? 'open'
                : closed === 'true' && probability === 1
                  ? 'won'
                  : closed === 'true' && probability === 0
                    ? 'lost'
                    : null
            return [
              {
                id: stageId,
                label: dealText(stage.label),
                position: typeof stage.displayOrder === 'number' ? stage.displayOrder : null,
                status,
              },
            ]
          })
          .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
        return [{ id, label: dealText(pipeline.label), stages }]
      }),
      nextAfter: null,
    }
  }

  /**
   * #2388.24 — la reprise de sociétés, page par page (curseur opaque), même
   * discipline que {@link listContacts} : la borne est celle du FOURNISSEUR
   * (100 max), appliquée ICI.
   */
  async listCompanies(accessToken: string, opts: { limit: number; after?: string }): Promise<CrmCompanyPage> {
    const pageSize = Math.min(Math.max(Math.trunc(opts.limit), 1), HUBSPOT_MAX_PAGE_SIZE)
    const params = new URLSearchParams({ limit: String(pageSize), properties: 'name,siren' })
    if (opts.after) params.set('after', opts.after)
    const res = await fetch(`${COMPANIES_URL}?${params.toString()}`, {
      method: 'GET',
      headers: this.authHeaders(accessToken),
    })
    if (!res.ok) throw new Error(`HubSpot list companies failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      results?: Array<{ id?: unknown; properties?: Record<string, unknown> }>
      paging?: { next?: { after?: string } }
    }
    return {
      companies: (data?.results ?? []).map(toCrmCompany),
      nextAfter: data?.paging?.next?.after ? String(data.paging.next.after) : null,
    }
  }

  /**
   * Log a Note engagement onto a contact's timeline (e.g. "email envoyé depuis
   * Bellum"). Associates the note to the contact in the same call. Returns the
   * new note id.
   */
  async logActivity(accessToken: string, contactId: string, note: string): Promise<{ id: string }> {
    const res = await fetch(NOTES_URL, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({
        properties: { hs_timestamp: Date.now(), hs_note_body: note },
        associations: [
          {
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: NOTE_TO_CONTACT_TYPE_ID }],
          },
        ],
      }),
    })
    if (!res.ok) throw new Error(`HubSpot log activity failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string }
    return { id: String(data?.id ?? '') }
  }

  /**
   * Create a **Deal** from a besoin (Théo p39 — a besoin is a would-be
   * opportunity, so its idiomatic HubSpot object is a Deal, not a task). The
   * `dealname` carries the besoin label, `description` the factual detail. We do
   * NOT set `pipeline`/`dealstage`: omitting them lets HubSpot place the deal in
   * the portal's default pipeline & first stage — never a fabricated stage.
   *
   * When we can resolve the portal's Company record for the account we associate
   * the deal to it inline; the lookup is best-effort (a missing `deals`↔company
   * scope or an unknown company must not block the write), so a failure there
   * simply lands the deal company-less. Returns the new deal id.
   */
  async createDeal(accessToken: string, input: CrmTaskInput): Promise<{ id: string }> {
    let companyId: string | null = null
    const company = input.company?.trim()
    if (company) {
      try {
        companyId = await this.findCompanyId(accessToken, { name: company })
      } catch {
        companyId = null
      }
    }
    const body: Record<string, unknown> = {
      properties: { dealname: input.subject, description: input.body },
    }
    if (companyId) {
      body['associations'] = [
        {
          to: { id: companyId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: DEAL_TO_COMPANY_TYPE_ID }],
        },
      ]
    }
    const res = await fetch(DEALS_URL, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HubSpot create deal failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string }
    return { id: String(data?.id ?? '') }
  }

  /**
   * #1934.18 — les pipelines d'affaires du portail, avec leurs stades RÉELS.
   *
   * `dealstage` attend l'IDENTIFIANT INTERNE d'un stade (`appointmentscheduled`,
   * ou un nombre sur un pipeline personnalisé), jamais son libellé. Cette
   * lecture est la seule source des identifiants que le produit envoie : un
   * stade qui n'y figure pas ne part pas.
   *
   * Un pipeline ou un stade ARCHIVÉ est écarté — y déplacer une affaire la
   * rangerait dans une colonne que personne ne voit plus. Une ligne sans
   * identifiant ni libellé est écartée aussi : on ne la complète pas.
   */
  async listDealPipelines(accessToken: string): Promise<HubspotDealPipeline[]> {
    const res = await fetch(DEAL_PIPELINES_URL, { method: 'GET', headers: this.authHeaders(accessToken) })
    if (!res.ok) throw new Error(`HubSpot read deal pipelines failed: ${await readError(res)}`)
    const data = (await res.json()) as { results?: unknown }
    const rows = Array.isArray(data?.results) ? (data.results as Array<Record<string, unknown>>) : []
    const text = (value: unknown): string | null =>
      typeof value === 'string' && value.trim() !== '' ? value : typeof value === 'number' ? String(value) : null
    const pipelines: HubspotDealPipeline[] = []
    for (const row of rows) {
      const id = text(row?.['id'])
      const label = text(row?.['label'])
      if (!id || !label || row?.['archived'] === true) continue
      const rawStages = Array.isArray(row['stages']) ? (row['stages'] as Array<Record<string, unknown>>) : []
      const stages = rawStages
        .filter(stage => stage?.['archived'] !== true)
        .map(stage => ({
          id: text(stage?.['id']),
          label: text(stage?.['label']),
          order: typeof stage?.['displayOrder'] === 'number' ? stage['displayOrder'] : 0,
        }))
        .filter((stage): stage is { id: string; label: string; order: number } => !!stage.id && !!stage.label)
        .sort((a, b) => a.order - b.order)
        .map(({ id: stageId, label: stageLabel }) => ({ id: stageId, label: stageLabel }))
      pipelines.push({ id, label, stages })
    }
    return pipelines
  }

  /**
   * #1934.18 — l'affaire telle que le PORTAIL la connaît : son nom, son stade
   * et son pipeline. La proposition se fige sur cette lecture, jamais sur ce que
   * l'écran a envoyé.
   */
  async getDeal(
    accessToken: string,
    dealId: string,
  ): Promise<{ id: string; name: string | null; stage: string | null; pipeline: string | null }> {
    const url = `${DEALS_URL}/${encodeURIComponent(dealId)}?properties=dealname,dealstage,pipeline`
    const res = await fetch(url, { method: 'GET', headers: this.authHeaders(accessToken) })
    if (!res.ok) throw new Error(`HubSpot read deal failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: unknown; properties?: Record<string, unknown> }
    const p = data?.properties ?? {}
    const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
    return {
      id: String(data?.id ?? dealId),
      name: str(p['dealname']),
      stage: str(p['dealstage']),
      pipeline: str(p['pipeline']),
    }
  }

  /**
   * #1934.18 — DÉPLACE une affaire d'un stade à l'autre.
   *
   * `PATCH` sur la seule propriété `dealstage` : une mise à jour complète
   * renverrait aussi les champs qu'on a lus, et les réécrirait tels qu'on les a
   * lus — donc écraserait toute correction faite dans le CRM entre la
   * proposition et la validation. Un seul champ part parce qu'un seul champ a
   * été montré et approuvé.
   *
   * ⚠️ `stageId` est un IDENTIFIANT lu par `listDealPipelines`, jamais un
   * libellé ni une correspondance approchée : `CrmService.proposeDealStage`
   * refuse tout stade absent du pipeline de l'affaire avant même de déposer la
   * demande.
   */
  async updateDealStage(accessToken: string, dealId: string, stageId: string): Promise<{ id: string }> {
    const res = await fetch(`${DEALS_URL}/${encodeURIComponent(dealId)}`, {
      method: 'PATCH',
      headers: this.authHeaders(accessToken),
      // L'IDENTIFIANT du stade, jamais son libellé : c'est ce que `dealstage` attend.
      body: JSON.stringify({ properties: { dealstage: stageId } }),
    })
    if (!res.ok) throw new Error(`HubSpot update deal stage failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string }
    return { id: String(data?.id ?? dealId) }
  }

  /**
   * Crée une TÂCHE de relance rattachée à un contact.
   *
   * `hs_task_status: NOT_STARTED` et rien d'autre : on ne devine ni la priorité
   * ni le propriétaire. Une tâche qui apparaît chez la mauvaise personne est
   * pire qu'une tâche non créée — elle est ignorée, puis elle pourrit la vue de
   * quelqu'un qui n'y peut rien.
   */
  async createTask(
    accessToken: string,
    input: { contactId?: string | null; subject: string; body?: string; dueAt: string },
  ): Promise<{ id: string }> {
    const body: Record<string, unknown> = {
      properties: {
        hs_task_subject: input.subject,
        hs_task_body: input.body ?? '',
        hs_task_status: 'NOT_STARTED',
        hs_task_type: 'TODO',
        hs_timestamp: String(Date.parse(input.dueAt)),
      },
    }
    if (input.contactId) {
      body['associations'] = [
        {
          to: { id: input.contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: TASK_TO_CONTACT_TYPE_ID }],
        },
      ]
    }
    const res = await fetch(TASKS_URL, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HubSpot create task failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string }
    return { id: String(data?.id ?? '') }
  }

  /**
   * Clôture une tâche déjà créée (#2319.114, épopée #2985) — MÊME endpoint que
   * {@link updateDealStage}, un PATCH sur l'objet, seule la propriété change :
   * `hs_task_status: COMPLETED` est la valeur documentée par HubSpot pour une
   * tâche terminée (même propriété que `createTask` pose à `NOT_STARTED`).
   * Aucune tâche déjà fermée chez HubSpot ne redevient « non commencée » —
   * cette méthode ne fait jamais le chemin inverse.
   */
  async closeTask(accessToken: string, taskId: string): Promise<{ id: string }> {
    const res = await fetch(`${TASKS_URL}/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ properties: { hs_task_status: 'COMPLETED' } }),
    })
    if (!res.ok) throw new Error(`HubSpot close task failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string }
    return { id: String(data?.id ?? taskId) }
  }

  /**
   * Journalise une RÉUNION tenue (§5.3 n°2).
   *
   * `hs_meeting_external_url` porte l'identifiant de l'évènement d'agenda :
   * c'est la clé d'idempotence côté appelant — rejouer le log d'une semaine ne
   * doit pas créer deux réunions pour le même rendez-vous.
   */
  async createMeeting(
    accessToken: string,
    input: {
      contactId?: string | null
      title: string
      body?: string
      startsAt: string
      endsAt: string
      externalId?: string
    },
  ): Promise<{ id: string }> {
    const properties: Record<string, unknown> = {
      hs_meeting_title: input.title,
      hs_meeting_body: input.body ?? '',
      hs_meeting_start_time: String(Date.parse(input.startsAt)),
      hs_meeting_end_time: String(Date.parse(input.endsAt)),
      hs_timestamp: String(Date.parse(input.startsAt)),
      hs_meeting_outcome: 'COMPLETED',
    }
    if (input.externalId) properties['hs_meeting_external_url'] = input.externalId

    const body: Record<string, unknown> = { properties }
    if (input.contactId) {
      body['associations'] = [
        {
          to: { id: input.contactId },
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: MEETING_TO_CONTACT_TYPE_ID }],
        },
      ]
    }
    const res = await fetch(MEETINGS_URL, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`HubSpot create meeting failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string }
    return { id: String(data?.id ?? '') }
  }

  /**
   * Une page de contacts, pour les analyses transverses (doublons, hygiène).
   *
   * Bornée à 200 : au-delà, le calcul de doublons devient quadratique et la
   * notification illisible. Analyser un CRM entier n'est pas le métier — le
   * signaler l'est.
   */
  async listContactsForAnalysis(
    accessToken: string,
    limit = 200,
  ): Promise<Array<{ id: string; name: string | null; email: string | null; company: string | null }>> {
    const page = await this.search(accessToken, CONTACTS_SEARCH_URL, {
      filterGroups: [],
      properties: [...READ_PROPERTIES, 'company'],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }],
      limit: Math.min(Math.max(limit, 1), 200),
    })
    const str = (value: unknown): string | null => (value == null || value === '' ? null : String(value))
    return page.results.map(row => {
      const properties = row.properties ?? {}
      const name = [str(properties['firstname']), str(properties['lastname'])].filter(Boolean).join(' ') || null
      return {
        id: String(row.id ?? ''),
        name,
        email: str(properties['email']),
        company: str(properties['company']),
      }
    })
  }

  /**
   * Les contacts sans activité depuis `days` jours — « les leads à relancer »
   * (§5.3 n°4) et « les dormants » (n°14) sont la MÊME question posée avec deux
   * seuils, donc une seule requête paramétrée.
   */
  async searchStaleContacts(
    accessToken: string,
    days: number,
    limit: number,
  ): Promise<Array<{ id: string; name: string | null; email: string | null; lastActivityAt: string | null }>> {
    const cutoff = String(Date.now() - days * 86_400_000)
    const page = await this.search(accessToken, CONTACTS_SEARCH_URL, {
      filterGroups: [{ filters: [{ propertyName: 'lastmodifieddate', operator: 'LT', value: cutoff }] }],
      properties: [...READ_PROPERTIES, 'lastmodifieddate'],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'ASCENDING' }],
      limit,
    })
    const str = (value: unknown): string | null => (value == null || value === '' ? null : String(value))
    return page.results.map(row => {
      const properties = row.properties ?? {}
      const name = [str(properties['firstname']), str(properties['lastname'])].filter(Boolean).join(' ') || null
      const raw = str(properties['lastmodifieddate'])
      const parsed = raw ? Date.parse(raw) : Number.NaN
      return {
        id: String(row.id ?? ''),
        name,
        email: str(properties['email']),
        lastActivityAt: Number.isNaN(parsed) ? null : new Date(parsed).toISOString(),
      }
    })
  }

  // ---- Presence read-back (roadmap §8/§9 — « déjà en relation ? ») ----------
  // POST /crm/v3/objects/{companies|contacts|deals}/search — filterGroups are
  // OR'd between groups, AND'd within a group (developers.hubspot.com/docs/api/crm/search).

  /** Generic search POST; returns the raw page (results + total). */
  private async search(
    accessToken: string,
    url: string,
    body: Record<string, unknown>,
  ): Promise<{
    total: number
    results: Array<{ id?: unknown; properties?: Record<string, unknown> }>
    nextAfter: string | null
  }> {
    const res = await fetch(url, { method: 'POST', headers: this.authHeaders(accessToken), body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`HubSpot search failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      total?: number
      results?: Array<{ id?: unknown; properties?: Record<string, unknown> }>
      paging?: { next?: { after?: string } }
    }
    return {
      total: Number(data?.total ?? 0),
      results: data?.results ?? [],
      nextAfter: data?.paging?.next?.after ? String(data.paging.next.after) : null,
    }
  }

  /** Find the portal's company record for the target account — by exact `domain`
   *  when we have one, else by name token. Null when the portal doesn't know it. */
  async findCompanyId(accessToken: string, q: { name?: string; domain?: string }): Promise<string | null> {
    const filterGroups: Array<{ filters: Array<Record<string, string>> }> = []
    if (q.domain) filterGroups.push({ filters: [{ propertyName: 'domain', operator: 'EQ', value: q.domain }] })
    if (q.name) filterGroups.push({ filters: [{ propertyName: 'name', operator: 'CONTAINS_TOKEN', value: q.name }] })
    if (filterGroups.length === 0) return null
    const page = await this.search(accessToken, COMPANIES_SEARCH_URL, {
      filterGroups,
      properties: ['name', 'domain'],
      limit: 1,
    })
    const first = page.results[0]
    return first?.id ? String(first.id) : null
  }

  /**
   * #2031.5 / #2045.5 — les valeurs BRUTES `industry`/`country` des sociétés du
   * portail, DISTINCTES et non vides. Jamais un filtre, jamais une recherche :
   * on liste (GET `/objects/companies`), on lit les deux propriétés HubSpot par
   * défaut telles quelles, on déduplique. Aucune traduction, aucun
   * rapprochement vers un autre vocabulaire — c'est tout le point (voir
   * `crm-vocabulary.ts`).
   *
   * Pagination bornée par `opts.maxCompanies` : un portail à 50 000 sociétés
   * n'est pas scanné en entier pour une aide à la saisie.
   */
  async companyVocabulary(
    accessToken: string,
    opts: { pageSize: number; maxCompanies: number },
  ): Promise<{ industries: string[]; countries: string[] }> {
    const pageSize = Math.min(Math.max(Math.trunc(opts.pageSize), 1), HUBSPOT_MAX_PAGE_SIZE)
    const industries = new Set<string>()
    const countries = new Set<string>()
    let after: string | undefined
    let scanned = 0
    do {
      const params = new URLSearchParams({ limit: String(pageSize), properties: 'industry,country' })
      if (after) params.set('after', after)
      const res = await fetch(`${COMPANIES_URL}?${params.toString()}`, {
        method: 'GET',
        headers: this.authHeaders(accessToken),
      })
      if (!res.ok) throw new Error(`HubSpot list companies failed: ${await readError(res)}`)
      const data = (await res.json()) as {
        results?: Array<{ properties?: Record<string, unknown> }>
        paging?: { next?: { after?: string } }
      }
      const rows = data?.results ?? []
      for (const row of rows) {
        const industry = row.properties?.['industry']
        if (typeof industry === 'string' && industry.trim()) industries.add(industry.trim())
        const country = row.properties?.['country']
        if (typeof country === 'string' && country.trim()) countries.add(country.trim())
      }
      scanned += rows.length
      after = data?.paging?.next?.after ? String(data.paging.next.after) : undefined
      if (rows.length === 0) break
    } while (after && scanned < opts.maxCompanies)
    return { industries: [...industries], countries: [...countries] }
  }

  /**
   * #2045.5 — le total PORTAIL, tous comptes confondus. Distinct de
   * `searchContactsAtCompany` (ci-dessous), qui filtre sur UN compte : ici
   * aucun filtre — HubSpot rend son `total` même sur un `filterGroups` vide,
   * donc la même méthode `search` que le reste de ce client répond, jamais une
   * seconde façon d'appeler ce point (GA-26). `limit: 1` : seul `total`
   * compte, aucune ligne n'est lue.
   */
  async portalContactTotal(accessToken: string): Promise<number> {
    const page = await this.search(accessToken, CONTACTS_SEARCH_URL, { filterGroups: [], limit: 1 })
    return page.total
  }

  /** Contacts already in the portal at the target account: matched by email
   *  domain (`*@acme.fr`) OR by the free-text `company` property. Returns the
   *  portal's total + a bounded page + the freshest modification date. */
  async searchContactsAtCompany(
    accessToken: string,
    q: { name?: string; domain?: string },
  ): Promise<{ total: number; contacts: CrmPresenceContact[]; lastActivityAt: string | null }> {
    const filterGroups: Array<{ filters: Array<Record<string, string>> }> = []
    if (q.domain)
      filterGroups.push({ filters: [{ propertyName: 'email', operator: 'CONTAINS_TOKEN', value: `*@${q.domain}` }] })
    if (q.name) filterGroups.push({ filters: [{ propertyName: 'company', operator: 'CONTAINS_TOKEN', value: q.name }] })
    if (filterGroups.length === 0) return { total: 0, contacts: [], lastActivityAt: null }
    const page = await this.search(accessToken, CONTACTS_SEARCH_URL, {
      filterGroups,
      properties: [...READ_PROPERTIES, 'lastmodifieddate'],
      limit: PRESENCE_PAGE,
    })
    const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
    const contacts: CrmPresenceContact[] = page.results.map(row => {
      const p = row.properties ?? {}
      const name = [str(p['firstname']), str(p['lastname'])].filter(Boolean).join(' ') || null
      return { id: String(row.id ?? ''), name, email: str(p['email']), jobTitle: str(p['jobtitle']) }
    })
    const lastActivityAt = latestIso(page.results.map(r => str(r.properties?.['lastmodifieddate'])))
    return { total: page.total, contacts, lastActivityAt }
  }

  /** OPEN deals associated to the portal company (`associations.company` filter +
   *  `hs_is_closed` false — both HubSpot-defined). Company id comes from
   *  `findCompanyId`; without one there is nothing to associate on. */
  async searchOpenDealsForCompany(
    accessToken: string,
    companyId: string,
  ): Promise<{ deals: CrmPresenceDeal[]; lastActivityAt: string | null }> {
    const page = await this.search(accessToken, DEALS_SEARCH_URL, {
      filterGroups: [
        {
          filters: [
            { propertyName: 'associations.company', operator: 'EQ', value: companyId },
            { propertyName: 'hs_is_closed', operator: 'EQ', value: 'false' },
          ],
        },
      ],
      // #1934.18 — `pipeline` : sans lui, l'écran ne sait pas QUELS stades
      // proposer pour une affaire — ceux d'un autre pipeline seraient refusés.
      properties: ['dealname', 'dealstage', 'pipeline', 'amount', 'hs_lastmodifieddate'],
      limit: PRESENCE_PAGE,
    })
    const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
    const deals: CrmPresenceDeal[] = page.results.map(row => {
      const p = row.properties ?? {}
      const amount = p['amount'] != null && p['amount'] !== '' ? Number(p['amount']) : null
      return {
        id: String(row.id ?? ''),
        name: str(p['dealname']),
        stage: str(p['dealstage']),
        pipeline: str(p['pipeline']),
        amount: amount != null && Number.isFinite(amount) ? amount : null,
      }
    })
    const lastActivityAt = latestIso(page.results.map(r => str(r.properties?.['hs_lastmodifieddate'])))
    return { deals, lastActivityAt }
  }
}
