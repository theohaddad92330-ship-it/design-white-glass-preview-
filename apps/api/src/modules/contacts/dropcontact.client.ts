import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { ApolloEnrichmentData } from '@bellum/contracts'
import { getPersonContactCache } from './person-contact-cache'

/**
 * Thin Dropcontact REST wrapper (RGPD-safe enrichment — algorithmic, no stored
 * pre-scraped database). No SDK — the batch enrich endpoint plus its polling GET
 * are enough, and staying on `fetch` keeps the dependency surface small (mirrors
 * the HubSpot/Salesforce clients).
 *
 * The API is asynchronous: a POST submits a batch and returns a `request_id`; the
 * result is fetched by polling a GET until it is `success: true`. We poll with a
 * bounded budget (interval × attempts) so a slow/stuck request can never hang the
 * on-demand enrich handler — polling exhaustion is best-effort and yields `null`.
 *
 * Env-gated on `DROPCONTACT_API_KEY`: unset → {@link isEnabled} is false, {@link
 * enrich} returns `null` immediately and issues ZERO network calls. It only ever
 * runs as a fallback after Apollo, never replacing it.
 *
 * Endpoints (verified against developer.dropcontact.com):
 *   POST https://api.dropcontact.com/v1/enrich/all         → { request_id, success }
 *   GET  https://api.dropcontact.com/v1/enrich/all/{id}     → { success, data:[…] }
 * Auth header: `X-Access-Token: <apiKey>`.
 */

const ENRICH_URL = 'https://api.dropcontact.com/v1/enrich/all'

const CACHE_FAMILY = 'dropcontact'

/** Ce que `toEnrichment` rend quand rien n'a été trouvé — resservi tel quel depuis un « rien trouvé » en cache. */
const NO_MATCH: ApolloEnrichmentData = {
  matched: false,
  email: null,
  email_status: null,
  phone: null,
  linkedin_url: null,
  title: null,
  organization_name: null,
  city: null,
  country: null,
}

/** Match keys accepted by Dropcontact. `firstName + organizationName` or a `linkedinUrl`
 *  is required (mirrors the Apollo enrich contract) — otherwise there is nothing to match on. */
type DropcontactEnrichInput = {
  firstName?: string
  lastName?: string
  organizationName?: string
  linkedinUrl?: string
  /** Company domain, when known — sharpens Dropcontact's pro-email resolution. */
  website?: string
  /** CACHE-API (15/10) — l'espace qui demande : le cache d'une coordonnée achetée est PAR ESPACE.
   *  Absent = pas de cache. */
  workspaceId?: string
}

/** Tunables for the bounded poll loop. Defaulted; overridable (tests pass a 0ms interval). */
type DropcontactClientOptions = {
  pollIntervalMs?: number
  maxPollAttempts?: number
  requestTimeoutMs?: number
}

const DEFAULT_OPTIONS: Required<DropcontactClientOptions> = {
  // ~24s worst case (12 × 2s) — enough for a single-contact batch, bounded so a
  // stuck request never hangs the request handler.
  pollIntervalMs: 2_000,
  maxPollAttempts: 12,
  requestTimeoutMs: 15_000,
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** Drop undefined/blank keys so we never POST empty match fields to Dropcontact. */
function pruneBlank(record: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(record)) {
    const trimmed = value?.trim()
    if (trimmed) out[key] = trimmed
  }
  return out
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** A real, deliverable-looking email or nothing — never invent one. */
function asEmail(value: unknown): string | null {
  const s = asString(value)
  return s && s.includes('@') ? s : null
}

/** Normalise a LinkedIn value into an absolute URL, or drop it (schema wants a URL). */
function asUrl(value: unknown): string | null {
  const s = asString(value)
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s
  if (s.includes('.')) return `https://${s}`
  return null
}

/**
 * Dropcontact returns `email` as an array of `{ email, qualification }` (best first).
 * Take the first usable address.
 */
function firstEmail(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      // LOT (15/10) DATA-A point 8 — la `qualification` lue : `generic@…` (contact@, info@) n'est pas LA personne,
      // `…@perso` n'est pas une coordonnée pro (B2B, intérêt légitime). Sans qualification : accepté, comme avant.
      const qualification =
        entry && typeof entry === 'object' ? (entry as { qualification?: unknown }).qualification : undefined
      if (typeof qualification === 'string' && /^generic|@perso$/i.test(qualification.trim())) continue
      const candidate =
        typeof entry === 'string'
          ? entry
          : entry && typeof entry === 'object'
            ? (entry as { email?: unknown }).email
            : null
      const email = asEmail(candidate)
      if (email) return email
    }
    return null
  }
  return asEmail(value)
}

@Injectable()
export class DropcontactClient {
  private readonly logger = new Logger(DropcontactClient.name)
  private readonly apiKey: string
  private readonly pollIntervalMs: number
  private readonly maxPollAttempts: number
  private readonly requestTimeoutMs: number

  constructor(config: ConfigService, options: DropcontactClientOptions = {}) {
    this.apiKey = config.get<string>('dropcontactApiKey')?.trim() ?? ''
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_OPTIONS.pollIntervalMs
    this.maxPollAttempts = options.maxPollAttempts ?? DEFAULT_OPTIONS.maxPollAttempts
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_OPTIONS.requestTimeoutMs
  }

