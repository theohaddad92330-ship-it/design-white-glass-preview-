import { Logger } from '@nestjs/common'
import type { MicrosoftConfig } from './microsoft-config'

/**
 * Thin Microsoft Graph + Azure AD v2.0 REST wrapper. No SDK — the OAuth token
 * endpoint plus two Graph writes (sendMail, create event) and a `/me` lookup are
 * all this integration needs, and staying on `fetch` keeps the dependency
 * surface small. Every call checks `res.ok` (code rule) and surfaces a clear
 * error rather than an invented fallback.
 *
 * Endpoints (verified against Microsoft Learn, 2026):
 *   Authorize  GET  https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize
 *   Token      POST https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token
 *   Profile    GET  https://graph.microsoft.com/v1.0/me
 *   Send mail  POST https://graph.microsoft.com/v1.0/me/sendMail   → 202 Accepted
 *   New event  POST https://graph.microsoft.com/v1.0/me/events     → 201 Created
 *              POST https://graph.microsoft.com/v1.0/me/calendars/{id}/events (#2101.27, calendrier cible)
 */

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
/** #4179.1 — borne d'un envoi Graph (pièces jointes comprises) avant de le lire « incertain ». */
const SEND_MAIL_TIMEOUT_MS = 45_000

type MicrosoftTokens = {
  accessToken: string
  refreshToken: string | null
  /** seconds until the access token expires (0 when Microsoft omits it). */
  expiresIn: number
  /** Space-separated scopes granted (as returned), or null. */
  scope: string | null
}

type MicrosoftProfile = {
  id: string | null
  displayName: string | null
  userPrincipalName: string | null
  mail: string | null
}

export type SendMailInput = {
  to: string
  subject: string
  body: string
  bodyType?: 'Text' | 'HTML'
  /** Default true (Graph default) — the message lands in Sent Items. */
  saveToSentItems?: boolean
  /**
   * #3699.6 — pièces jointes RÉELLES (`fileAttachment`, octets en base64).
   * La borne de taille unique (`EMAIL_ATTACHMENT_MAX_TOTAL_BYTES`) tient sous
   * la limite d'une requête `sendMail` en un appel.
   */
  attachments?: readonly { fileName: string; contentType: string; contentBase64: string }[]
}

export type CalendarEventInput = {
  subject: string
  body?: string
  bodyType?: 'Text' | 'HTML'
  /** ISO datetime, e.g. "2026-07-20T14:00:00Z". */
  start: string
  end: string
  /** IANA/Windows time zone name for start/end; defaults to UTC. */
  timeZone?: string
  /**
   * #2101.27 — le calendrier CIBLE, chez `listCalendars`. Absent, Graph crée
   * sur le calendrier par défaut (`/me/events`) — comportement inchangé.
   */
  calendarId?: string
  location?: string
  attendees?: Array<{ email: string; name?: string }>
}

export type CalendarEventResult = { id: string; webLink: string | null }

const logger = new Logger('MicrosoftClient')

