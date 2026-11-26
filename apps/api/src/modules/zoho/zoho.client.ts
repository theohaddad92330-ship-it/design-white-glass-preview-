import { BadRequestException } from '@nestjs/common'
import type { CrmDealPage, CrmOwnerPage, CrmReadOptions } from '../crm/adapter/crm-read-types'
import type { CrmCompanyPage, CrmContactPage, HubspotContactInput } from '../crm/hubspot.client'
import type { CrmTaskInput } from '../crm/crm-task'
import { knownZohoAccountsUrl, knownZohoApiDomain, ZOHO_API_VERSION, ZOHO_SCOPES, type ZohoConfig } from './zoho-config'

/**
 * Thin Zoho CRM REST wrapper — no SDK, `fetch` only. Every call checks `res.ok`
 * AND the per-record result: Zoho answers HTTP 200/201/202 with `code != SUCCESS`
 * for a row it refused, and HTTP 200 with `{ error }` on the token endpoint. A
 * refused row is an error, never a silent success.
 *
 * OAuth 2.0 (accounts server of the configured region; docs: zoho.com/crm/developer/docs/api/v6/oauth-overview):
 *   - authorize: GET  {accounts}/oauth/v2/auth   (access_type=offline → refresh token)
 *   - token:     POST {accounts}/oauth/v2/token  (authorization_code | refresh_token)
 *       the response carries `api_domain` (e.g. https://www.zohoapis.eu) — the host of
 *       every REST call; refresh responses carry no new refresh token.
 *   - revoke:    POST {accounts}/oauth/v2/token/revoke?token=<refresh_token>
 * REST v6 (`Authorization: Zoho-oauthtoken <access>`):
 *   /crm/v6/Accounts, /Contacts, /Deals, /Tasks, /users
 *   GET  /{Module}/search?criteria=(Field:equals:value)   (204 when nothing matches)
 *   POST /{Module}/{id}/Notes                              (note on a record)
 *   list: `fields` REQUIRED, page/per_page, `page_token` beyond 2000 records,
 *         `If-Modified-Since` header for incremental reads.
 */

type ZohoTokens = {
  accessToken: string
  refreshToken: string | null
  /** Per-org REST base, e.g. https://www.zohoapis.eu — null when the response omits it (never guessed). */
  apiDomain: string | null
  scope: string | null
  expiresIn: number
}

export type ZohoUpsertResult = { id: string; created: boolean }

type ZohoCurrentUser = { id: string; name: string | null; email: string | null }

type Init = { method?: string; headers?: Record<string, string>; body?: string }
type ZohoRow = Record<string, unknown>
type ZohoLookup = { id?: string; name?: string } | null | undefined

const MAX_PER_PAGE = 200

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string; message?: string; code?: string }
    return body?.error || body?.message || body?.code || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** Normalises a Zoho timestamp (`2026-10-01T10:00:00+02:00`) to UTC ISO; null when absent or unreadable. */
function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

/** Escapes a value placed inside a `(Field:equals:value)` criterion. */
function criterionValue(value: string): string {
  return value.replace(/[\\()]/g, ch => `\\${ch}`)
}

function toTokens(data: Record<string, unknown>): ZohoTokens {
  if (typeof data['error'] === 'string') throw new Error(`Zoho token request failed: ${data['error']}`)
  return {
    accessToken: String(data['access_token'] ?? ''),
    refreshToken: data['refresh_token'] ? String(data['refresh_token']) : null,
    // #4380.2 — liste blanche : un api_domain inconnu devient null (le service refuse alors, jamais deviné).
    apiDomain: knownZohoApiDomain(typeof data['api_domain'] === 'string' ? data['api_domain'] : null),
    scope: data['scope'] ? String(data['scope']) : null,
    expiresIn: Number(data['expires_in'] ?? 0),
  }
}

/** Zoho requires `Last_Name` on a Contact: the surname, else the first name, else the address — never an invented one. */
function contactLastName(input: HubspotContactInput): string {
  const name = input.lastName?.trim() || input.firstName?.trim() || input.email?.trim()
  if (!name) throw new BadRequestException('Ce contact n’a ni nom ni adresse : rien n’a été envoyé.')
  return name
}

function contactFields(input: HubspotContactInput, accountId: string | null, forUpdate: boolean): ZohoRow {
  const fields: ZohoRow = {}
  // On update, never overwrite the stored name with a fallback-composed one.
  if (!forUpdate || input.lastName?.trim() || input.firstName?.trim()) fields['Last_Name'] = contactLastName(input)
  if (input.firstName?.trim() && input.lastName?.trim()) fields['First_Name'] = input.firstName.trim()
  if (input.email) fields['Email'] = input.email
  if (input.phone) fields['Phone'] = input.phone
  if (input.jobTitle) fields['Title'] = input.jobTitle
  if (accountId) fields['Account_Name'] = { id: accountId }
  return fields
}

