import { latestIso, type CrmPresenceContact, type CrmPresenceDeal } from '../crm/crm-presence'
import type { CrmTaskInput } from '../crm/crm-task'
import type { CrmActivityPage, CrmDealPage, CrmOwnerPage, CrmReadOptions } from '../crm/adapter/crm-read-types'
import type { CrmCompanyPage, CrmContactPage } from '../crm/hubspot.client'
import { SALESFORCE_API_VERSION, type SalesforceConfig } from './salesforce-config'

/**
 * Thin Salesforce REST wrapper. No SDK — the OAuth token endpoint plus one
 * sObject create (Contact) is all the beta needs, and staying on `fetch` keeps
 * the dependency surface small. Every call checks `res.ok` (code rule) and
 * surfaces a clear error rather than an invented fallback.
 *
 * Unlike HubSpot, Salesforce tokens are addressed to a per-org `instance_url`
 * returned at OAuth time; the caller persists it and passes it back for writes.
 */

type SalesforceTokens = {
  accessToken: string
  refreshToken: string | null
  /** Per-org REST base, e.g. https://acme.my.salesforce.com */
  instanceUrl: string | null
  /** Org id, parsed from the `id` identity URL when present. */
  orgId: string | null
  /** seconds until the access token expires (0 when Salesforce omits it). */
  expiresIn: number
}

export type SalesforceContactInput = {
  email?: string
  firstName?: string
  lastName?: string
  company?: string
  jobTitle?: string
  phone?: string
  linkedinUrl?: string
}

/** Result of an upsert: whether Salesforce got a brand new record or an update. */
export type SalesforceUpsertResult = { id: string; created: boolean }

/** Escape a value for safe interpolation inside a single-quoted SOQL literal. */
function escapeSoql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Escape for a SOQL LIKE literal — also neutralise `%`/`_` wildcards so a name
 *  containing them can't widen the match. */
function escapeSoqlLike(value: string): string {
  return escapeSoql(value).replace(/[%_]/g, m => `\\${m}`)
}

/** How many matched contacts/opportunities the presence read-back returns. */
const PRESENCE_LIMIT = 5
/** Broader cap used to COUNT matches with one query (SOQL LIMIT bounds totalSize). */
const PRESENCE_COUNT_LIMIT = 25

/** Map our contact input onto Salesforce Contact fields (no LastName fallback —
 *  callers that create add it; updates must not clobber an existing LastName). */
function toContactFields(input: SalesforceContactInput): Record<string, string> {
  const fields: Record<string, string> = {}
  if (input.email) fields['Email'] = input.email
  if (input.firstName) fields['FirstName'] = input.firstName
  if (input.lastName) fields['LastName'] = input.lastName
  if (input.jobTitle) fields['Title'] = input.jobTitle
  if (input.phone) fields['Phone'] = input.phone
  return fields
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string; error_description?: string; error?: string }
    return body?.message || body?.error_description || body?.error || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

/** K.2 — aucune requête Salesforce n'attend sans fin : un spinner éternel vient d'un appel sans délai. */
const SALESFORCE_TIMEOUT_MS = 30_000

function sfFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(SALESFORCE_TIMEOUT_MS) })
}

/** Une réponse HTTP refusée par Salesforce : le statut voyage, pour que l'appelant puisse rafraîchir sur 401. */
export class SalesforceHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'SalesforceHttpError'
  }
}

async function httpError(what: string, res: Response): Promise<SalesforceHttpError> {
  return new SalesforceHttpError(`Salesforce ${what} failed: ${await readError(res)}`, res.status)
}

function orgIdFromIdentity(id: unknown): string | null {
  // Identity URL shape: https://login.salesforce.com/id/{orgId}/{userId}
  const parts = String(id ?? '').split('/')
  const orgId = parts.length >= 2 ? parts[parts.length - 2] : ''
  return orgId || null
}

