import type { CrmDealPage, CrmReadOptions } from '../crm/adapter/crm-read-types'
import type { CrmTaskInput } from '../crm/crm-task'
import type { CrmCompanyPage, CrmContactPage } from '../crm/hubspot.client'
import { ATTIO_API_URL, ATTIO_APP_URL, type AttioConfig } from './attio-config'

/**
 * Thin Attio REST wrapper. No SDK — the OAuth token exchange plus one Person
 * record write is all the beta needs, and staying on `fetch` keeps the
 * dependency surface small. Every call checks `res.ok` (code rule) and surfaces
 * a clear error rather than an invented fallback.
 *
 * Endpoints are the real, documented Attio v2 API (docs.attio.com):
 *   POST https://app.attio.com/oauth/token                          — token exchange
 *   GET  https://api.attio.com/v2/self                              — identify (workspace)
 *   POST https://api.attio.com/v2/objects/people/records/query      — find by email
 *   POST https://api.attio.com/v2/objects/people/records            — create Person
 *   PUT  https://api.attio.com/v2/objects/people/records?matching_attribute=email_addresses — upsert Person
 *
 * Attio access tokens are long-lived with no refresh token, so — unlike
 * Salesforce — there is no refresh() here. There is also no revoke() here:
 * Attio's public OAuth reference lists only authorize/token/introspect
 * (docs.attio.com/docs/oauth/*, confirmed complete by docs.attio.com/llms.txt)
 * and the published OpenAPI spec (https://api.attio.com/openapi/api) cites
 * app.attio.com/authorize and /oauth/token only as the OAuth2 security
 * scheme's URLs, never as callable operations — no server-side revocation
 * endpoint is documented anywhere. Verified 2026-08-30. See
 * AttioService.disconnect for what that means for the "Déconnecter" flow.
 */

type AttioTokens = {
  accessToken: string
  /** Attio issues no refresh token — always null, kept for the shared connection shape. */
  refreshToken: string | null
  /** Attio access tokens do not expire — always 0 (⇒ null expiry). */
  expiresIn: number
}

/** Workspace identity behind the token (GET /v2/self). */
type AttioIdentity = {
  workspaceId: string | null
  workspaceName: string | null
}

export type AttioContactInput = {
  email?: string
  firstName?: string
  lastName?: string
  company?: string
  jobTitle?: string
  phone?: string
  linkedinUrl?: string
}

/** Result of an upsert: the Attio record id and whether it was newly created. */
export type AttioUpsertResult = { id: string; created: boolean }

/** Attio value blocks for a Person record. Only non-empty fields are emitted so
 *  an update never clobbers an existing value with an empty one. */
function toPersonValues(input: AttioContactInput): Record<string, unknown> {
  const values: Record<string, unknown> = {}

  const fullName = [input.firstName, input.lastName].filter(Boolean).join(' ').trim() || input.company || undefined
  if (input.firstName || input.lastName || fullName) {
    values['name'] = [
      {
        first_name: input.firstName ?? '',
        last_name: input.lastName ?? '',
        full_name: fullName ?? '',
      },
    ]
  }
  if (input.email) values['email_addresses'] = [{ email_address: input.email }]
  if (input.jobTitle) values['job_title'] = [{ value: input.jobTitle }]
  // International (+…) numbers let Attio infer the country; skip otherwise to
  // avoid a 400 on an un-parseable local number (clear error > invented data).
  if (input.phone && input.phone.trim().startsWith('+')) {
    values['phone_numbers'] = [{ original_phone_number: input.phone.trim() }]
  }
  return values
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      message?: string
      error_description?: string
      error?: string
    }
    return body?.message || body?.error_description || body?.error || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

/** Pull the record id out of an Attio record response (`data.id.record_id`). */
function recordId(data: unknown): string {
  const id = (data as { data?: { id?: { record_id?: unknown } } })?.data?.id?.record_id
  return id ? String(id) : ''
}