export class ZohoClient {
  constructor(private readonly config: ZohoConfig) {}

  // ───────────────────────────── OAuth ─────────────────────────────

  authorizeUrl(state: string): string {
    const params = new URLSearchParams({
      scope: ZOHO_SCOPES.join(','),
      client_id: this.config.clientId,
      response_type: 'code',
      access_type: 'offline',
      redirect_uri: this.config.redirectUri,
      prompt: 'consent',
      state,
    })
    return `${this.config.accountsUrl}/oauth/v2/auth?${params.toString()}`
  }

  /** L.6 — le serveur de comptes de LA connexion (retour OAuth) ; sinon le défaut de la config. */
  private accounts(accountsUrl?: string | null): string {
    return knownZohoAccountsUrl(accountsUrl) ?? this.config.accountsUrl
  }

  private async tokenRequest(params: Record<string, string>, accountsUrl?: string | null): Promise<ZohoTokens> {
    const res = await fetch(`${this.accounts(accountsUrl)}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        ...params,
      }).toString(),
    })
    if (!res.ok) throw new Error(`Zoho token request failed: ${await readError(res)}`)
    return toTokens((await res.json()) as Record<string, unknown>)
  }

  /** `accountsUrl` = le `accounts-server` rendu par Zoho au callback : le code se rend là où il a été émis. */
  exchangeCode(code: string, accountsUrl?: string | null): Promise<ZohoTokens> {
    return this.tokenRequest(
      {
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
      },
      accountsUrl,
    )
  }

  /** Zoho issues no new refresh token on refresh: the stored one stays. */
  async refresh(refreshToken: string, accountsUrl?: string | null): Promise<ZohoTokens> {
    const tokens = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken }, accountsUrl)
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken }
  }

  /** Revokes the REFRESH token (it drops the access tokens issued from it). */
  async revoke(refreshToken: string, accountsUrl?: string | null): Promise<void> {
    const res = await fetch(
      `${this.accounts(accountsUrl)}/oauth/v2/token/revoke?${new URLSearchParams({ token: refreshToken }).toString()}`,
      { method: 'POST' },
    )
    if (!res.ok) throw new Error(`Zoho token revocation failed: ${await readError(res)}`)
    const body = (await res.json().catch(() => ({}))) as { status?: string }
    if (body?.status !== 'success') throw new Error('Zoho token revocation failed: not confirmed')
  }

  // ───────────────────────────── REST ─────────────────────────────

  private headers(accessToken: string): Record<string, string> {
    return { Authorization: `Zoho-oauthtoken ${accessToken}`, 'Content-Type': 'application/json' }
  }

  private url(apiDomain: string, path: string): string {
    return `${apiDomain}/crm/${ZOHO_API_VERSION}${path}`
  }

  /** One REST call; 204 → `null` (Zoho's « nothing here »). */
  private async call<T>(accessToken: string, apiDomain: string, path: string, init: Init = {}): Promise<T | null> {
    const res = await fetch(this.url(apiDomain, path), {
      ...init,
      headers: { ...this.headers(accessToken), ...(init.headers ?? {}) },
    })
    if (res.status === 204) return null
    if (!res.ok) throw new Error(`Zoho ${init.method ?? 'GET'} ${path.split('?')[0]} failed: ${await readError(res)}`)
    return (await res.json()) as T
  }

  /** A write answers `{ data: [{ code, details: { id }, message }] }` — only SUCCESS counts. */
  private async write(
    accessToken: string,
    apiDomain: string,
    method: 'POST' | 'PUT',
    path: string,
    row: ZohoRow,
  ): Promise<string> {
    const body = await this.call<{ data?: Array<{ code?: string; message?: string; details?: { id?: string } }> }>(
      accessToken,
      apiDomain,
      path,
      { method, body: JSON.stringify({ data: [row] }) },
    )
    const result = body?.data?.[0]
    if (!result || result.code !== 'SUCCESS' || !result.details?.id) {
      throw new Error(
        `Zoho ${method} ${path} refused: ${result?.code ?? 'no result'}${result?.message ? ` — ${result.message}` : ''}`,
      )
    }
    return String(result.details.id)
  }

  /** The connection test: reads the user the token belongs to. */
  async currentUser(accessToken: string, apiDomain: string): Promise<ZohoCurrentUser> {
    const body = await this.call<{ users?: ZohoRow[] }>(accessToken, apiDomain, '/users?type=CurrentUser')
    const user = body?.users?.[0]
    if (!user?.['id']) throw new Error('Zoho current user not readable')
    return { id: String(user['id']), name: text(user['full_name']), email: text(user['email']) }
  }

  private async searchFirstId(
    accessToken: string,
    apiDomain: string,
    module: 'Contacts' | 'Accounts',
    field: string,
    value: string,
  ): Promise<string | null> {
    const criteria = `(${field}:equals:${criterionValue(value)})`
    const body = await this.call<{ data?: ZohoRow[] }>(
      accessToken,
      apiDomain,
      `/${module}/search?${new URLSearchParams({ criteria }).toString()}`,
    )
    const id = body?.data?.[0]?.['id']
    return id ? String(id) : null
  }

  findAccountIdByName(accessToken: string, apiDomain: string, name: string): Promise<string | null> {
    return this.searchFirstId(accessToken, apiDomain, 'Accounts', 'Account_Name', name)
  }

  findContactIdByEmail(accessToken: string, apiDomain: string, email: string): Promise<string | null> {
    return this.searchFirstId(accessToken, apiDomain, 'Contacts', 'Email', email)
  }

  /** Finds the account by exact name, or creates it — never two. */
  async findOrCreateAccount(
    accessToken: string,
    apiDomain: string,
    input: { name: string; website?: string | null },
  ): Promise<ZohoUpsertResult> {
    const existing = await this.findAccountIdByName(accessToken, apiDomain, input.name)
    if (existing) return { id: existing, created: false }
    const row: ZohoRow = { Account_Name: input.name }
    if (input.website) row['Website'] = input.website
    return { id: await this.write(accessToken, apiDomain, 'POST', '/Accounts', row), created: true }
  }

  /**
   * Upsert keyed by e-mail: a known contact is updated in place, otherwise created.
   * The company is linked best-effort (found or created) — a failure there must not block the contact.
   */
  async upsertContact(accessToken: string, apiDomain: string, input: HubspotContactInput): Promise<ZohoUpsertResult> {
    // Refuse a nameless contact BEFORE any network call.
    contactLastName(input)
    let accountId: string | null = null
    if (input.company?.trim()) {
      try {
        accountId = (await this.findOrCreateAccount(accessToken, apiDomain, { name: input.company.trim() })).id
      } catch {
        accountId = null
      }
    }
    if (input.email) {
      const existing = await this.findContactIdByEmail(accessToken, apiDomain, input.email)
      if (existing) {
        await this.write(
          accessToken,
          apiDomain,
          'PUT',
          `/Contacts/${encodeURIComponent(existing)}`,
          contactFields(input, accountId, true),
        )
        return { id: existing, created: false }
      }
    }
    return {
      id: await this.write(accessToken, apiDomain, 'POST', '/Contacts', contactFields(input, accountId, false)),
      created: true,
    }
  }

  /**
   * A besoin lands as a TASK (Zoho's idiomatic follow-up object), linked to the
   * account when it is found by name — never created for the occasion. The due date
   * is sent only when the caller has a REAL one. The detail also lands as a note on
   * the account, best-effort: a refused note never undoes the task that was created.
   */
  async createTask(accessToken: string, apiDomain: string, input: CrmTaskInput): Promise<{ id: string }> {
    let accountId: string | null = null
    const company = input.company?.trim()
    if (company) {
      try {
        accountId = await this.findAccountIdByName(accessToken, apiDomain, company)
      } catch {
        accountId = null
      }
    }
    const row: ZohoRow = { Subject: input.subject, Description: input.body }
    if (input.dueDate) row['Due_Date'] = input.dueDate
    if (accountId) {
      row['What_Id'] = { id: accountId }
      row['$se_module'] = 'Accounts'
    }
    const id = await this.write(accessToken, apiDomain, 'POST', '/Tasks', row)

    if (accountId && input.body?.trim()) {
      try {
        await this.write(accessToken, apiDomain, 'POST', `/Accounts/${encodeURIComponent(accountId)}/Notes`, {
          Note_Title: input.subject,
          Note_Content: input.body,
        })
      } catch {
        // the task stands; the note is a nice-to-have.
      }
    }
    return { id }
  }

  // ───────────────────────────── lecture ─────────────────────────────

  /** Cursor: `t:<page_token>` when Zoho gives one (beyond 2000 records), else `p:<next page>`. */
  private async list(
    accessToken: string,
    apiDomain: string,
    module: 'Accounts' | 'Contacts' | 'Deals',
    fields: string[],
    opts: CrmReadOptions,
  ): Promise<{ rows: ZohoRow[]; nextAfter: string | null }> {
    const params = new URLSearchParams({
      fields: fields.join(','),
      per_page: String(Math.min(Math.max(Math.trunc(opts.limit), 1), MAX_PER_PAGE)),
      sort_by: 'Modified_Time',
      sort_order: 'asc',
    })
    // Beyond 2000 records Zoho wants `page_token` INSTEAD of `page`.
    if (opts.after?.startsWith('t:')) params.set('page_token', opts.after.slice(2))
    else params.set('page', opts.after?.startsWith('p:') ? opts.after.slice(2) : '1')
    const body = await this.call<{
      data?: ZohoRow[]
      info?: { more_records?: boolean; next_page_token?: string; page?: number }
    }>(
      accessToken,
      apiDomain,
      `/${module}?${params.toString()}`,
      opts.since ? { headers: { 'If-Modified-Since': opts.since } } : {},
    )
    const rows = body?.data ?? []
    const info = body?.info
    let nextAfter: string | null = null
    if (info?.more_records) {
      nextAfter = info.next_page_token ? `t:${info.next_page_token}` : `p:${Number(info.page ?? 1) + 1}`
    }
    return { rows, nextAfter }
  }

  async listAccounts(accessToken: string, apiDomain: string, opts: CrmReadOptions): Promise<CrmCompanyPage> {
    const { rows, nextAfter } = await this.list(
      accessToken,
      apiDomain,
      'Accounts',
      ['Account_Name', 'Website', 'Modified_Time'],
      opts,
    )
    return {
      companies: rows.map(row => ({
        id: String(row['id'] ?? ''),
        name: text(row['Account_Name']),
        domain: text(row['Website']),
        modifiedAt: isoOrNull(row['Modified_Time']),
      })),
      nextAfter,
    }
  }

  async listContacts(accessToken: string, apiDomain: string, opts: CrmReadOptions): Promise<CrmContactPage> {
    const { rows, nextAfter } = await this.list(
      accessToken,
      apiDomain,
      'Contacts',
      ['First_Name', 'Last_Name', 'Email', 'Phone', 'Title', 'Account_Name', 'Modified_Time'],
      opts,
    )
    return {
      contacts: rows.map(row => ({
        id: String(row['id'] ?? ''),
        email: text(row['Email']),
        firstName: text(row['First_Name']),
        lastName: text(row['Last_Name']),
        company: text((row['Account_Name'] as ZohoLookup)?.name),
        jobTitle: text(row['Title']),
        phone: text(row['Phone']),
        modifiedAt: isoOrNull(row['Modified_Time']),
      })),
      nextAfter,
    }
  }

  async listDeals(accessToken: string, apiDomain: string, opts: CrmReadOptions): Promise<CrmDealPage> {
    const { rows, nextAfter } = await this.list(
      accessToken,
      apiDomain,
      'Deals',
      ['Deal_Name', 'Amount', 'Stage', 'Closing_Date', 'Account_Name', 'Modified_Time'],
      opts,
    )
    return {
      deals: rows.map(row => {
        const account = row['Account_Name'] as ZohoLookup
        return {
          id: String(row['id'] ?? ''),
          title: text(row['Deal_Name']),
          amount: typeof row['Amount'] === 'number' ? row['Amount'] : null,
          // The currency is only returned by multi-currency orgs, under a field we do not read: never assumed.
          currency: null,
          stage: text(row['Stage']),
          // Stage names are customisable per org: « won »/« lost » is never deduced from a label.
          status: null,
          closeDate: text(row['Closing_Date']),
          accountId: account?.id ? String(account.id) : null,
          accountName: text(account?.name),
          modifiedAt: isoOrNull(row['Modified_Time']),
        }
      }),
      nextAfter,
    }
  }

  async listOwners(accessToken: string, apiDomain: string, opts: CrmReadOptions): Promise<CrmOwnerPage> {
    const params = new URLSearchParams({
      type: 'ActiveUsers',
      per_page: String(Math.min(Math.max(Math.trunc(opts.limit), 1), MAX_PER_PAGE)),
      page: opts.after?.startsWith('p:') ? opts.after.slice(2) : '1',
    })
    const body = await this.call<{ users?: ZohoRow[]; info?: { more_records?: boolean; page?: number } }>(
      accessToken,
      apiDomain,
      `/users?${params.toString()}`,
    )
    return {
      owners: (body?.users ?? []).map(user => ({
        id: String(user['id'] ?? ''),
        name: text(user['full_name']),
        email: text(user['email']),
      })),
      nextAfter: body?.info?.more_records ? `p:${Number(body.info.page ?? 1) + 1}` : null,
    }
  }
}
