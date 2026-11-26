import type {
  CrmActivityPage,
  CrmDealPage,
  CrmOwnerPage,
  CrmPipelinePage,
  CrmReadOptions,
} from '../crm/adapter/crm-read-types'
import type { CrmTaskInput } from '../crm/crm-task'
import type { CrmCompanyPage, CrmContactPage } from '../crm/hubspot.client'
import { PIPEDRIVE_API_VERSION, PIPEDRIVE_OAUTH_BASE_URL, type PipedriveConfig } from './pipedrive-config'

/**
 * Thin Pipedrive REST wrapper. No SDK — the OAuth token endpoint plus a Person
 * upsert (and a best-effort Organization link) is all we need, and staying on
 * `fetch` keeps the dependency surface small. Every call checks `res.ok` (code
 * rule) and surfaces a clear error rather than an invented fallback.
 *
 * OAuth (verified against developers.pipedrive.com):
 *   - authorize: GET  https://oauth.pipedrive.com/oauth/authorize
 *   - token:     POST https://oauth.pipedrive.com/oauth/token
 *       HTTP Basic auth = base64(client_id:client_secret),
 *       Content-Type: application/x-www-form-urlencoded
 *       grant_type=authorization_code|refresh_token
 *   The token response carries a per-company `api_domain` (like Salesforce's
 *   instance_url) that every REST call is addressed to.
 *
 * REST (Pipedrive API v2):
 *   - POST   {api_domain}/api/v2/persons                 create Person
 *   - PATCH  {api_domain}/api/v2/persons/{id}            update Person
 *   - GET    {api_domain}/api/v2/persons/search          find Person (by email)
 *   - POST   {api_domain}/api/v2/organizations           create Organization
 *   - GET    {api_domain}/api/v2/organizations/search    find Organization (by name)
 */

type PipedriveTokens = {
  accessToken: string
  refreshToken: string | null
  /** Per-company REST base, e.g. https://acme.pipedrive.com */
  apiDomain: string | null
  /** Space-separated scopes granted, as echoed by the token response. */
  scope: string | null
  /** seconds until the access token expires (0 when Pipedrive omits it). */
  expiresIn: number
}

export type PipedriveContactInput = {
  email?: string
  firstName?: string
  lastName?: string
  company?: string
  jobTitle?: string
  phone?: string
  linkedinUrl?: string
}

/** Result of an upsert: whether Pipedrive got a brand new Person or an update. */
export type PipedriveUpsertResult = { id: string; created: boolean }

/** Compose a Pipedrive Person `name` (single required field) from our parts. */
function personName(input: PipedriveContactInput): string {
  const full = [input.firstName, input.lastName].filter(Boolean).join(' ').trim()
  if (full) return full
  if (input.email) return input.email
  return input.company || 'Contact'
}

/**
 * Map our contact input onto Pipedrive Person fields. `emails`/`phones` are
 * arrays of {value, primary, label} in API v2. Job title / LinkedIn have no
 * standard Person field (they are per-account custom fields), so we don't invent
 * one — same restraint as the Salesforce mapping.
 */
function toPersonFields(input: PipedriveContactInput, orgId: number | null): Record<string, unknown> {
  const fields: Record<string, unknown> = { name: personName(input) }
  if (input.email) fields['emails'] = [{ value: input.email, primary: true, label: 'work' }]
  if (input.phone) fields['phones'] = [{ value: input.phone, primary: true, label: 'work' }]
  if (orgId !== null) fields['org_id'] = orgId
  return fields
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; error_description?: string; message?: string }
    return body?.error_description || body?.error || body?.message || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

function toTokens(data: Record<string, unknown>): PipedriveTokens {
  return {
    accessToken: String(data['access_token'] ?? ''),
    refreshToken: data['refresh_token'] ? String(data['refresh_token']) : null,
    apiDomain: data['api_domain'] ? String(data['api_domain']) : null,
    scope: data['scope'] ? String(data['scope']) : null,
    expiresIn: Number(data['expires_in'] ?? 0),
  }
}

/** Pull a matched record's numeric id out of an item-search response. Pipedrive
 *  wraps hits as `data.items[].item.id`; tolerate a flatter `data.items[].id`. */
function firstSearchId(data: unknown): number | null {
  const items = (data as { data?: { items?: Array<{ item?: { id?: number }; id?: number }> } })?.data?.items
  const first = Array.isArray(items) ? items[0] : undefined
  const id = first?.item?.id ?? first?.id
  return typeof id === 'number' ? id : null
}