async function readError(res: Response): Promise<string> {
  try {
    // Azure AD errors: { error, error_description }. Graph errors: { error: { code, message } }.
    const body = (await res.json()) as {
      error?: string | { message?: string }
      error_description?: string
      message?: string
    }
    if (body?.error && typeof body.error === 'object' && body.error.message) return body.error.message
    if (typeof body?.error === 'string') return body.error_description || body.error
    return body?.message || body?.error_description || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

function toTokens(data: Record<string, unknown>): MicrosoftTokens {
  return {
    accessToken: String(data['access_token'] ?? ''),
    refreshToken: data['refresh_token'] ? String(data['refresh_token']) : null,
    expiresIn: Number(data['expires_in'] ?? 0),
    scope: data['scope'] ? String(data['scope']) : null,
  }
}

/** #4065.7 — pages lues au plus pour UNE fenêtre d'agenda. */
const CALENDAR_VIEW_MAX_PAGES = 10

export class MicrosoftClient {
  constructor(private readonly config: MicrosoftConfig) {}

  private get tokenUrl(): string {
    return `https://login.microsoftonline.com/${this.config.tenant}/oauth2/v2.0/token`
  }

  /** Exchange an authorization `code` for tokens (grant_type=authorization_code). */
  async exchangeCode(code: string): Promise<MicrosoftTokens> {
    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        scope: this.config.scopes,
        code,
      }),
    })
    if (!res.ok) throw new Error(`Microsoft token exchange failed: ${await readError(res)}`)
    return toTokens((await res.json()) as Record<string, unknown>)
  }

  /** Refresh an expired access token (grant_type=refresh_token). */
  async refresh(refreshToken: string): Promise<MicrosoftTokens> {
    const res = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        scope: this.config.scopes,
        refresh_token: refreshToken,
      }),
    })
    if (!res.ok) throw new Error(`Microsoft token refresh failed: ${await readError(res)}`)
    const tokens = toTokens((await res.json()) as Record<string, unknown>)
    // Microsoft rotates refresh tokens but a response may omit one — keep the existing.
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken }
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }

  /** The signed-in user's profile — used to label the connection (mailbox). */
  async me(accessToken: string): Promise<MicrosoftProfile> {
    const res = await fetch(`${GRAPH_BASE}/me`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) {
      logger.warn(`Microsoft /me failed: ${await readError(res)}`)
      return { id: null, displayName: null, userPrincipalName: null, mail: null }
    }
    const data = (await res.json()) as Record<string, unknown>
    return {
      id: data['id'] != null ? String(data['id']) : null,
      displayName: data['displayName'] ? String(data['displayName']) : null,
      userPrincipalName: data['userPrincipalName'] ? String(data['userPrincipalName']) : null,
      mail: data['mail'] ? String(data['mail']) : null,
    }
  }

  /**
   * Send a single email via Graph `POST /me/sendMail` (saved to Sent Items by
   * default). ONE recipient per call — the caller enforces this guardrail.
   * Graph replies `202 Accepted` with no body, so this resolves void on success.
   */
  async sendMail(accessToken: string, input: SendMailInput): Promise<void> {
    const res = await fetch(`${GRAPH_BASE}/me/sendMail`, {
      method: 'POST',
      // #4179.1 — un envoi sans délai peut pendre indéfiniment et laisser la
      // tentative « en cours ». Le délai LÈVE un `TimeoutError`, que l'appelant
      // lit `uncertain` (`classifyTransportFailure`) : le message est peut-être
      // parti, on ne le rejoue pas.
      signal: AbortSignal.timeout(SEND_MAIL_TIMEOUT_MS),
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType: input.bodyType ?? 'Text', content: input.body },
          toRecipients: [{ emailAddress: { address: input.to } }],
          ...(input.attachments?.length
            ? {
                attachments: input.attachments.map(attachment => ({
                  '@odata.type': '#microsoft.graph.fileAttachment',
                  name: attachment.fileName,
                  contentType: attachment.contentType,
                  contentBytes: attachment.contentBase64,
                })),
              }
            : {}),
        },
        saveToSentItems: input.saveToSentItems ?? true,
      }),
    })
    if (!res.ok) throw new Error(`Microsoft sendMail failed: ${await readError(res)}`)
  }

  /**
   * Create a calendar event via Graph `POST /me/events`. Returns the new event id
   * (+ webLink when present). Graph replies `201 Created` with the event object.
   */
  async createEvent(accessToken: string, input: CalendarEventInput): Promise<CalendarEventResult> {
    const timeZone = input.timeZone ?? 'UTC'
    const payload: Record<string, unknown> = {
      subject: input.subject,
      start: { dateTime: input.start, timeZone },
      end: { dateTime: input.end, timeZone },
    }
    if (input.body) payload['body'] = { contentType: input.bodyType ?? 'HTML', content: input.body }
    if (input.location) payload['location'] = { displayName: input.location }
    if (input.attendees && input.attendees.length > 0) {
      payload['attendees'] = input.attendees.map(a => ({
        emailAddress: { address: a.email, ...(a.name ? { name: a.name } : {}) },
        type: 'required',
      }))
    }
    // #2101.27 — même patron que `listCalendarView` : un calendrier ciblé
    // explicitement, sinon l'endpoint par défaut du compte, inchangé.
    const url = input.calendarId
      ? `${GRAPH_BASE}/me/calendars/${encodeURIComponent(input.calendarId)}/events`
      : `${GRAPH_BASE}/me/events`
    const res = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Microsoft create event failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string; webLink?: string }
    return { id: String(data?.id ?? ''), webLink: data?.webLink ? String(data.webLink) : null }
  }

  /**
   * Move an existing event — Graph `PATCH /me/events/{id}`, start and end only.
   *
   * ONLY the schedule is sent. A PATCH that also carried the subject, the body
   * or the attendee list would silently overwrite whatever the organiser
   * changed elsewhere since we read the event — the classic lost update, on
   * data other people can see.
   *
   * Graph notifies the attendees of any organiser-side change and offers no way
   * to suppress it. The caller is told so through the backend's
   * `guestsNotified: true`, which is the truth rather than the request.
   */
  async updateEventSchedule(
    accessToken: string,
    eventId: string,
    input: { start: string; end: string; timeZone?: string },
  ): Promise<{ id: string; startsAt: string; endsAt: string }> {
    const timeZone = input.timeZone ?? 'UTC'
    const res = await fetch(`${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({
        start: { dateTime: input.start, timeZone },
        end: { dateTime: input.end, timeZone },
      }),
    })
    if (!res.ok) throw new Error(`Microsoft update event failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }
    return {
      id: String(data?.id ?? eventId),
      // On rend ce que le FOURNISSEUR a enregistré, pas ce qu'on a demandé : un
      // agenda qui arrondit ou décale garderait sinon l'écran en désaccord avec
      // lui-même jusqu'au prochain rechargement.
      startsAt: data?.start?.dateTime ? String(data.start.dateTime) : input.start,
      endsAt: data?.end?.dateTime ? String(data.end.dateTime) : input.end,
    }
  }

  /**
   * Delete an existing event — Graph `DELETE /me/events/{id}`.
   *
   * #2770.52. Graph replies `204 No Content` on success; a `404` (already
   * gone — deleted elsewhere, or a retried call) is treated as success too,
   * since the caller's desired state (the event no longer exists) already
   * holds. Any other non-OK status is a real failure and throws.
   */
  async deleteEvent(accessToken: string, eventId: string): Promise<void> {
    const res = await fetch(`${GRAPH_BASE}/me/events/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: this.authHeaders(accessToken),
    })
    if (!res.ok && res.status !== 404) {
      throw new Error(`Microsoft delete event failed: ${await readError(res)}`)
    }
  }

  /**
   * Search the signed-in mailbox — the Outlook leg of the zero layer (annexe
   * méthodo p8). METADATA ONLY: subject, sender, received date. Never the body,
   * and `bodyPreview` is left out too — the zero layer needs to know that an
   * exchange EXISTS, not what was said in it.
   *
   * Graph's `$search` cannot be combined with `$orderby`; results come back
   * relevance-ranked, which is what we want for "is this company in my mailbox".
   * Requires the delegated `Mail.Read` permission.
   */
  async searchMessages(
    accessToken: string,
    input: { search: string; top?: number },
  ): Promise<{ subject: string; from: string | null; receivedAt: string | null }[]> {
    const top = Math.min(Math.max(input.top ?? 10, 1), 25)
    const url = new URL(`${GRAPH_BASE}/me/messages`)
    // Graph requires the search term to be a quoted string.
    url.searchParams.set('$search', `"${input.search.replace(/"/g, '')}"`)
    url.searchParams.set('$top', String(top))
    url.searchParams.set('$select', 'subject,from,receivedDateTime')

    const res = await fetch(url.toString(), { headers: this.authHeaders(accessToken) })
    if (!res.ok) throw new Error(`Microsoft search messages failed: ${await readError(res)}`)

    const data = (await res.json()) as {
      value?: {
        subject?: string
        receivedDateTime?: string
        from?: { emailAddress?: { address?: string; name?: string } }
      }[]
    }
    return (data?.value ?? []).map(message => ({
      subject: String(message?.subject ?? '').trim(),
      from: message?.from?.emailAddress?.address ?? message?.from?.emailAddress?.name ?? null,
      receivedAt: message?.receivedDateTime ?? null,
    }))
  }

  /**
   * List messages with the fields the executive layer needs (conversation id,
   * recipients, read state, attachments).
   *
   * Graph refuses `$search` together with `$filter` on `/me/messages` — a
   * documented limitation, not a guess. The caller therefore passes ONE of the
   * two and post-filters what remains; `listMessagesDetailed` never silently
   * drops a criterion, it just doesn't send an illegal query.
   */
  async listMessagesDetailed(
    accessToken: string,
    input: { search?: string; filter?: string; top?: number },
  ): Promise<GraphMessage[]> {
    const top = Math.min(Math.max(input.top ?? 25, 1), 100)
    const url = new URL(`${GRAPH_BASE}/me/messages`)
    url.searchParams.set('$top', String(top))
    url.searchParams.set(
      '$select',
      'id,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,isRead,hasAttachments,bodyPreview,internetMessageId',
    )
    if (input.search) {
      url.searchParams.set('$search', `"${input.search.replace(/"/g, '')}"`)
    } else if (input.filter) {
      url.searchParams.set('$filter', input.filter)
      url.searchParams.set('$orderby', 'receivedDateTime desc')
    } else {
      url.searchParams.set('$orderby', 'receivedDateTime desc')
    }

    const res = await fetch(url.toString(), { headers: this.authHeaders(accessToken) })
    if (!res.ok) throw new Error(`Microsoft list messages failed: ${await readError(res)}`)
    const data = (await res.json()) as { value?: RawGraphMessage[] }
    return (data?.value ?? []).map(toGraphMessage)
  }

  /**
   * Le CORPS d'un message (`GET /me/messages/{id}?$select=body`).
   *
   * Le seul appel de ce client qui rapporte du texte écrit par un humain, et il
   * n'existe que depuis l'arbitrage du 16/08 : les activités du CRM stockent le
   * corps intégral pour que l'historique survive au changement de messagerie.
   * Partout ailleurs on reste sur `bodyPreview`.
   *
   * Graph rend UNE forme (`contentType` = `text` ou `html`) : on la range dans
   * le bon champ plutôt que de deviner, c'est ce qui permet à l'appelant de
   * préférer le texte brut quand il en a.
   */
  async getMessageBody(accessToken: string, messageId: string): Promise<{ plain: string | null; html: string | null }> {
    const url = `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}?$select=body`
    const res = await fetch(url, { headers: this.authHeaders(accessToken) })
    if (!res.ok) throw new Error(`Microsoft get message body failed: ${await readError(res)}`)
    const data = (await res.json()) as { body?: { contentType?: string; content?: string } }
    const content = data?.body?.content ? String(data.body.content) : null
    if (!content) return { plain: null, html: null }
    const isHtml = String(data?.body?.contentType ?? '').toLowerCase() === 'html'
    return isHtml ? { plain: null, html: content } : { plain: content, html: null }
  }

  /**
   * Create a DRAFT (`POST /me/messages`). Graph puts it straight in the Drafts
   * folder, which is what "a real draft" means: it is visible and sendable from
   * Outlook itself, not a string sitting in our database.
   */
  async createDraft(
    accessToken: string,
    input: { to: string; cc?: string[]; subject: string; body: string; bodyType?: 'Text' | 'HTML' },
  ): Promise<{ id: string; webLink: string | null; conversationId: string | null }> {
    const payload: Record<string, unknown> = {
      subject: input.subject,
      body: { contentType: input.bodyType ?? 'Text', content: input.body },
      toRecipients: [{ emailAddress: { address: input.to } }],
    }
    if (input.cc?.length) {
      payload['ccRecipients'] = input.cc.map(address => ({ emailAddress: { address } }))
    }
    const res = await fetch(`${GRAPH_BASE}/me/messages`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Microsoft create draft failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string; webLink?: string; conversationId?: string }
    return {
      id: String(data?.id ?? ''),
      webLink: data?.webLink ? String(data.webLink) : null,
      conversationId: data?.conversationId ? String(data.conversationId) : null,
    }
  }

  /**
   * Delete a draft (#2277.34, épopée #2771).
   *
   * ⚠️ Graph has NO separate id space for drafts — a draft IS a message
   * (`isDraft: true`), and `DELETE /me/messages/{id}` deletes ANY message it's
   * given, sent or received included. This method therefore reads `isDraft`
   * FIRST and refuses to delete anything else: the one safety Gmail gets for
   * free (`GoogleClient.deleteDraft`, separate `drafts/{id}` namespace) has to
   * be built here by hand.
   */
  async deleteDraft(accessToken: string, messageId: string): Promise<{ deleted: boolean }> {
    const read = await fetch(`${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}?$select=isDraft`, {
      headers: this.authHeaders(accessToken),
    })
    if (read.status === 404) return { deleted: false }
    if (!read.ok) throw new Error(`Microsoft read draft failed: ${await readError(read)}`)
    const data = (await read.json()) as { isDraft?: boolean }
    if (data?.isDraft !== true) {
      throw new Error('Microsoft delete draft refused: target is not a draft.')
    }
    const res = await fetch(`${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
      headers: this.authHeaders(accessToken),
    })
    if (res.status === 404) return { deleted: false }
    if (!res.ok) throw new Error(`Microsoft delete draft failed: ${await readError(res)}`)
    return { deleted: true }
  }

  /**
   * Create a draft REPLY inside an existing conversation
   * (`POST /me/messages/{id}/createReply`), then patch its body.
   *
   * Graph has no way to hand a body to `createReply` in one call, so the two
   * steps are unavoidable. The upside is worth it: the reply carries the right
   * headers and lands in the conversation instead of opening a new one.
   */
  async createReplyDraft(
    accessToken: string,
    messageId: string,
    input: { body: string; bodyType?: 'Text' | 'HTML' },
  ): Promise<{ id: string; webLink: string | null; conversationId: string | null }> {
    const created = await fetch(`${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/createReply`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({}),
    })
    if (!created.ok) throw new Error(`Microsoft create reply failed: ${await readError(created)}`)
    const draft = (await created.json()) as { id?: string; webLink?: string; conversationId?: string }
    const draftId = String(draft?.id ?? '')
    if (!draftId) throw new Error('Microsoft create reply returned no draft id')

    const patched = await fetch(`${GRAPH_BASE}/me/messages/${encodeURIComponent(draftId)}`, {
      method: 'PATCH',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ body: { contentType: input.bodyType ?? 'Text', content: input.body } }),
    })
    if (!patched.ok) throw new Error(`Microsoft update reply failed: ${await readError(patched)}`)

    return {
      id: draftId,
      webLink: draft?.webLink ? String(draft.webLink) : null,
      conversationId: draft?.conversationId ? String(draft.conversationId) : null,
    }
  }

  /**
   * Events overlapping a window (`/me/calendarView`).
   *
   * `calendarView` rather than `/me/events` on purpose: it expands recurring
   * series into their occurrences. A weekly client meeting must appear in
   * tomorrow's brief, not only on the week it was first created.
   */
  async listCalendarView(
    accessToken: string,
    input: { start: string; end: string; top?: number; calendarId?: string },
  ): Promise<GraphEvent[]> {
    const top = Math.min(Math.max(input.top ?? 50, 1), 250)
    // Un agenda précis se lit sous `/me/calendars/{id}/calendarView` ; sans id,
    // Graph sert l'agenda par défaut du compte.
    const path = input.calendarId
      ? `${GRAPH_BASE}/me/calendars/${encodeURIComponent(input.calendarId)}/calendarView`
      : `${GRAPH_BASE}/me/calendarView`
    const url = new URL(path)
    url.searchParams.set('startDateTime', input.start)
    url.searchParams.set('endDateTime', input.end)
    url.searchParams.set('$top', String(top))
    url.searchParams.set('$orderby', 'start/dateTime')
    url.searchParams.set(
      '$select',
      'id,subject,bodyPreview,location,start,end,attendees,organizer,onlineMeeting,onlineMeetingUrl,webLink,isCancelled,sensitivity,seriesMasterId,showAs',
    )
    // #4065.7 — Graph rend `@odata.nextLink` quand la page est coupée : on le suit jusqu'au bout,
    // borné par `top` (le plafond demandé) et `CALENDAR_VIEW_MAX_PAGES` (garde-fou).
    const collected: GraphEvent[] = []
    let next: string | undefined = url.toString()
    for (let page = 0; next && page < CALENDAR_VIEW_MAX_PAGES && collected.length < top; page += 1) {
      const res = await fetch(next, {
        headers: { ...this.authHeaders(accessToken), Prefer: 'outlook.timezone="UTC"' },
      })
      if (!res.ok) throw new Error(`Microsoft calendar view failed: ${await readError(res)}`)
      const data = (await res.json()) as { value?: RawGraphEvent[]; '@odata.nextLink'?: string }
      collected.push(...(data?.value ?? []).map(toGraphEvent))
      next = data?.['@odata.nextLink']
    }
    return collected.slice(0, top)
  }

  /**
   * #2390.9 — le nombre de places d'une salle (`GET /places/{adresse}`, ressource
   * `room`, champ `capacity` ; portée `Place.Read.All`). `null` quand Graph
   * refuse, ne connaît pas la salle ou ne renseigne pas la capacité (0 chez Graph
   * = non renseigné) : jamais une capacité devinée, et un refus n'interrompt pas
   * la lecture de l'agenda.
   */
  async getRoomCapacity(accessToken: string, email: string): Promise<number | null> {
    const url = `${GRAPH_BASE}/places/${encodeURIComponent(email)}?$select=id,capacity`
    const res = await fetch(url, { headers: this.authHeaders(accessToken) })
    if (!res.ok) return null
    const data = (await res.json()) as { capacity?: unknown }
    const capacity = data?.capacity
    return typeof capacity === 'number' && Number.isInteger(capacity) && capacity > 0 ? capacity : null
  }

  /**
   * The calendars of this mailbox (`GET /me/calendars`).
   *
   * `canEdit` is Graph's own answer to « may this account write here » — a
   * shared calendar opened read-only must not offer « create event ».
   */
  async listCalendars(accessToken: string): Promise<RawGraphCalendar[]> {
    const url = new URL(`${GRAPH_BASE}/me/calendars`)
    url.searchParams.set('$top', '100')
    url.searchParams.set('$select', 'id,name,isDefaultCalendar,canEdit')
    const res = await fetch(url.toString(), { headers: this.authHeaders(accessToken) })
    if (!res.ok) throw new Error(`Microsoft list calendars failed: ${await readError(res)}`)
    const data = (await res.json()) as { value?: RawGraphCalendar[] }
    return Array.isArray(data?.value) ? data.value : []
  }

  /** Read the automatic-replies (out-of-office) settings. */
  async getAutomaticReplies(accessToken: string): Promise<GraphAutomaticReplies> {
    const res = await fetch(`${GRAPH_BASE}/me/mailboxSettings/automaticRepliesSetting`, {
      headers: this.authHeaders(accessToken),
    })
    if (!res.ok) throw new Error(`Microsoft get automatic replies failed: ${await readError(res)}`)
    const data = (await res.json()) as RawAutomaticReplies
    return toAutomaticReplies(data)
  }

  /** Write the automatic-replies settings (`PATCH /me/mailboxSettings`). */
  async setAutomaticReplies(
    accessToken: string,
    input: { enabled: boolean; message?: string; startsAt?: string; endsAt?: string; contactsOnly?: boolean },
  ): Promise<GraphAutomaticReplies> {
    const scheduled = Boolean(input.startsAt && input.endsAt)
    const setting: Record<string, unknown> = {
      status: input.enabled ? (scheduled ? 'scheduled' : 'alwaysEnabled') : 'disabled',
      // `contactsOnly` maps to Graph's audience for EXTERNAL senders; internal
      // colleagues always get the reply, which is the Outlook default and what
      // people expect.
      externalAudience: input.contactsOnly ? 'contactsOnly' : 'all',
    }
    if (input.message) {
      setting['internalReplyMessage'] = input.message
      setting['externalReplyMessage'] = input.message
    }
    if (scheduled) {
      setting['scheduledStartDateTime'] = { dateTime: input.startsAt, timeZone: 'UTC' }
      setting['scheduledEndDateTime'] = { dateTime: input.endsAt, timeZone: 'UTC' }
    }
    const res = await fetch(`${GRAPH_BASE}/me/mailboxSettings`, {
      method: 'PATCH',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ automaticRepliesSetting: setting }),
    })
    if (!res.ok) throw new Error(`Microsoft set automatic replies failed: ${await readError(res)}`)
    return this.getAutomaticReplies(accessToken)
  }

  /**
   * Cherche dans l'espace documentaire de l'utilisateur — OneDrive et les
   * bibliothèques SharePoint auxquelles il a accès.
   *
   * `/me/drive/root/search(q='…')` est l'endpoint documenté ; il indexe le NOM
   * **et le CONTENU** des documents, ce qui est exactement le garde-fou n°25.
   * Les ESN sous Microsoft 365 n'avaient jusqu'ici aucun espace documentaire
   * branché — leurs CV étaient invisibles.
   */
  async searchFiles(
    accessToken: string,
    input: { query: string; top?: number },
  ): Promise<
    Array<{ id: string; name: string; mimeType: string | null; modifiedAt: string | null; webUrl: string | null }>
  > {
    const top = Math.min(Math.max(input.top ?? 20, 1), 100)
    // Le terme est interpolé dans un littéral OData : les apostrophes s'y
    // doublent, sinon une recherche « L'Oréal » casse la requête.
    const term = input.query.replace(/'/g, "''")
    const url = new URL(`${GRAPH_BASE}/me/drive/root/search(q='${encodeURIComponent(term)}')`)
    url.searchParams.set('$top', String(top))
    url.searchParams.set('$select', 'id,name,file,lastModifiedDateTime,webUrl')

    const res = await fetch(url.toString(), { headers: this.authHeaders(accessToken) })
    if (!res.ok) throw new Error(`Microsoft file search failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      value?: Array<{
        id?: string
        name?: string
        file?: { mimeType?: string }
        lastModifiedDateTime?: string
        webUrl?: string
      }>
    }
    return (
      (data?.value ?? [])
        // Un DOSSIER n'a pas de facette `file` : le rendre comme un document
        // produirait un téléchargement qui échoue au clic.
        .filter(entry => entry?.file)
        .map(entry => ({
          id: String(entry.id ?? ''),
          name: String(entry.name ?? ''),
          mimeType: entry.file?.mimeType ? String(entry.file.mimeType) : null,
          modifiedAt: entry.lastModifiedDateTime ?? null,
          webUrl: entry.webUrl ?? null,
        }))
    )
  }

  /** Télécharge un document de l'espace documentaire, rendu en base64. */
  async downloadFileBase64(accessToken: string, itemId: string): Promise<string> {
    const res = await fetch(`${GRAPH_BASE}/me/drive/items/${encodeURIComponent(itemId)}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Microsoft file download failed: ${await readError(res)}`)
    return Buffer.from(await res.arrayBuffer()).toString('base64')
  }

  /** Attachment metadata of one message — name, type, size only. */
  async listAttachments(
    accessToken: string,
    messageId: string,
  ): Promise<Array<{ attachmentId: string; filename: string; mimeType: string | null; sizeBytes: number | null }>> {
    const url = new URL(`${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/attachments`)
    url.searchParams.set('$select', 'id,name,contentType,size')
    const res = await fetch(url.toString(), { headers: this.authHeaders(accessToken) })
    if (!res.ok) throw new Error(`Microsoft list attachments failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      value?: Array<{ id?: string; name?: string; contentType?: string; size?: number }>
    }
    return (data?.value ?? []).map(attachment => ({
      attachmentId: String(attachment?.id ?? ''),
      filename: String(attachment?.name ?? ''),
      mimeType: attachment?.contentType ? String(attachment.contentType) : null,
      sizeBytes: typeof attachment?.size === 'number' ? attachment.size : null,
    }))
  }

  /**
   * Télécharge une pièce jointe (#2568.1), rendue en base64 standard — Graph
   * la rend déjà ainsi dans `contentBytes` pour une `fileAttachment`, à
   * l'inverse de Gmail. L'identifiant vient de {@link listAttachments} : on ne
   * devine jamais un `attachmentId`.
   */
  async getAttachmentBase64(accessToken: string, messageId: string, attachmentId: string): Promise<string> {
    const url = `${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
    const res = await fetch(url, { headers: this.authHeaders(accessToken) })
    if (!res.ok) throw new Error(`Microsoft get attachment failed: ${await readError(res)}`)
    const data = (await res.json()) as { contentBytes?: string }
    return String(data?.contentBytes ?? '')
  }

  /**
   * La date d'UN message (#2568.1) — pour départager deux versions du même CV
   * (#2569.2). `format=metadata` côté Gmail n'a pas d'équivalent ici, mais
   * `$select` limite déjà la réponse à cette seule donnée.
   */
  async getMessageDate(accessToken: string, messageId: string): Promise<string | null> {
    const url = new URL(`${GRAPH_BASE}/me/messages/${encodeURIComponent(messageId)}`)
    url.searchParams.set('$select', 'receivedDateTime')
    const res = await fetch(url.toString(), { headers: this.authHeaders(accessToken) })
    if (!res.ok) throw new Error(`Microsoft get message failed: ${await readError(res)}`)
    const data = (await res.json()) as { receivedDateTime?: string }
    return data?.receivedDateTime ?? null
  }
}

/** A Graph message, trimmed to the fields the executive layer consumes. */
type GraphMessage = {
  id: string
  conversationId: string | null
  subject: string | null
  from: string | null
  to: string[]
  cc: string[]
  date: string | null
  preview: string | null
  isRead: boolean
  hasAttachments: boolean
  internetMessageId: string | null
}

type RawGraphAddress = { emailAddress?: { address?: string; name?: string } }

type RawGraphMessage = {
  id?: string
  conversationId?: string
  subject?: string
  from?: RawGraphAddress
  toRecipients?: RawGraphAddress[]
  ccRecipients?: RawGraphAddress[]
  receivedDateTime?: string
  sentDateTime?: string
  isRead?: boolean
  hasAttachments?: boolean
  bodyPreview?: string
  internetMessageId?: string
}

function addressesOf(list: RawGraphAddress[] | undefined): string[] {
  return (list ?? []).map(entry => entry?.emailAddress?.address).filter((value): value is string => Boolean(value))
}

function toGraphMessage(message: RawGraphMessage): GraphMessage {
  return {
    id: String(message?.id ?? ''),
    conversationId: message?.conversationId ? String(message.conversationId) : null,
    subject: message?.subject ? String(message.subject) : null,
    from: message?.from?.emailAddress?.address ?? null,
    to: addressesOf(message?.toRecipients),
    cc: addressesOf(message?.ccRecipients),
    date: message?.receivedDateTime ?? message?.sentDateTime ?? null,
    preview: message?.bodyPreview ? String(message.bodyPreview) : null,
    isRead: Boolean(message?.isRead),
    hasAttachments: Boolean(message?.hasAttachments),
    internetMessageId: message?.internetMessageId ? String(message.internetMessageId) : null,
  }
}

/** A Graph calendar occurrence, trimmed the same way. */
type GraphEvent = {
  id: string
  subject: string | null
  preview: string | null
  location: string | null
  start: string | null
  end: string | null
  organizer: string | null
  attendees: Array<{
    email: string
    displayName: string | null
    responseStatus: string | null
    /** #2390.9 — Graph marque une salle réservée `type: 'resource'`. */
    resource: boolean
  }>
  conferenceUrl: string | null
  webUrl: string | null
  cancelled: boolean
  /** #2388.23 — `normal` | `personal` | `private` | `confidential`, as Graph reports it. */
  sensitivity: string | null
  /** #2103.29 — set only on a recurring occurrence/exception; the series master carries none. */
  seriesMasterId: string | null
  /**
   * #2390.6 — how this time shows on the calendar, as the event's own creator
   * set it: `free` | `tentative` | `busy` | `oof` | `workingElsewhere` |
   * `unknown` (learn.microsoft.com/graph/api/resources/event, field `showAs`).
   */
  showAs: string | null
}

/** One row of `GET /me/calendars` — https://learn.microsoft.com/graph/api/user-list-calendars */
type RawGraphCalendar = {
  id?: string
  name?: string
  isDefaultCalendar?: boolean
  canEdit?: boolean
}

type RawGraphEvent = {
  id?: string
  subject?: string
  bodyPreview?: string
  location?: { displayName?: string }
  start?: { dateTime?: string; timeZone?: string }
  end?: { dateTime?: string; timeZone?: string }
  organizer?: RawGraphAddress
  /** #2390.9 — `type` ∈ `required` | `optional` | `resource` (learn.microsoft.com/graph/api/resources/attendee). */
  attendees?: Array<RawGraphAddress & { status?: { response?: string }; type?: string }>
  onlineMeeting?: { joinUrl?: string }
  onlineMeetingUrl?: string
  webLink?: string
  isCancelled?: boolean
  sensitivity?: string
  /** Posé UNIQUEMENT sur une occurrence/exception d'une série récurrente (jamais sur le maître) —
   *  https://learn.microsoft.com/graph/api/resources/event */
  seriesMasterId?: string
  /** #2390.6 — toujours rendu par Graph. */
  showAs?: string
}

/**
 * Graph returns `dateTime` WITHOUT an offset and names the zone separately. We
 * ask for UTC via the `Prefer` header, so appending `Z` is correct — and it
 * matters: a naive string would be parsed as local time and shift every meeting
 * by the server's own offset.
 */
function graphInstant(slot: { dateTime?: string; timeZone?: string } | undefined): string | null {
  const raw = slot?.dateTime
  if (!raw) return null
  if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(raw)) return raw
  return `${raw}Z`
}

function toGraphEvent(event: RawGraphEvent): GraphEvent {
  return {
    id: String(event?.id ?? ''),
    subject: event?.subject ? String(event.subject) : null,
    preview: event?.bodyPreview ? String(event.bodyPreview) : null,
    location: event?.location?.displayName ? String(event.location.displayName) : null,
    start: graphInstant(event?.start),
    end: graphInstant(event?.end),
    organizer: event?.organizer?.emailAddress?.address ?? null,
    attendees: (event?.attendees ?? [])
      .filter(attendee => attendee?.emailAddress?.address)
      .map(attendee => ({
        email: String(attendee.emailAddress?.address),
        displayName: attendee.emailAddress?.name ? String(attendee.emailAddress.name) : null,
        responseStatus: attendee?.status?.response ? String(attendee.status.response) : null,
        resource: attendee?.type === 'resource',
      })),
    conferenceUrl: event?.onlineMeeting?.joinUrl ?? event?.onlineMeetingUrl ?? null,
    webUrl: event?.webLink ? String(event.webLink) : null,
    cancelled: Boolean(event?.isCancelled),
    sensitivity: event?.sensitivity ? String(event.sensitivity) : null,
    seriesMasterId: event?.seriesMasterId ? String(event.seriesMasterId) : null,
    showAs: event?.showAs ? String(event.showAs) : null,
  }
}

type GraphAutomaticReplies = {
  enabled: boolean
  message: string | null
  startsAt: string | null
  endsAt: string | null
  contactsOnly: boolean
}

type RawAutomaticReplies = {
  status?: string
  externalAudience?: string
  internalReplyMessage?: string
  externalReplyMessage?: string
  scheduledStartDateTime?: { dateTime?: string; timeZone?: string }
  scheduledEndDateTime?: { dateTime?: string; timeZone?: string }
}

function toAutomaticReplies(data: RawAutomaticReplies): GraphAutomaticReplies {
  return {
    enabled: data?.status === 'alwaysEnabled' || data?.status === 'scheduled',
    message: data?.internalReplyMessage ?? data?.externalReplyMessage ?? null,
    startsAt: graphInstant(data?.scheduledStartDateTime),
    endsAt: graphInstant(data?.scheduledEndDateTime),
    contactsOnly: data?.externalAudience === 'contactsOnly',
  }
}