type AttioRecord = {
  id?: { record_id?: unknown }
  created_at?: unknown
  values?: Record<string, Array<Record<string, unknown>> | undefined>
}

const attioText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)
const attioFirst = (row: AttioRecord, attribute: string): Record<string, unknown> | undefined =>
  row.values?.[attribute]?.[0]

function attioDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

export class AttioClient {
  constructor(private readonly config: AttioConfig) {}

  private get tokenUrl(): string {
    return `${ATTIO_APP_URL}/oauth/token`
  }

  private get peopleBase(): string {
    return `${ATTIO_API_URL}/v2/objects/people/records`
  }

  private get companiesBase(): string {
    return `${ATTIO_API_URL}/v2/objects/companies/records`
  }

  /** Exchange an authorization `code` for a token (grant_type=authorization_code). */
  async exchangeCode(code: string): Promise<AttioTokens> {
    const res = await fetch(this.tokenUrl, {
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
    if (!res.ok) throw new Error(`Attio token exchange failed: ${await readError(res)}`)
    const data = (await res.json()) as Record<string, unknown>
    return {
      accessToken: String(data['access_token'] ?? ''),
      refreshToken: null,
      expiresIn: Number(data['expires_in'] ?? 0),
    }
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }

  /** Identify the workspace the token is scoped to (GET /v2/self). Best-effort:
   *  a failure here must not fail the OAuth link, so callers treat it as optional. */
  async identify(accessToken: string): Promise<AttioIdentity> {
    const res = await fetch(`${ATTIO_API_URL}/v2/self`, {
      method: 'GET',
      headers: this.authHeaders(accessToken),
    })
    if (!res.ok) throw new Error(`Attio identify failed: ${await readError(res)}`)
    const data = (await res.json()) as { workspace_id?: unknown; workspace_name?: unknown }
    return {
      workspaceId: data?.workspace_id ? String(data.workspace_id) : null,
      workspaceName: data?.workspace_name ? String(data.workspace_name) : null,
    }
  }

  /** Find a Person record id by exact email, or null if none exists. */
  async findPersonIdByEmail(accessToken: string, email: string): Promise<string | null> {
    const res = await fetch(`${this.peopleBase}/query`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({
        filter: { email_addresses: { email_address: email } },
        limit: 1,
      }),
    })
    if (!res.ok) throw new Error(`Attio person query failed: ${await readError(res)}`)
    const data = (await res.json()) as { data?: Array<{ id?: { record_id?: unknown } }> }
    const first = data?.data?.[0]?.id?.record_id
    return first ? String(first) : null
  }

  /** Create a Person record. Returns the new record id. */
  async createPerson(accessToken: string, input: AttioContactInput): Promise<{ id: string }> {
    const res = await fetch(this.peopleBase, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ data: { values: toPersonValues(input) } }),
    })
    if (!res.ok) throw new Error(`Attio create person failed: ${await readError(res)}`)
    return { id: recordId(await res.json()) }
  }

  /**
   * Create a Task (besoin export, Théo p39). Attio's task has a single free-text
   * `content`; we compose it from the subject + body. `deadline_at` is sent only
   * when the caller has a REAL date (as an ISO datetime), else null — never a
   * fabricated deadline. `linked_records`/`assignees` are required arrays, left
   * empty (the rep assigns/links in Attio). Returns the new task id.
   */
  async createTask(accessToken: string, input: CrmTaskInput): Promise<{ id: string }> {
    const content = input.body ? `${input.subject}\n\n${input.body}` : input.subject
    const res = await fetch(`${ATTIO_API_URL}/v2/tasks`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({
        data: {
          content,
          format: 'plaintext',
          deadline_at: input.dueDate ? `${input.dueDate}T00:00:00.000Z` : null,
          is_completed: false,
          linked_records: [],
          assignees: [],
        },
      }),
    })
    if (!res.ok) throw new Error(`Attio create task failed: ${await readError(res)}`)
    const data = (await res.json()) as { data?: { id?: { task_id?: unknown } } }
    const id = data?.data?.id?.task_id
    return { id: id ? String(id) : '' }
  }

  /** Find a Company record id by exact name, or null if none exists. */
  async findCompanyIdByName(accessToken: string, name: string): Promise<string | null> {
    const res = await fetch(`${this.companiesBase}/query`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ filter: { name }, limit: 1 }),
    })
    if (!res.ok) throw new Error(`Attio company query failed: ${await readError(res)}`)
    const data = (await res.json()) as { data?: Array<{ id?: { record_id?: unknown } }> }
    const first = data?.data?.[0]?.id?.record_id
    return first ? String(first) : null
  }

  /** Create a Company record by name. Returns the new record id. */
  async createCompany(accessToken: string, name: string): Promise<string> {
    const res = await fetch(this.companiesBase, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ data: { values: { name: [{ value: name }] } } }),
    })
    if (!res.ok) throw new Error(`Attio create company failed: ${await readError(res)}`)
    return recordId(await res.json())
  }

  /** Find-or-create the Company record for `name`, returning its id. */
  async resolveCompanyId(accessToken: string, name: string): Promise<string> {
    const existing = await this.findCompanyIdByName(accessToken, name)
    return existing ?? this.createCompany(accessToken, name)
  }

  /**
   * Create a **Note** from a besoin, attached to the account's Company record
   * (Théo p39 — a besoin's idiomatic Attio landing is a Note on the Company, not
   * a standalone task). An Attio note REQUIRES a parent, so the Company is
   * resolved (find-or-create) by name first; the caller only reaches here when
   * the besoin actually carries a company. `title`/`content` are the factual
   * besoin subject/body. Returns the new note id.
   */
  async createNote(accessToken: string, company: string, input: CrmTaskInput): Promise<{ id: string }> {
    const companyId = await this.resolveCompanyId(accessToken, company)
    const res = await fetch(`${ATTIO_API_URL}/v2/notes`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({
        data: {
          parent_object: 'companies',
          parent_record_id: companyId,
          title: input.subject,
          format: 'plaintext',
          content: input.body,
        },
      }),
    })
    if (!res.ok) throw new Error(`Attio create note failed: ${await readError(res)}`)
    const data = (await res.json()) as { data?: { id?: { note_id?: unknown } } }
    const id = data?.data?.id?.note_id
    return { id: id ? String(id) : '' }
  }

  /** Upsert a Person record keyed by email (PUT ?matching_attribute=email_addresses). */
  async assertPersonByEmail(accessToken: string, input: AttioContactInput): Promise<{ id: string }> {
    const res = await fetch(`${this.peopleBase}?matching_attribute=email_addresses`, {
      method: 'PUT',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ data: { values: toPersonValues(input) } }),
    })
    if (!res.ok) throw new Error(`Attio upsert person failed: ${await readError(res)}`)
    return { id: recordId(await res.json()) }
  }

  /**
   * Export a contact as a Person: an existing record matched by email is updated
   * in place (no duplicate), otherwise a new one is created. Without an email
   * there is nothing to match on, so we always create. `created` tells the caller
   * which happened — same contract as the Salesforce client.
   */
  async upsertPerson(accessToken: string, input: AttioContactInput): Promise<AttioUpsertResult> {
    if (input.email) {
      const existingId = await this.findPersonIdByEmail(accessToken, input.email)
      if (existingId) {
        await this.assertPersonByEmail(accessToken, input)
        return { id: existingId, created: false }
      }
    }
    const created = await this.createPerson(accessToken, input)
    return { id: created.id, created: true }
  }

  // ---- #4189 — lecture commune : POST /v2/objects/{slug}/records/query (limit + offset) ----
  // Une fiche Attio porte `created_at` mais PAS de date de modification, et aucun
  // tri ni filtre sur cette colonne n'est utilisé (non documenté pour une colonne
  // système). `since` écarte donc côté client les fiches créées avant : la synchro
  // incrémentale d'Attio voit les CRÉATIONS, pas les modifications — l'écran le dit.
  // Tâches et notes ne sont pas lues : elles demandent un droit que l'intégration
  // ne demande pas.

  private async readRecords(
    accessToken: string,
    slug: 'people' | 'companies' | 'deals',
    opts: CrmReadOptions,
  ): Promise<{ rows: AttioRecord[]; nextAfter: string | null }> {
    const limit = Math.min(Math.max(Math.trunc(opts.limit), 1), 500)
    const offset = opts.after?.startsWith('o:') ? Math.max(Number(opts.after.slice(2)) || 0, 0) : 0
    const res = await fetch(`${ATTIO_API_URL}/v2/objects/${slug}/records/query`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ limit, offset }),
    })
    if (!res.ok) throw new Error(`Attio read ${slug} failed: ${await readError(res)}`)
    const body = (await res.json()) as { data?: AttioRecord[] }
    const all = body?.data ?? []
    const sinceMs = opts.since ? Date.parse(opts.since) : Number.NaN
    const rows = Number.isNaN(sinceMs)
      ? all
      : all.filter(row => {
          const created = Date.parse(String(row.created_at ?? ''))
          return !Number.isNaN(created) && created > sinceMs
        })
    // Une page PLEINE : il en reste peut-être. Une page courte clôt la lecture.
    return { rows, nextAfter: all.length >= limit ? `o:${offset + all.length}` : null }
  }

  async listContacts(accessToken: string, opts: CrmReadOptions): Promise<CrmContactPage> {
    const { rows, nextAfter } = await this.readRecords(accessToken, 'people', opts)
    return {
      contacts: rows.map(row => {
        const name = attioFirst(row, 'name')
        return {
          id: String(row.id?.record_id ?? ''),
          email: attioText(attioFirst(row, 'email_addresses')?.['email_address']),
          firstName: attioText(name?.['first_name']),
          lastName: attioText(name?.['last_name']),
          // `company` n'est qu'une référence (identifiant) : le nom n'est pas lu.
          company: null,
          jobTitle: attioText(attioFirst(row, 'job_title')?.['value']),
          phone: attioText(attioFirst(row, 'phone_numbers')?.['original_phone_number']),
          modifiedAt: attioDate(row.created_at),
        }
      }),
      nextAfter,
    }
  }

  async listCompanies(accessToken: string, opts: CrmReadOptions): Promise<CrmCompanyPage> {
    const { rows, nextAfter } = await this.readRecords(accessToken, 'companies', opts)
    return {
      companies: rows.map(row => ({
        id: String(row.id?.record_id ?? ''),
        name: attioText(attioFirst(row, 'name')?.['value']),
        domain: attioText(attioFirst(row, 'domains')?.['domain']),
        modifiedAt: attioDate(row.created_at),
      })),
      nextAfter,
    }
  }

  /** L'objet « deals » n'existe que si l'espace l'a activé : s'il manque, c'est une erreur, pas « zéro affaire ». */
  async listDeals(accessToken: string, opts: CrmReadOptions): Promise<CrmDealPage> {
    const { rows, nextAfter } = await this.readRecords(accessToken, 'deals', opts)
    return {
      deals: rows.map(row => {
        const amount = attioFirst(row, 'value')?.['currency_value']
        return {
          id: String(row.id?.record_id ?? ''),
          title: attioText(attioFirst(row, 'name')?.['value']),
          amount: typeof amount === 'number' ? amount : null,
          currency: null,
          stage: attioText((attioFirst(row, 'stage')?.['status'] as { title?: unknown } | undefined)?.title),
          status: null,
          closeDate: null,
          accountId: attioText(attioFirst(row, 'associated_company')?.['target_record_id']),
          accountName: null,
          modifiedAt: attioDate(row.created_at),
        }
      }),
      nextAfter,
    }
  }
}