const pdText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** SYNC-A — un identifiant rendu par Pipedrive (nombre ou texte), sinon `null`. */
const pdId = (value: unknown): string | null =>
  typeof value === 'number' || (typeof value === 'string' && value.trim()) ? String(value).trim() : null

/**
 * #4290.15 — un lien (`org_id`, `person_id`) : nombre en v2, mais `{ value, name }` sur les comptes qui rendent
 * encore la forme v1. Jamais `String(objet)` (« [object Object] ») : sans identifiant lisible, `null`.
 */
function pdRef(value: unknown): string | null {
  if (typeof value === 'object' && value !== null) return pdId((value as { value?: unknown }).value)
  return pdId(value)
}

function pdDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** `[{ value, primary }]` → la valeur primaire, à défaut la première ; `null` si rien. */
function primaryValue(list: unknown): string | null {
  if (!Array.isArray(list)) return null
  const entries = list.filter((e): e is { value?: unknown; primary?: unknown } => typeof e === 'object' && e !== null)
  const pick = entries.find(e => e.primary === true && pdText(e.value)) ?? entries.find(e => pdText(e.value))
  return pick ? pdText(pick.value) : null
}

export class PipedriveClient {
  constructor(private readonly config: PipedriveConfig) {}

  private get tokenUrl(): string {
    return `${PIPEDRIVE_OAUTH_BASE_URL}/oauth/token`
  }

  /** HTTP Basic credentials for the OAuth token endpoint. */
  private basicAuth(): string {
    return Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')
  }