function toTokens(data: Record<string, unknown>): SalesforceTokens {
  return {
    accessToken: String(data['access_token'] ?? ''),
    refreshToken: data['refresh_token'] ? String(data['refresh_token']) : null,
    instanceUrl: data['instance_url'] ? String(data['instance_url']) : null,
    orgId: orgIdFromIdentity(data['id']),
    expiresIn: Number(data['expires_in'] ?? 0),
  }
}

const sfText = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value.trim() : null)

/** Salesforce date-time (`2026-10-01T10:00:00.000+0000`) → UTC ISO ; null si absente ou illisible. */
/** #4065.8 — le nom du contact principal d'une affaire (sous-requête `OpportunityContactRoles`), ou `null`. */
function sfPrimaryContactName(roles: unknown): string | null {
  const first = (roles as { records?: Array<{ Contact?: { Name?: unknown } | null }> } | null)?.records?.[0]
  return sfText(first?.Contact?.Name)
}

function sfDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

export class SalesforceClient {
  constructor(private readonly config: SalesforceConfig) {}

  private get tokenUrl(): string {
    return `${this.config.loginUrl}/services/oauth2/token`
  }

  /** Exchange an authorization `code` for tokens (grant_type=authorization_code). */
  /** `codeVerifier` accompagne le code quand l'application connectée impose
   *  PKCE — ce que Salesforce fait désormais sans laisser le décocher. Il est
   *  optionnel ici pour qu'une application plus ancienne, sans PKCE, continue
   *  de fonctionner à l'identique. */
  async exchangeCode(code: string, codeVerifier?: string): Promise<SalesforceTokens> {
    const res = await sfFetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        code,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
    })
    if (!res.ok) throw new Error(`Salesforce token exchange failed: ${await readError(res)}`)
    return toTokens((await res.json()) as Record<string, unknown>)
  }

  /** Refresh an expired access token (grant_type=refresh_token). */
  async refresh(refreshToken: string): Promise<SalesforceTokens> {
    const res = await sfFetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) throw new Error(`Salesforce token refresh failed: ${await readError(res)}`)
    const tokens = toTokens((await res.json()) as Record<string, unknown>)
    // A refresh response omits refresh_token — keep the existing one.
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken }
  }

  /**
   * Révoque le jeton chez Salesforce (`{loginUrl}/services/oauth2/revoke`).
   *
   * Endpoint documenté et stable (developer.salesforce.com/blogs/…/revoking-
   * oauth-2-0-access-tokens-and-refresh-tokens), même famille que
   * `/services/oauth2/token` déjà utilisée par `exchangeCode`/`refresh`
   * ci-dessus. Envoyer le jeton de RAFRAÎCHISSEMENT révoque toute la
   * concession, jetons d'accès compris, et retire l'application connectée des
   * « Applications connectées » autorisées de l'utilisateur. Sans cet appel,
   * effacer notre ligne en base ne retirait rigoureusement rien côté
   * Salesforce.
   */
  async revoke(token: string): Promise<void> {
    const res = await sfFetch(`${this.config.loginUrl}/services/oauth2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    })
    // 200 = révoqué. 400 = déjà invalide (jeton inconnu/expiré), donc le
    // résultat voulu est acquis — même convention que le client Google.
    if (!res.ok && res.status !== 400) throw new Error(`Salesforce token revocation failed: ${await readError(res)}`)
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }

  /** Defense-in-depth: `instance_url` comes from the OAuth token response. Reject
   *  anything that isn't https on a Salesforce-owned host before it's ever used to
   *  build a fetch target, so a spoofed/misconfigured token can't redirect writes. */
  private assertValidInstanceUrl(instanceUrl: string): void {
    let url: URL
    try {
      url = new URL(instanceUrl)
    } catch {
      throw new Error('Salesforce instance_url invalide.')
    }
    const host = url.hostname.toLowerCase()
    const ok = url.protocol === 'https:' && (host.endsWith('.salesforce.com') || host.endsWith('.force.com'))
    if (!ok) throw new Error('Salesforce instance_url non autorisé (hôte inattendu).')
  }

  private sobjectsBase(instanceUrl: string): string {
    this.assertValidInstanceUrl(instanceUrl)
    return `${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/Contact`
  }

  /**
   * Create a Contact in the org. Returns the new record id. Salesforce requires
   * a LastName on Contact — we fall back to the company name (or "Contact") so a
   * partial lead still lands rather than 400ing.
   */
  async createContact(
    accessToken: string,
    instanceUrl: string,
    input: SalesforceContactInput,
  ): Promise<{ id: string }> {
    const fields = toContactFields(input)
    if (!fields['LastName']) fields['LastName'] = input.company || 'Contact'

    const res = await sfFetch(this.sobjectsBase(instanceUrl), {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(fields),
    })
    if (!res.ok) throw await httpError('create contact', res)
    const data = (await res.json()) as { id?: string }
    return { id: String(data?.id ?? '') }
  }

  /** Patch an existing Contact in place (Salesforce returns 204, no body). */
  async updateContact(
    accessToken: string,
    instanceUrl: string,
    id: string,
    input: SalesforceContactInput,
  ): Promise<{ id: string }> {
    const res = await sfFetch(`${this.sobjectsBase(instanceUrl)}/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(toContactFields(input)),
    })
    if (!res.ok) throw await httpError('update contact', res)
    return { id }
  }

  /** Find a Contact id by exact email (SOQL), or null if none exists. */
  async findContactIdByEmail(accessToken: string, instanceUrl: string, email: string): Promise<string | null> {
    this.assertValidInstanceUrl(instanceUrl)
    const soql = `SELECT Id FROM Contact WHERE Email = '${escapeSoql(email)}' LIMIT 1`
    const url = `${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/query?q=${encodeURIComponent(soql)}`
    const res = await sfFetch(url, { method: 'GET', headers: this.authHeaders(accessToken) })
    if (!res.ok) throw await httpError('contact query', res)
    const data = (await res.json()) as { records?: Array<{ Id?: string }> }
    const first = data?.records?.[0]
    return first?.Id ? String(first.Id) : null
  }

  /**
   * Upsert a Contact keyed by email: an existing record is updated in place (no
   * duplicate), otherwise a new one is created. Without an email there is nothing
   * to match on, so we always create.
   */
  async upsertContact(
    accessToken: string,
    instanceUrl: string,
    input: SalesforceContactInput,
  ): Promise<SalesforceUpsertResult> {
    if (input.email) {
      const existingId = await this.findContactIdByEmail(accessToken, instanceUrl, input.email)
      if (existingId) {
        await this.updateContact(accessToken, instanceUrl, existingId, input)
        return { id: existingId, created: false }
      }
    }
    const created = await this.createContact(accessToken, instanceUrl, input)
    return { id: created.id, created: true }
  }

  /**
   * #4188 — retrouve une société (Account) par son NOM exact, ou crée-la.
   * Jamais deux : un second envoi retrouve celle du premier. `Website` n'est
   * envoyé que s'il est CONNU. REST standard : SOQL `query` +
   * `POST /sobjects/Account` (le même gabarit que Contact ci-dessus).
   */
  async upsertAccount(
    accessToken: string,
    instanceUrl: string,
    input: { name: string; website?: string | null },
  ): Promise<SalesforceUpsertResult> {
    this.assertValidInstanceUrl(instanceUrl)
    const soql = `SELECT Id FROM Account WHERE Name = '${escapeSoql(input.name)}' LIMIT 1`
    const queryUrl = `${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/query?q=${encodeURIComponent(soql)}`
    const found = await sfFetch(queryUrl, { method: 'GET', headers: this.authHeaders(accessToken) })
    if (!found.ok) throw await httpError('account query', found)
    const existing = ((await found.json()) as { records?: Array<{ Id?: string }> })?.records?.[0]?.Id
    if (existing) return { id: String(existing), created: false }

    const res = await sfFetch(`${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/Account`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ Name: input.name, ...(input.website ? { Website: input.website } : {}) }),
    })
    if (!res.ok) throw await httpError('create account', res)
    const data = (await res.json()) as { id?: string }
    return { id: String(data?.id ?? ''), created: true }
  }

  /**
   * Create a Task (besoin export, Théo p39). Salesforce's Task requires only
   * `Subject`; `ActivityDate` is sent only when the caller has a REAL due date
   * (never a fabricated one). `Status: 'Not Started'` is Salesforce's own default
   * task status, not invented pipeline data. Returns the new Task id.
   */
  async createTask(accessToken: string, instanceUrl: string, input: CrmTaskInput): Promise<{ id: string }> {
    this.assertValidInstanceUrl(instanceUrl)
    const fields: Record<string, unknown> = {
      Subject: input.subject,
      Description: input.body,
      Status: 'Not Started',
    }
    if (input.dueDate) fields['ActivityDate'] = input.dueDate
    const res = await sfFetch(`${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/sobjects/Task`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(fields),
    })
    if (!res.ok) throw await httpError('create task', res)
    const data = (await res.json()) as { id?: string }
    return { id: String(data?.id ?? '') }
  }

  // ---- Presence read-back (roadmap §8/§9 — « déjà en relation ? ») ----------
  // GET {instance_url}/services/data/vXX.X/query?q={SOQL} — same real endpoint
  // the email upsert already uses (developer.salesforce.com REST API, "Execute
  // a SOQL Query"). Reads ride on the `api` OAuth scope; row visibility is the
  // connected user's own sharing model.

  /** Run a SOQL query, returning the raw records. */
  private async query(accessToken: string, instanceUrl: string, soql: string): Promise<Array<Record<string, unknown>>> {
    this.assertValidInstanceUrl(instanceUrl)
    const url = `${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/query?q=${encodeURIComponent(soql)}`
    const res = await sfFetch(url, { method: 'GET', headers: this.authHeaders(accessToken) })
    if (!res.ok) throw await httpError('query', res)
    const data = (await res.json()) as { records?: Array<Record<string, unknown>> }
    return data?.records ?? []
  }

  /** Build the account-match WHERE clause from what we know (name and/or domain).
   *  Empty string when we have nothing to match on. */
  private accountWhere(q: { name?: string; domain?: string }, emailField: boolean): string {
    const parts: string[] = []
    if (q.name) parts.push(`Account.Name LIKE '%${escapeSoqlLike(q.name)}%'`)
    if (q.domain) {
      parts.push(
        emailField
          ? `Email LIKE '%@${escapeSoqlLike(q.domain)}'`
          : `Account.Website LIKE '%${escapeSoqlLike(q.domain)}%'`,
      )
    }
    return parts.length ? `(${parts.join(' OR ')})` : ''
  }

  /** Contacts already in the org at the target account (matched by Account.Name
   *  and/or email domain). Count is bounded at PRESENCE_COUNT_LIMIT. */
  async queryContactsAtAccount(
    accessToken: string,
    instanceUrl: string,
    q: { name?: string; domain?: string },
  ): Promise<{ total: number; contacts: CrmPresenceContact[]; lastActivityAt: string | null }> {
    const where = this.accountWhere(q, true)
    if (!where) return { total: 0, contacts: [], lastActivityAt: null }
    const soql =
      `SELECT Id, Name, Email, Title, LastActivityDate FROM Contact WHERE ${where} ` +
      `ORDER BY LastActivityDate DESC NULLS LAST LIMIT ${PRESENCE_COUNT_LIMIT}`
    const records = await this.query(accessToken, instanceUrl, soql)
    const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
    const contacts: CrmPresenceContact[] = records.slice(0, PRESENCE_LIMIT).map(r => ({
      id: str(r['Id']) ?? '',
      name: str(r['Name']),
      email: str(r['Email']),
      jobTitle: str(r['Title']),
    }))
    return { total: records.length, contacts, lastActivityAt: latestIso(records.map(r => str(r['LastActivityDate']))) }
  }

  /** OPEN opportunities at the target account (`IsClosed = false`). */
  async queryOpenOpportunities(
    accessToken: string,
    instanceUrl: string,
    q: { name?: string; domain?: string },
  ): Promise<{ deals: CrmPresenceDeal[]; lastActivityAt: string | null }> {
    const where = this.accountWhere(q, false)
    if (!where) return { deals: [], lastActivityAt: null }
    const soql =
      `SELECT Id, Name, StageName, Amount, LastActivityDate FROM Opportunity ` +
      `WHERE IsClosed = false AND ${where} ORDER BY LastActivityDate DESC NULLS LAST LIMIT ${PRESENCE_LIMIT}`
    const records = await this.query(accessToken, instanceUrl, soql)
    const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v))
    const deals: CrmPresenceDeal[] = records.map(r => {
      const amount = r['Amount'] != null && r['Amount'] !== '' ? Number(r['Amount']) : null
      return {
        id: str(r['Id']) ?? '',
        name: str(r['Name']),
        stage: str(r['StageName']),
        amount: amount != null && Number.isFinite(amount) ? amount : null,
      }
    })
    return { deals, lastActivityAt: latestIso(records.map(r => str(r['LastActivityDate']))) }
  }

  // ---- #4189 — lecture commune : comptes, contacts, affaires, activités ----------
  // SOQL sur les objets STANDARD (Account, Contact, Opportunity, Task) et leurs
  // champs standard : rien d'autre n'est demandé, une requête qui nommerait un
  // champ absent de l'org ferait échouer la lecture ENTIÈRE. Trié par
  // LastModifiedDate croissant ; la pagination suit `nextRecordsUrl` (chemin
  // relatif rendu par Salesforce, vérifié avant d'être suivi).

  /** `since` (ISO) → littéral SOQL `YYYY-MM-DDThh:mm:ssZ`. Refuse tout ce qui n'est pas une date. */
  private soqlSince(since: string | undefined): string {
    if (!since) return ''
    const ms = Date.parse(since)
    if (Number.isNaN(ms)) throw new Error('Salesforce read: « depuis » n’est pas une date valide.')
    return `WHERE LastModifiedDate >= ${new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')} `
  }

  private async readPage(
    accessToken: string,
    instanceUrl: string,
    soqlFor: (object: string) => string,
    opts: CrmReadOptions,
  ): Promise<{ records: Array<Record<string, unknown>>; nextAfter: string | null }> {
    this.assertValidInstanceUrl(instanceUrl)
    let url: string
    if (opts.after) {
      if (!/^\/services\/data\/v[\d.]+\/query\/[A-Za-z0-9-]+$/.test(opts.after)) {
        throw new Error('Salesforce read: curseur invalide.')
      }
      url = `${instanceUrl}${opts.after}`
    } else {
      url = `${instanceUrl}/services/data/${SALESFORCE_API_VERSION}/query?q=${encodeURIComponent(soqlFor(''))}`
    }
    const batch = Math.min(Math.max(Math.trunc(opts.limit), 200), 2000)
    const res = await sfFetch(url, {
      method: 'GET',
      headers: { ...this.authHeaders(accessToken), 'Sforce-Query-Options': `batchSize=${batch}` },
    })
    if (!res.ok) throw await httpError('read', res)
    const data = (await res.json()) as {
      records?: Array<Record<string, unknown>>
      done?: boolean
      nextRecordsUrl?: string
    }
    return {
      records: data?.records ?? [],
      nextAfter: data?.done === false && data.nextRecordsUrl ? String(data.nextRecordsUrl) : null,
    }
  }

  async listCompanies(accessToken: string, instanceUrl: string, opts: CrmReadOptions): Promise<CrmCompanyPage> {
    const where = this.soqlSince(opts.since)
    const { records, nextAfter } = await this.readPage(
      accessToken,
      instanceUrl,
      () => `SELECT Id, Name, Website, LastModifiedDate FROM Account ${where}ORDER BY LastModifiedDate ASC`,
      opts,
    )
    return {
      companies: records.map(r => ({
        id: sfText(r['Id']) ?? '',
        name: sfText(r['Name']),
        domain: sfText(r['Website']),
        modifiedAt: sfDate(r['LastModifiedDate']),
      })),
      nextAfter,
    }
  }

  async listContacts(accessToken: string, instanceUrl: string, opts: CrmReadOptions): Promise<CrmContactPage> {
    const where = this.soqlSince(opts.since)
    const { records, nextAfter } = await this.readPage(
      accessToken,
      instanceUrl,
      () =>
        `SELECT Id, FirstName, LastName, Email, Title, Phone, Account.Name, LastModifiedDate FROM Contact ${where}ORDER BY LastModifiedDate ASC`,
      opts,
    )
    return {
      contacts: records.map(r => ({
        id: sfText(r['Id']) ?? '',
        email: sfText(r['Email']),
        firstName: sfText(r['FirstName']),
        lastName: sfText(r['LastName']),
        company: sfText((r['Account'] as { Name?: unknown } | null)?.Name),
        jobTitle: sfText(r['Title']),
        phone: sfText(r['Phone']),
        modifiedAt: sfDate(r['LastModifiedDate']),
      })),
      nextAfter,
    }
  }

  async listDeals(accessToken: string, instanceUrl: string, opts: CrmReadOptions): Promise<CrmDealPage> {
    const where = this.soqlSince(opts.since)
    const { records, nextAfter } = await this.readPage(
      accessToken,
      instanceUrl,
      () =>
        `SELECT Id, Name, Amount, StageName, CloseDate, IsClosed, IsWon, AccountId, Account.Name, OwnerId, CreatedDate, LastModifiedDate, (SELECT Contact.Name FROM OpportunityContactRoles WHERE IsPrimary = true LIMIT 1) FROM Opportunity ${where}ORDER BY LastModifiedDate ASC`,
      opts,
    )
    return {
      deals: records.map(r => {
        const amount = r['Amount'] != null && r['Amount'] !== '' ? Number(r['Amount']) : null
        return {
          id: sfText(r['Id']) ?? '',
          title: sfText(r['Name']),
          amount: amount !== null && Number.isFinite(amount) ? amount : null,
          // La devise n'est rendue que par une org multi-devises, sous un champ qu'on ne lit pas : jamais supposée.
          currency: null,
          stage: sfText(r['StageName']),
          status:
            r['IsClosed'] === true ? (r['IsWon'] === true ? 'won' : 'lost') : r['IsClosed'] === false ? 'open' : null,
          closeDate: sfText(r['CloseDate']),
          // #3918.7 — `CloseDate` d'une affaire FERMÉE est sa clôture réelle ; ouverte, c'est une échéance prévue.
          closedAt: r['IsClosed'] === true ? sfText(r['CloseDate']) : null,
          createdAt: sfDate(r['CreatedDate']),
          accountId: sfText(r['AccountId']),
          accountName: sfText((r['Account'] as { Name?: unknown } | null)?.Name),
          contactName: sfPrimaryContactName(r['OpportunityContactRoles']),
          modifiedAt: sfDate(r['LastModifiedDate']),
          // SYNC-A — le propriétaire et le lien vers la fiche (le miroir).
          ownerId: sfText(r['OwnerId']),
          url: sfRecordUrl(instanceUrl, 'Opportunity', r['Id']),
        }
      }),
      nextAfter,
    }
  }

  /**
   * Les tâches (objet `Task`), puis — SYNC-A — les rendez-vous (`Event`) : une fois les tâches lues
   * jusqu'au bout, le curseur `event:` ouvre les rendez-vous (`event:<nextRecordsUrl>` ensuite). Le type
   * d'une tâche n'est pas lu (champ non garanti) ; un rendez-vous est un `Event`, ce que Salesforce dit.
   * Jamais `Description` (le corps : doctrine c96).
   */
  async listActivities(accessToken: string, instanceUrl: string, opts: CrmReadOptions): Promise<CrmActivityPage> {
    const where = this.soqlSince(opts.since)
    const links = (r: Record<string, unknown>) => ({
      ownerId: sfText(r['OwnerId']),
      accountId: sfText(r['AccountId']),
      contactId: sfIdOf(r['WhoId'], SF_CONTACT_PREFIX),
      dealId: sfIdOf(r['WhatId'], SF_OPPORTUNITY_PREFIX),
    })
    if (opts.after?.startsWith(EVENT_CURSOR)) {
      const rest = opts.after.slice(EVENT_CURSOR.length)
      const { after: _tasksDone, ...fromStart } = opts
      const { records, nextAfter } = await this.readPage(
        accessToken,
        instanceUrl,
        () =>
          `SELECT Id, Subject, StartDateTime, OwnerId, AccountId, WhoId, WhatId, LastModifiedDate FROM Event ${where}ORDER BY LastModifiedDate ASC`,
        rest ? { ...fromStart, after: rest } : fromStart,
      )
      return {
        activities: records.map(r => ({
          id: sfText(r['Id']) ?? '',
          subject: sfText(r['Subject']),
          kind: 'Event',
          dueAt: sfDate(r['StartDateTime']),
          done: null,
          modifiedAt: sfDate(r['LastModifiedDate']),
          ...links(r),
          url: sfRecordUrl(instanceUrl, 'Event', r['Id']),
        })),
        nextAfter: nextAfter ? `${EVENT_CURSOR}${nextAfter}` : null,
      }
    }
    const { records, nextAfter } = await this.readPage(
      accessToken,
      instanceUrl,
      () =>
        `SELECT Id, Subject, ActivityDate, IsClosed, OwnerId, AccountId, WhoId, WhatId, LastModifiedDate FROM Task ${where}ORDER BY LastModifiedDate ASC`,
      opts,
    )
    return {
      activities: records.map(r => ({
        id: sfText(r['Id']) ?? '',
        subject: sfText(r['Subject']),
        kind: null,
        dueAt: sfText(r['ActivityDate']),
        done: typeof r['IsClosed'] === 'boolean' ? r['IsClosed'] : null,
        modifiedAt: sfDate(r['LastModifiedDate']),
        ...links(r),
        url: sfRecordUrl(instanceUrl, 'Task', r['Id']),
      })),
      nextAfter: nextAfter ?? EVENT_CURSOR,
    }
  }

  /** SYNC-A — les propriétaires de fiches : les utilisateurs (`User`). */
  async listOwners(accessToken: string, instanceUrl: string, opts: CrmReadOptions): Promise<CrmOwnerPage> {
    const { records, nextAfter } = await this.readPage(
      accessToken,
      instanceUrl,
      () => `SELECT Id, Name, Email, LastModifiedDate FROM User ORDER BY LastModifiedDate ASC`,
      opts,
    )
    return {
      owners: records.flatMap(r => {
        const id = sfText(r['Id'])
        return id ? [{ id, name: sfText(r['Name']), email: sfText(r['Email']) }] : []
      }),
      nextAfter,
    }
  }
}

/** SYNC-A — le curseur qui fait passer la lecture des activités des tâches aux rendez-vous. */
const EVENT_CURSOR = 'event:'
/** Les préfixes d'identifiant Salesforce : `003` = Contact, `006` = Opportunity (un `00Q` est un prospect). */
const SF_CONTACT_PREFIX = '003'
const SF_OPPORTUNITY_PREFIX = '006'

function sfIdOf(value: unknown, prefix: string): string | null {
  const id = sfText(value)
  return id?.startsWith(prefix) ? id : null
}

function sfRecordUrl(instanceUrl: string, object: string, id: unknown): string | null {
  const text = sfText(id)
  return text ? `${instanceUrl}/lightning/r/${object}/${encodeURIComponent(text)}/view` : null
}