  /** True only when a key is configured. Callers MUST gate on this so the
   *  provider is a strict no-op (zero network) without a key. */
  isEnabled(): boolean {
    return this.apiKey.length > 0
  }

  /**
   * Enrich one contact via Dropcontact (submit batch of 1 + bounded poll).
   * Returns an {@link ApolloEnrichmentData}-shaped record so it plugs straight
   * into the existing enrich flow, or `null` when disabled, on any error, on a
   * timed-out poll, or when Dropcontact matched nothing. Never throws; never
   * invents data — no match ⇒ `null`/`matched:false`, so no credit is charged.
   */
  async enrich(input: DropcontactEnrichInput): Promise<ApolloEnrichmentData | null> {
    if (!this.isEnabled()) return null

    const hasNameKey = Boolean(input.firstName?.trim() && input.organizationName?.trim())
    if (!hasNameKey && !input.linkedinUrl?.trim()) return null

    // CACHE-API (Louis 15/10) — jamais deux fois le même appel payant en 30 jours : la même
    // personne, tous espaces confondus (cache commun), est rendue sans appel (« rien trouvé » : 2 jours). Une
    // panne, un délai de sonde dépassé ne sont JAMAIS écrits.
    const cache = getPersonContactCache()
    const person = {
      firstName: input.firstName,
      lastName: input.lastName,
      organizationName: input.organizationName,
      domain: input.website,
      linkedinUrl: input.linkedinUrl,
    }
    if (cache) {
      const cached = await cache.lookupRecord<ApolloEnrichmentData>(CACHE_FAMILY, person)
      if (cached.settled) {
        this.logger.log('contact:dropcontact cache=hit payé=non')
        return cached.value ?? { ...NO_MATCH }
      }
      this.logger.log('contact:dropcontact cache=miss payé=oui')
    }

    try {
      const requestId = await this.submit(input)
      if (!requestId) return null
      const record = await this.poll(requestId)
      if (!record) return null
      const enrichment = this.toEnrichment(record)
      if (cache) {
        await cache.rememberRecord(CACHE_FAMILY, person, enrichment.matched ? enrichment : null)
      }
      return enrichment
    } catch (error) {
      // Best-effort fallback: a Dropcontact failure must not surface as an enrich
      // error (Apollo already ran). Log via Winston (Sentry picks it up), return null.
      this.logger.warn('Dropcontact enrich failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /** POST the batch (single contact). Returns the `request_id` to poll, or null. */
  private async submit(input: DropcontactEnrichInput): Promise<string | null> {
    const person = pruneBlank({
      first_name: input.firstName,
      last_name: input.lastName,
      company: input.organizationName,
      website: input.website,
      linkedin: input.linkedinUrl,
    })
    const body = { data: [person], siren: false, language: 'fr' }

    const json = await this.fetchJson(ENRICH_URL, { method: 'POST', body: JSON.stringify(body) })
    if (!json) return null
    const requestId = asString(json['request_id'])
    if (!requestId) {
      this.logger.warn('Dropcontact submit returned no request_id', { error: asString(json['reason']) })
    }
    return requestId
  }

  /** Poll the result until ready (`success:true` + `data`), bounded by the budget. */
  private async poll(requestId: string): Promise<Record<string, unknown> | null> {
    const url = `${ENRICH_URL}/${encodeURIComponent(requestId)}`
    for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
      await sleep(this.pollIntervalMs)
      const json = await this.fetchJson(url, { method: 'GET' })
      // Transient error → keep polling within the budget rather than aborting.
      if (!json) continue
      if (json['success'] === true && Array.isArray(json['data'])) {
        const first = json['data'][0]
        return first && typeof first === 'object' ? (first as Record<string, unknown>) : null
      }
      // Otherwise "not ready yet" (`success:false` + a `reason`) — poll again.
    }
    this.logger.warn('Dropcontact polling exhausted before result was ready', {
      tags: { attempts: this.maxPollAttempts },
    })
    return null
  }

  /** Map a Dropcontact result row onto the shared enrichment shape. */
  private toEnrichment(record: Record<string, unknown>): ApolloEnrichmentData {
    const email = firstEmail(record['email'])
    const phone = asString(record['phone'])
    const linkedinUrl = asUrl(record['linkedin'])
    const matched = Boolean(email || phone || linkedinUrl)
    return {
      matched,
      email,
      // Dropcontact validates deliverability but not via the same SMTP signal as
      // Apollo's `verified`; stay conservative so we never over-claim a verify.
      email_status: email ? 'unverified' : null,
      phone,
      linkedin_url: linkedinUrl,
      title: asString(record['job']),
      organization_name: asString(record['company']),
      city: null,
      country: null,
    }
  }

  /** Single fetch with the auth header + a hard timeout; `res.ok` checked (code rule). */
  private async fetchJson(
    url: string,
    init: { method: 'GET' | 'POST'; body?: string },
  ): Promise<Record<string, unknown> | null> {
    let res: Response
    try {
      res = await fetch(url, {
        method: init.method,
        headers: { 'Content-Type': 'application/json', 'X-Access-Token': this.apiKey },
        body: init.body,
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      })
    } catch (error) {
      this.logger.warn('Dropcontact request error', {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
    if (!res.ok) {
      this.logger.warn('Dropcontact non-ok response', { tags: { status: res.status } })
      return null
    }
    try {
      return (await res.json()) as Record<string, unknown>
    } catch {
      return null
    }
  }
}