  /** Exchange an authorization `code` for tokens (grant_type=authorization_code). */
  async exchangeCode(code: string): Promise<PipedriveTokens> {
    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.basicAuth()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
      }),
    })
    if (!res.ok) throw new Error(`Pipedrive token exchange failed: ${await readError(res)}`)
    return toTokens((await res.json()) as Record<string, unknown>)
  }

  /** Refresh an expired access token (grant_type=refresh_token). */
  async refresh(refreshToken: string): Promise<PipedriveTokens> {
    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.basicAuth()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) throw new Error(`Pipedrive token refresh failed: ${await readError(res)}`)
    const tokens = toTokens((await res.json()) as Record<string, unknown>)
    // Pipedrive re-issues the same refresh token with an extended window; keep the
    // existing one if the response happens to omit it.
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken }
  }

  /**
   * Révoque le jeton chez Pipedrive (`POST {OAUTH_BASE}/oauth/revoke`).
   *
   * Endpoint officiel documenté (pipedrive.readme.io « App Uninstallation »,
   * confirmé par un ingénieur Pipedrive sur le forum développeur), authentifié
   * en HTTP Basic comme `exchangeCode`/`refresh` ci-dessus. Envoyer le jeton de
   * RAFRAÎCHISSEMENT retire TOUTES les données OAuth côté Pipedrive et marque
   * l'application désinstallée — envoyer seulement l'accès laisserait le
   * rafraîchissement valide. Sans cet appel, effacer notre ligne en base ne
   * retirait rien côté Pipedrive.
   */
  async revoke(refreshToken: string): Promise<void> {
    const res = await fetch(`${PIPEDRIVE_OAUTH_BASE_URL}/oauth/revoke`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${this.basicAuth()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: 'refresh_token' }),
    })
    if (!res.ok) throw new Error(`Pipedrive token revocation failed: ${await readError(res)}`)
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }

  private restBase(apiDomain: string): string {
    return `${apiDomain}/api/${PIPEDRIVE_API_VERSION}`
  }

  /**
   * Create a **Deal** from a besoin (Théo p39 — a besoin is a would-be
   * opportunity, so its idiomatic Pipedrive object is a Deal, API v2 `/deals`,
   * not an activity/task). The deal `title` carries the besoin label. When a
   * company is known we best-effort find-or-create its Organization and link the
   * deal to it (`org_id`); a failure there (narrower scope) must not block the
   * write, so the deal lands org-less. We do NOT set `stage_id`/`pipeline_id`:
   * omitting them lets Pipedrive place the deal in the default pipeline's first
   * stage — never a fabricated stage. Returns the new deal id.
   */
  async createDeal(accessToken: string, apiDomain: string, input: CrmTaskInput): Promise<{ id: string }> {
    let orgId: number | null = null
    const company = input.company?.trim()
    if (company) {
      try {
        orgId = await this.resolveOrgId(accessToken, apiDomain, company)
      } catch {
        orgId = null
      }
    }
    const fields: Record<string, unknown> = { title: input.subject }
    if (orgId !== null) fields['org_id'] = orgId
    const res = await fetch(`${this.restBase(apiDomain)}/deals`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(fields),
    })
    if (!res.ok) throw new Error(`Pipedrive create deal failed: ${await readError(res)}`)
    const data = (await res.json()) as { data?: { id?: number } }
    const dealId = Number(data?.data?.id ?? 0)

    // A Pipedrive Deal has no description field, and Notes are a v1 resource;
    // carry the besoin detail as a Note on the deal, best-effort — a failure
    // (scope, v1 disabled) must not undo the deal that WAS created.
    const body = input.body?.trim()
    if (dealId && body) {
      try {
        await this.createDealNote(accessToken, apiDomain, dealId, body)
      } catch {
        // deal stands; the detail note is a nice-to-have, not a blocker.
      }
    }
    return { id: String(dealId) }
  }

  /** Attach a Note (v1 resource) carrying the besoin detail to a deal. */
  private async createDealNote(accessToken: string, apiDomain: string, dealId: number, content: string): Promise<void> {
    const res = await fetch(`${apiDomain}/api/v1/notes`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ content, deal_id: dealId }),
    })
    if (!res.ok) throw new Error(`Pipedrive create note failed: ${await readError(res)}`)
  }

  /** Find a Person id by exact email (item search), or null if none exists. */
  async findPersonIdByEmail(accessToken: string, apiDomain: string, email: string): Promise<number | null> {
    const params = new URLSearchParams({ term: email, fields: 'email', exact_match: 'true', limit: '1' })
    const res = await fetch(`${this.restBase(apiDomain)}/persons/search?${params.toString()}`, {
      method: 'GET',
      headers: this.authHeaders(accessToken),
    })
    if (!res.ok) throw new Error(`Pipedrive person search failed: ${await readError(res)}`)
    return firstSearchId(await res.json())
  }

  /** Create a Person. Returns the new numeric id. */
  async createPerson(
    accessToken: string,
    apiDomain: string,
    input: PipedriveContactInput,
    orgId: number | null,
  ): Promise<number> {
    const res = await fetch(`${this.restBase(apiDomain)}/persons`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(toPersonFields(input, orgId)),
    })
    if (!res.ok) throw new Error(`Pipedrive create person failed: ${await readError(res)}`)
    const data = (await res.json()) as { data?: { id?: number } }
    return Number(data?.data?.id ?? 0)
  }

  /** Patch an existing Person in place (never clobbers the name with a fallback). */
  async updatePerson(
    accessToken: string,
    apiDomain: string,
    id: number,
    input: PipedriveContactInput,
    orgId: number | null,
  ): Promise<void> {
    const fields = toPersonFields(input, orgId)
    // On update, don't overwrite an existing name with our fallback-composed one
    // unless the caller actually supplied name parts.
    if (!input.firstName && !input.lastName) delete fields['name']
    const res = await fetch(`${this.restBase(apiDomain)}/persons/${encodeURIComponent(String(id))}`, {
      method: 'PATCH',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(fields),
    })
    if (!res.ok) throw new Error(`Pipedrive update person failed: ${await readError(res)}`)
  }

  /** Find an Organization id by exact name (item search), or null. */
  async findOrgIdByName(accessToken: string, apiDomain: string, name: string): Promise<number | null> {
    const params = new URLSearchParams({ term: name, fields: 'name', exact_match: 'true', limit: '1' })
    const res = await fetch(`${this.restBase(apiDomain)}/organizations/search?${params.toString()}`, {
      method: 'GET',
      headers: this.authHeaders(accessToken),
    })
    if (!res.ok) throw new Error(`Pipedrive organization search failed: ${await readError(res)}`)
    return firstSearchId(await res.json())
  }

  /** Create an Organization by name. Returns the new numeric id. */
  async createOrg(accessToken: string, apiDomain: string, name: string): Promise<number> {
    const res = await fetch(`${this.restBase(apiDomain)}/organizations`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ name }),
    })
    if (!res.ok) throw new Error(`Pipedrive create organization failed: ${await readError(res)}`)
    const data = (await res.json()) as { data?: { id?: number } }
    return Number(data?.data?.id ?? 0)
  }

  /** Find-or-create the Organization for `company`, returning its id. */
  async resolveOrgId(accessToken: string, apiDomain: string, company: string): Promise<number> {
    const existing = await this.findOrgIdByName(accessToken, apiDomain, company)
    return existing ?? this.createOrg(accessToken, apiDomain, company)
  }

  /**
   * Upsert a Person keyed by email: an existing Person is updated in place (no
   * duplicate), otherwise a new one is created. Without an email there is nothing
   * to match on, so we always create. When a company is given we best-effort link
   * (find-or-create) an Organization — a failure there (e.g. narrower scope) must
   * not block the Person write, so it's swallowed and the Person lands org-less.
   */
  async upsertContact(
    accessToken: string,
    apiDomain: string,
    input: PipedriveContactInput,
  ): Promise<PipedriveUpsertResult> {
    let orgId: number | null = null
    if (input.company) {
      try {
        orgId = await this.resolveOrgId(accessToken, apiDomain, input.company)
      } catch {
        orgId = null
      }
    }

    if (input.email) {
      const existingId = await this.findPersonIdByEmail(accessToken, apiDomain, input.email)
      if (existingId !== null) {
        await this.updatePerson(accessToken, apiDomain, existingId, input, orgId)
        return { id: String(existingId), created: false }
      }
    }
    const id = await this.createPerson(accessToken, apiDomain, input, orgId)
    return { id: String(id), created: true }
  }

  // ---- #4189 — lecture commune (API v2 : `cursor`, `updated_since`, tri par `update_time`) ----
  // Seuls les champs DOCUMENTÉS de chaque objet sont lus. Ce que la v2 ne rend pas
  // sans un second appel (nom de l'organisation d'une personne ou d'une affaire,
  // libellé d'étape) est laissé `null` plutôt que deviné ou obtenu par N appels.

  private async readList(
    accessToken: string,
    apiDomain: string,
    resource: 'persons' | 'organizations' | 'deals' | 'activities' | 'pipelines' | 'stages',
    opts: CrmReadOptions,
  ): Promise<{ rows: Array<Record<string, unknown>>; nextAfter: string | null }> {
    const params = new URLSearchParams({ limit: String(Math.min(Math.max(Math.trunc(opts.limit), 1), 500)) })
    // Pipelines et étapes ne se trient pas par `update_time` (paramètre refusé) : l'ordre du CRM.
    const incremental = resource !== 'pipelines' && resource !== 'stages'
    if (incremental) {
      params.set('sort_by', 'update_time')
      params.set('sort_direction', 'asc')
    }
    // #4290.4 — `updated_since` est refusé sur pipelines/étapes (« not allowed ») : la liste, courte, se relit entière.
    if (opts.since && incremental) {
      // #4465 — Pipedrive v2 rejette (« date invalide ») les millisecondes d'un ISO JS : il attend le
      // RFC 3339 à la seconde, `2026-10-01T08:00:00Z`. La seconde est tronquée vers le bas : `updated_since`
      // est inclusif, une relecture d'une seconde ne perd rien.
      const sinceMs = Date.parse(opts.since)
      if (Number.isNaN(sinceMs)) throw new Error('Pipedrive: date « depuis » illisible')
      params.set('updated_since', new Date(sinceMs).toISOString().replace(/\.\d{3}Z$/, 'Z'))
    }
    if (opts.after) params.set('cursor', opts.after)
    const res = await fetch(`${this.restBase(apiDomain)}/${resource}?${params.toString()}`, {
      method: 'GET',
      headers: this.authHeaders(accessToken),
    })
    if (!res.ok) throw new Error(`Pipedrive read ${resource} failed: ${await readError(res)}`)
    const body = (await res.json()) as {
      data?: Array<Record<string, unknown>> | null
      additional_data?: { next_cursor?: string | null }
    }
    return { rows: body?.data ?? [], nextAfter: body?.additional_data?.next_cursor || null }
  }

  async listContacts(accessToken: string, apiDomain: string, opts: CrmReadOptions): Promise<CrmContactPage> {
    const { rows, nextAfter } = await this.readList(accessToken, apiDomain, 'persons', opts)
    return {
      contacts: rows.map(row => ({
        id: String(row['id'] ?? ''),
        email: primaryValue(row['emails']),
        // #4290.15 — une personne saisie avec le seul `name` (prénom / nom nuls) garde son nom entier.
        firstName: pdText(row['first_name']) ?? (pdText(row['last_name']) ? null : pdText(row['name'])),
        lastName: pdText(row['last_name']),
        company: null,
        jobTitle: null,
        phone: primaryValue(row['phones']),
        modifiedAt: pdDate(row['update_time']),
      })),
      nextAfter,
    }
  }

  async listCompanies(accessToken: string, apiDomain: string, opts: CrmReadOptions): Promise<CrmCompanyPage> {
    const { rows, nextAfter } = await this.readList(accessToken, apiDomain, 'organizations', opts)
    return {
      companies: rows.map(row => ({
        id: String(row['id'] ?? ''),
        name: pdText(row['name']),
        domain: null,
        modifiedAt: pdDate(row['update_time']),
      })),
      nextAfter,
    }
  }

  async listDeals(accessToken: string, apiDomain: string, opts: CrmReadOptions): Promise<CrmDealPage> {
    const { rows, nextAfter } = await this.readList(accessToken, apiDomain, 'deals', opts)
    return {
      deals: rows.map(row => {
        const status = row['status']
        return {
          id: String(row['id'] ?? ''),
          title: pdText(row['title']),
          amount: typeof row['value'] === 'number' ? row['value'] : null,
          currency: pdText(row['currency']),
          stage: null,
          status: status === 'open' || status === 'won' || status === 'lost' ? status : null,
          closeDate: pdText(row['expected_close_date']),
          // #3918.8 — la clôture RÉELLE (gagnée ou perdue) et la création, telles que Pipedrive les rend.
          closedAt: pdDate(row['close_time']),
          createdAt: pdDate(row['add_time']),
          accountId: pdRef(row['org_id']),
          accountName: null,
          modifiedAt: pdDate(row['update_time']),
          ownerId: pdId(row['owner_id']),
          pipelineId: pdId(row['pipeline_id']),
          stageId: pdId(row['stage_id']),
          lostReason: pdText(row['lost_reason']),
          contactIds: pdRef(row['person_id']) ? [pdRef(row['person_id']) as string] : [],
          customFields: isRecord(row['custom_fields']) ? row['custom_fields'] : {},
          url: pdId(row['id']) ? `${apiDomain}/deal/${pdId(row['id'])}` : null,
        }
      }),
      nextAfter,
    }
  }

  async listActivities(accessToken: string, apiDomain: string, opts: CrmReadOptions): Promise<CrmActivityPage> {
    const { rows, nextAfter } = await this.readList(accessToken, apiDomain, 'activities', opts)
    return {
      activities: rows.map(row => ({
        id: String(row['id'] ?? ''),
        subject: pdText(row['subject']),
        kind: pdText(row['type']),
        dueAt: pdText(row['due_date']),
        done: typeof row['done'] === 'boolean' ? row['done'] : null,
        modifiedAt: pdDate(row['update_time']),
        // SYNC-A — les liens, jamais `note` (le corps : doctrine c96).
        ownerId: pdId(row['owner_id']),
        accountId: pdRef(row['org_id']),
        contactId: pdRef(row['person_id']),
        dealId: pdId(row['deal_id']),
        url: null,
      })),
      nextAfter,
    }
  }

  /** SYNC-A — les utilisateurs du compte (`GET /api/v1/users` : liste complète, la v2 n'a pas cet objet). */
  async listOwners(accessToken: string, apiDomain: string, _opts: CrmReadOptions): Promise<CrmOwnerPage> {
    const res = await fetch(`${apiDomain}/api/v1/users`, { method: 'GET', headers: this.authHeaders(accessToken) })
    if (!res.ok) throw new Error(`Pipedrive read users failed: ${await readError(res)}`)
    const body = (await res.json()) as { data?: Array<Record<string, unknown>> | null }
    return {
      owners: (body?.data ?? []).flatMap(row =>
        pdId(row['id'])
          ? [{ id: pdId(row['id']) as string, name: pdText(row['name']), email: pdText(row['email']) }]
          : [],
      ),
      nextAfter: null,
    }
  }

  /** SYNC-A — les pipelines, puis TOUTES leurs étapes (`order_nr` = la position), une page de chaque. */
  async listPipelines(accessToken: string, apiDomain: string, opts: CrmReadOptions): Promise<CrmPipelinePage> {
    const { rows: pipelines, nextAfter } = await this.readList(accessToken, apiDomain, 'pipelines', opts)
    const { rows: stages } = await this.readList(accessToken, apiDomain, 'stages', { limit: 500 })
    return {
      pipelines: pipelines.flatMap(row => {
        const id = pdId(row['id'])
        if (!id) return []
        const own = stages
          .filter(stage => pdId(stage['pipeline_id']) === id && pdId(stage['id']))
          .map(stage => ({
            id: pdId(stage['id']) as string,
            label: pdText(stage['name']),
            position: typeof stage['order_nr'] === 'number' ? stage['order_nr'] : null,
            status: null,
          }))
          .sort((a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER))
        return [{ id, label: pdText(row['name']), stages: own }]
      }),
      nextAfter,
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
