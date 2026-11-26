import { randomBytes } from 'node:crypto'
import type { GoogleConfig } from './google-config'

/**
 * Thin Google Workspace REST wrapper. No SDK — a handful of endpoints (OAuth
 * token, Calendar events.insert, Gmail messages.send, Drive files.list/get/export)
 * are enough, and staying on `fetch` keeps the dependency surface small. Every
 * call checks `res.ok` (code rule) and surfaces a clear error rather than an
 * invented fallback. All endpoint URLs are the documented Google ones — verified
 * against developers.google.com, never guessed.
 */

/** OAuth token endpoint (authorization_code + refresh_token grants). */
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
/** Calendar events.insert / events.list — https://developers.google.com/workspace/calendar/api/v3/reference/events */
const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars'
/** Calendar calendarList.list — the calendars this account can actually see. */
const CALENDAR_LIST_URL = 'https://www.googleapis.com/calendar/v3/users/me/calendarList'
/** Gmail users.messages.send (metadata request) — userId `me` = authenticated mailbox. */
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
/** Gmail users.messages.list / .get base. */
const GMAIL_MESSAGES_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
/** Gmail users.drafts.create — a draft is composed but NOT sent (review-first path). */
const GMAIL_DRAFTS_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/drafts'
/** Gmail users.getProfile — the mailbox address, which is how we tell inbound from outbound. */
const GMAIL_PROFILE_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/profile'
/** Gmail users.settings.vacation — the out-of-office responder (scope gmail.settings.basic). */
const GMAIL_VACATION_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/settings/vacation'
/** Gmail users.settings.sendAs — carries the user's REAL signature per identity. */
const GMAIL_SEND_AS_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs'
/** Gmail users.labels — list/create only (applying a label needs the restricted gmail.modify). */
const GMAIL_LABELS_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/labels'
/** Drive files.list / files.get / files.export base. */
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files'
/** Sheets spreadsheets.create — https://developers.google.com/sheets/api/reference/rest/v4/spreadsheets/create */
const SHEETS_URL = 'https://sheets.googleapis.com/v4/spreadsheets'

export type GoogleTokens = {
  accessToken: string
  refreshToken: string | null
  /** seconds until the access token expires */
  expiresIn: number
  /** space-separated scopes actually granted (Google echoes them back) */
  scope: string | null
}

/** Attendee on a calendar event — Google requires an `email` per attendee. */
type CalendarAttendee = { email: string }

/** A single point in time for an event boundary (RFC3339 `dateTime` incl. offset). */
type CalendarEventTime = { dateTime: string; timeZone?: string }

/** Minimal event payload posted to events.insert (consumed structurally by the service). */
type GoogleCalendarEvent = {
  summary: string
  description?: string
  start: CalendarEventTime
  end: CalendarEventTime
  attendees?: CalendarAttendee[]
  reminders?: { useDefault: boolean; overrides?: Array<{ method: 'popup' | 'email'; minutes: number }> }
  conferenceData?: {
    createRequest: { requestId: string; conferenceSolutionKey: { type: 'hangoutsMeet' } }
  }
  /**
   * #2101.26 — une ou plusieurs lignes RRULE/EXRULE/RDATE/EXDATE (RFC 5545),
   * la forme EXACTE documentée par `events.insert`
   * (developers.google.com/calendar/api/v3/reference/events). Aujourd'hui une
   * seule ligne RRULE, validée en amont par `agendaEventDraftSchema`.
   */
  recurrence?: string[]
}

/** What events.insert gives back (the fields we surface to the caller). */
export type CreatedCalendarEvent = {
  id: string
  htmlLink: string | null
  status: string | null
  /** Meet link, when one was requested and Google created it. */
  conferenceUrl: string | null
}

/** A Drive file row (Google Docs / PDF) returned by files.list (structural via DriveFilePage). */
type DriveFile = {
  id: string
  name: string | null
  mimeType: string | null
  modifiedTime: string | null
}

/** A page of Drive files + the opaque token for the next page. */
export type DriveFilePage = {
  files: DriveFile[]
  nextPageToken: string | null
}

/** File metadata needed to decide how to fetch content (export vs alt=media). */
type DriveFileMetadata = { id: string; name: string | null; mimeType: string | null }

/**
 * A Gmail message reduced to its metadata (headers + snippet). We DELIBERATELY
 * never surface or store the full body — the sales UI shows subject/date/snippet
 * only, read on demand. Consumed structurally by the service.
 */
export type GmailMessageSummary = {
  id: string
  threadId: string | null
  subject: string | null
  from: string | null
  to: string | null
  /** RFC3339-ish timestamp (from the Date header, else internalDate epoch ms). */
  date: string | null
  snippet: string | null
}

/** One upcoming calendar event, trimmed to what a meeting-prep brief needs. */
export type CalendarEventSummary = {
  id: string
  summary: string | null
  description: string | null
  location: string | null
  htmlLink: string | null
  /** RFC3339 dateTime, or an all-day `date`. */
  start: string | null
  end: string | null
  attendees: Array<{
    email: string
    displayName: string | null
    responseStatus: string | null
    /** #2390.9 — Google marque une salle réservée `resource: true`. */
    resource: boolean
  }>
  /** Address of the organizer — the one person we must never list as an invitee. */
  organizer: string | null
  /** `confirmed` | `tentative` | `cancelled`, as Google reports it. */
  status: string | null
  /** Meet link when the event has one. */
  conferenceUrl: string | null
  /** #2388.23 — `default` | `public` | `private` | `confidential`, as Google reports it. */
  visibility: string | null
  /** #2103.29 — set only on a recurring occurrence; the series master carries none. */
  recurringEventId: string | null
  /**
   * #2390.1 / #2390.6 — the event's NATURE, as Google always returns it on
   * events.list/events.get: `default` | `outOfOffice` | `focusTime` |
   * `workingLocation` | `fromGmail` | `birthday`
   * (developers.google.com/workspace/calendar/api/v3/reference/events, field
   * `eventType`).
   */
  eventType: string | null
}

/** Gmail message metadata, richer than {@link GmailMessageSummary}. */
type GmailMessageDetail = {
  id: string
  threadId: string | null
  subject: string | null
  from: string | null
  to: string[]
  cc: string[]
  date: string | null
  snippet: string | null
  labelIds: string[]
  /** RFC 5322 `Message-ID` — required to thread a reply correctly. */
  messageIdHeader: string | null
  references: string | null
}

/** The out-of-office responder, in both directions (read and write). */
type GmailVacationSettings = {
  enabled: boolean
  subject: string | null
  message: string | null
  startsAt: string | null
  endsAt: string | null
  contactsOnly: boolean
}

/** A MIME part as Gmail returns it — only the shape we walk over. */
type GmailPart = {
  filename?: string
  mimeType?: string
  body?: { attachmentId?: string; size?: number; data?: string }
  parts?: GmailPart[]
}

/** Depth-first walk over a MIME tree; attachments hide at arbitrary depth. */
function walkParts(part: GmailPart | undefined, visit: (part: GmailPart) => void): void {
  if (!part) return
  visit(part)
  for (const child of part.parts ?? []) walkParts(child, visit)
}

/**
 * Décode une partie inline (base64url). Rend `null` plutôt que de lever : une
 * partie illisible ne doit pas faire échouer la capture du message entier.
 */
function decodeGmailPart(data: string): string | null {
  try {
    const text = Buffer.from(data, 'base64url').toString('utf8')
    return text.length > 0 ? text : null
  } catch {
    return null
  }
}

/** `"A" <a@x.com>, b@y.com` → `['"A" <a@x.com>', 'b@y.com']`. */
function splitAddressList(raw: string | null): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
}

/** The Google Calendar event shape we read from (structural, never `any`). */
type RawGoogleEvent = {
  id?: string
  summary?: string
  description?: string
  location?: string
  htmlLink?: string
  status?: string
  hangoutLink?: string
  conferenceData?: { entryPoints?: Array<{ uri?: string; entryPointType?: string }> }
  organizer?: { email?: string }
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: Array<{ email?: string; displayName?: string; responseStatus?: string; resource?: boolean }>
  visibility?: string
  /** Posé UNIQUEMENT sur une occurrence d'une série récurrente (jamais sur
   *  l'évènement maître) — https://developers.google.com/workspace/calendar/api/v3/reference/events */
  recurringEventId?: string
  /** #2390.1 / #2390.6 — toujours rendu par Google, jamais absent. */
  eventType?: string
}

/** One row of `calendarList` — https://developers.google.com/workspace/calendar/api/v3/reference/calendarList */
type RawGoogleCalendarListEntry = {
  id?: string
  summary?: string
  summaryOverride?: string
  primary?: boolean
  /** `freeBusyReader` | `reader` | `writer` | `owner`. */
  accessRole?: string
  deleted?: boolean
}

function toCalendarEventSummary(event: RawGoogleEvent): CalendarEventSummary {
  const videoEntry = (event?.conferenceData?.entryPoints ?? []).find(
    entry => entry?.entryPointType === 'video' && entry?.uri,
  )
  return {
    id: String(event?.id ?? ''),
    summary: event?.summary ? String(event.summary) : null,
    description: event?.description ? String(event.description) : null,
    location: event?.location ? String(event.location) : null,
    htmlLink: event?.htmlLink ? String(event.htmlLink) : null,
    start: event?.start?.dateTime ?? event?.start?.date ?? null,
    end: event?.end?.dateTime ?? event?.end?.date ?? null,
    attendees: (event?.attendees ?? [])
      .filter(attendee => attendee?.email)
      .map(attendee => ({
        email: String(attendee.email),
        displayName: attendee?.displayName ? String(attendee.displayName) : null,
        responseStatus: attendee?.responseStatus ? String(attendee.responseStatus) : null,
        resource: Boolean(attendee?.resource),
      })),
    organizer: event?.organizer?.email ? String(event.organizer.email) : null,
    status: event?.status ? String(event.status) : null,
    conferenceUrl: event?.hangoutLink ? String(event.hangoutLink) : (videoEntry?.uri ?? null),
    visibility: event?.visibility ? String(event.visibility) : null,
    recurringEventId: event?.recurringEventId ? String(event.recurringEventId) : null,
    eventType: event?.eventType ? String(event.eventType) : null,
  }
}

/** What drafts.create gives back. */
export type CreatedDraft = { id: string; messageId: string | null; threadId: string | null }

/** What spreadsheets.create gives back (the fields we surface). */
export type CreatedSpreadsheet = { spreadsheetId: string; spreadsheetUrl: string | null }

/** Pull one named header value out of a Gmail payload.headers array. */
function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string): string | null {
  const found = (headers ?? []).find(h => (h?.name ?? '').toLowerCase() === name.toLowerCase())
  return found?.value ? String(found.value) : null
}

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as {
      error?: { message?: string } | string
      error_description?: string
      message?: string
    }
    if (typeof body?.error === 'object' && body.error?.message) return body.error.message
    if (typeof body?.error === 'string') return body.error
    return body?.error_description || body?.message || `HTTP ${res.status}`
  } catch {
    return `HTTP ${res.status}`
  }
}

function toTokens(data: Record<string, unknown>): GoogleTokens {
  return {
    accessToken: String(data['access_token'] ?? ''),
    refreshToken: data['refresh_token'] ? String(data['refresh_token']) : null,
    expiresIn: Number(data['expires_in'] ?? 0),
    scope: data['scope'] ? String(data['scope']) : null,
  }
}

/** MIME-encode a header value only when it carries non-ASCII (RFC 2047 B-encoding). */
function encodeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

/**
 * Build a base64url-encoded RFC 5322 plain-text message for Gmail
 * users.messages.send `raw`. `From` is omitted — Gmail stamps it from the
 * authenticated mailbox. Pure so it is unit-testable without the network.
 *
 * `cc`, `inReplyTo` and `references` exist for one reason: a reply that carries
 * neither `In-Reply-To` nor `References` opens a NEW conversation in the
 * recipient's client, however right the subject looks. That is the difference
 * between "a real draft" and "a text that happens to be in the drafts folder" —
 * anti-pattern n°9 of the field reports.
 */
export type GmailAttachment = {
  filename: string
  mimeType: string
  /** Contenu du fichier, encodé en base64. */
  contentBase64: string
}

export function encodeGmailRaw(input: {
  to: string
  subject: string
  body: string
  cc?: string[]
  inReplyTo?: string
  references?: string
  attachments?: GmailAttachment[]
}): string {
  const headers = [`To: ${input.to}`]
  if (input.cc?.length) headers.push(`Cc: ${input.cc.join(', ')}`)
  headers.push(`Subject: ${encodeHeaderValue(input.subject)}`)
  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${input.inReplyTo}`)
    headers.push(`References: ${input.references ?? input.inReplyTo}`)
  }
  headers.push('MIME-Version: 1.0')

  const attachments = input.attachments ?? []
  if (!attachments.length) {
    headers.push('Content-Type: text/plain; charset="UTF-8"', 'Content-Transfer-Encoding: 8bit')
    const mime = `${headers.join('\r\n')}\r\n\r\n${input.body}`
    return Buffer.from(mime, 'utf8').toString('base64url')
  }

  // Garde-fou n°26 des méta-analyses : « associer la PIÈCE JOINTE RÉELLE au
  // brouillon », pas un lien. Un lien Drive vers un CV oblige le client à avoir
  // un compte, à demander l'accès, et souvent à ne jamais l'ouvrir.
  //
  // La frontière est dérivée d'un aléa : si elle apparaissait dans le corps ou
  // dans un fichier, le message se couperait en deux au milieu.
  const boundary = `bellum_${randomBytes(12).toString('hex')}`
  headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)

  const parts: string[] = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    input.body,
  ]
  for (const attachment of attachments) {
    parts.push(
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType}; name="${attachmentFileName(attachment.filename)}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${attachmentFileName(attachment.filename)}"`,
      '',
      // RFC 2045 : les lignes d'un corps base64 ne dépassent pas 76 caractères.
      attachment.contentBase64.replace(/(.{76})/g, '$1\r\n'),
    )
  }
  parts.push(`--${boundary}--`, '')

  const mime = `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`
  return Buffer.from(mime, 'utf8').toString('base64url')
}

/**
 * #3699.6 — le nom d'une pièce dans un en-tête MIME : guillemets et sauts de
 * ligne retirés (aucune injection d'en-tête), accents encodés RFC 2047 — un
 * « présentation.pdf » brut arrive illisible chez certains clients.
 */
function attachmentFileName(fileName: string): string {
  return encodeHeaderValue(fileName.replace(/["\r\n]/g, ''))
}

/** #4065.7 — pages lues au plus pour UNE fenêtre d'agenda (garde-fou : 10 pages × `maxResults`). */
const CALENDAR_MAX_PAGES = 10

export class GoogleClient {
  constructor(private readonly config: GoogleConfig) {}

  /** Exchange an authorization `code` for tokens (grant_type=authorization_code). */
  async exchangeCode(code: string): Promise<GoogleTokens> {
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
    if (!res.ok) throw new Error(`Google token exchange failed: ${await readError(res)}`)
    return toTokens((await res.json()) as Record<string, unknown>)
  }

  /** Refresh an expired access token (grant_type=refresh_token). */
  async refresh(refreshToken: string): Promise<GoogleTokens> {
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
    if (!res.ok) throw new Error(`Google token refresh failed: ${await readError(res)}`)
    const tokens = toTokens((await res.json()) as Record<string, unknown>)
    // A refresh response never returns a new refresh_token — keep the existing one.
    return { ...tokens, refreshToken: tokens.refreshToken ?? refreshToken }
  }

  /**
   * Révoque le jeton chez Google (`oauth2.googleapis.com/revoke`).
   *
   * Endpoint documenté et stable. Révoquer le jeton de RAFRAÎCHISSEMENT invalide
   * toute la concession, jetons d'accès compris, et retire l'application de la
   * liste « Applications tierces » du compte de l'utilisateur. Sans cet appel,
   * effacer notre ligne en base ne retirait rigoureusement rien chez Google.
   */
  async revoke(token: string): Promise<void> {
    const res = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    })
    // 200 = révoqué. 400 = déjà invalide, donc le résultat voulu est acquis.
    if (!res.ok && res.status !== 400) throw new Error(`Google token revocation failed: ${await readError(res)}`)
  }

  private authHeaders(accessToken: string): Record<string, string> {
    return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  }

  /**
   * Create a calendar event (events.insert). `calendarId` is usually `primary`.
   *
   * `conferenceDataVersion=1` is mandatory whenever the payload asks for a Meet
   * link — without it Google silently drops the request and returns an event
   * with no video link, which is exactly the "says it did, didn't" failure the
   * field reports call out.
   */
  async createEvent(
    accessToken: string,
    calendarId: string,
    event: GoogleCalendarEvent,
  ): Promise<CreatedCalendarEvent> {
    const params = new URLSearchParams()
    if (event.conferenceData) params.set('conferenceDataVersion', '1')
    const query = params.toString()
    const url = `${CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events${query ? `?${query}` : ''}`
    const res = await fetch(url, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(event),
    })
    if (!res.ok) throw new Error(`Google Calendar create event failed: ${await readError(res)}`)
    const data = (await res.json()) as RawGoogleEvent
    return {
      id: String(data?.id ?? ''),
      htmlLink: data?.htmlLink ? String(data.htmlLink) : null,
      status: data?.status ? String(data.status) : null,
      conferenceUrl: toCalendarEventSummary(data).conferenceUrl,
    }
  }

  /**
   * Move an existing event — `PATCH /calendars/{id}/events/{eventId}`.
   *
   * Only `start` and `end` travel. A patch that also carried the summary, the
   * description or the attendees would silently overwrite whatever the
   * organiser changed elsewhere since we read the event: the classic lost
   * update, on data other people can see in their own calendar.
   *
   * `sendUpdates` is what makes the screen's « prévenir les invités » checkbox
   * meaningful — `all` mails every guest, `none` moves the event in silence.
   * Google honours both, which is why this provider advertises
   * `silentReschedule: true`.
   */
  async patchEventSchedule(
    accessToken: string,
    calendarId: string,
    eventId: string,
    input: { start: string; end: string; notifyGuests: boolean },
  ): Promise<{ id: string; startsAt: string; endsAt: string }> {
    const params = new URLSearchParams({ sendUpdates: input.notifyGuests ? 'all' : 'none' })
    const url = `${CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?${params.toString()}`
    const res = await fetch(url, {
      method: 'PATCH',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ start: { dateTime: input.start }, end: { dateTime: input.end } }),
    })
    if (!res.ok) throw new Error(`Google Calendar patch event failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string; start?: { dateTime?: string }; end?: { dateTime?: string } }
    return {
      id: String(data?.id ?? eventId),
      // Ce que le fournisseur a ENREGISTRÉ, pas ce qu'on a demandé.
      startsAt: data?.start?.dateTime ? String(data.start.dateTime) : input.start,
      endsAt: data?.end?.dateTime ? String(data.end.dateTime) : input.end,
    }
  }

  /**
   * Delete an existing event — `DELETE /calendars/{id}/events/{eventId}`.
   *
   * #2770.52. Google replies `204 No Content` on success; `404`/`410` (already
   * gone — deleted elsewhere, or a retried call) are treated as success too,
   * since the caller's desired state (the event no longer exists) already
   * holds. Any other non-OK status is a real failure and throws.
   */
  async deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
    const url = `${CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`
    const res = await fetch(url, { method: 'DELETE', headers: this.authHeaders(accessToken) })
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      throw new Error(`Google Calendar delete event failed: ${await readError(res)}`)
    }
  }

  /** Send an email from the authenticated mailbox (users.messages.send, `raw`). */
  async sendMessage(accessToken: string, raw: string): Promise<{ id: string; threadId: string | null }> {
    const res = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ raw }),
    })
    if (!res.ok) throw new Error(`Gmail send failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string; threadId?: string }
    return { id: String(data?.id ?? ''), threadId: data?.threadId ? String(data.threadId) : null }
  }

  /** List the user's Drive files matching `q`, one page at a time. */
  async listFiles(
    accessToken: string,
    opts: { q: string; pageSize: number; pageToken?: string },
  ): Promise<DriveFilePage> {
    const params = new URLSearchParams({
      q: opts.q,
      pageSize: String(opts.pageSize),
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
      orderBy: 'modifiedTime desc',
    })
    if (opts.pageToken) params.set('pageToken', opts.pageToken)
    const res = await fetch(`${DRIVE_FILES_URL}?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Google Drive list files failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      nextPageToken?: string
      files?: Array<{ id?: string; name?: string; mimeType?: string; modifiedTime?: string }>
    }
    const files: DriveFile[] = (data?.files ?? []).map(f => ({
      id: String(f?.id ?? ''),
      name: f?.name ? String(f.name) : null,
      mimeType: f?.mimeType ? String(f.mimeType) : null,
      modifiedTime: f?.modifiedTime ? String(f.modifiedTime) : null,
    }))
    return { files, nextPageToken: data?.nextPageToken ? String(data.nextPageToken) : null }
  }

  /** Fetch a file's metadata (files.get) — name + mimeType drive the ingest path. */
  async getFileMetadata(accessToken: string, fileId: string): Promise<DriveFileMetadata> {
    const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?fields=id,name,mimeType`
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Google Drive get metadata failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string; name?: string; mimeType?: string }
    return {
      id: String(data?.id ?? fileId),
      name: data?.name ? String(data.name) : null,
      mimeType: data?.mimeType ? String(data.mimeType) : null,
    }
  }

  /** Export a Google-editor doc (Docs/Sheets/Slides) as text (files.export). */
  async exportFileText(accessToken: string, fileId: string, exportMimeType: string): Promise<string> {
    const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMimeType)}`
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Google Drive export failed: ${await readError(res)}`)
    return res.text()
  }

  /** Export a Google-native doc to a binary format (PDF), returned base64. */
  async exportFileBase64(accessToken: string, fileId: string, exportMimeType: string): Promise<string> {
    const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(exportMimeType)}`
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Google Drive export failed: ${await readError(res)}`)
    return Buffer.from(await res.arrayBuffer()).toString('base64')
  }

  /** Download a binary file (e.g. PDF) via alt=media, returned base64-encoded. */
  async downloadFileBase64(accessToken: string, fileId: string): Promise<string> {
    const url = `${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Google Drive download failed: ${await readError(res)}`)
    const buf = Buffer.from(await res.arrayBuffer())
    return buf.toString('base64')
  }

  /** List message ids matching a Gmail search `q` (users.messages.list). */
  async listMessageIds(
    accessToken: string,
    opts: { q: string; maxResults: number },
  ): Promise<Array<{ id: string; threadId: string | null }>> {
    const params = new URLSearchParams({ q: opts.q, maxResults: String(opts.maxResults) })
    const res = await fetch(`${GMAIL_MESSAGES_URL}?${params.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Gmail list messages failed: ${await readError(res)}`)
    const data = (await res.json()) as { messages?: Array<{ id?: string; threadId?: string }> }
    return (data?.messages ?? []).map(m => ({
      id: String(m?.id ?? ''),
      threadId: m?.threadId ? String(m.threadId) : null,
    }))
  }

  /**
   * Fetch one message's METADATA only (format=metadata, Subject/From/To/Date
   * headers). Google still returns `snippet`; the full body is never requested.
   */
  async getMessageMetadata(accessToken: string, messageId: string): Promise<GmailMessageSummary> {
    const params = new URLSearchParams({ format: 'metadata' })
    for (const h of ['Subject', 'From', 'To', 'Date']) params.append('metadataHeaders', h)
    const url = `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}?${params.toString()}`
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Gmail get message failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      id?: string
      threadId?: string
      snippet?: string
      internalDate?: string
      payload?: { headers?: Array<{ name?: string; value?: string }> }
    }
    const headers = data?.payload?.headers
    const dateHeader = headerValue(headers, 'Date')
    // Prefer the epoch `internalDate` (→ ISO 8601): it sorts lexically = chronologically
    // and the UI formats it locale-aware. Fall back to the raw Date header only if absent.
    const internal = data?.internalDate ? new Date(Number(data.internalDate)).toISOString() : null
    return {
      id: String(data?.id ?? messageId),
      threadId: data?.threadId ? String(data.threadId) : null,
      subject: headerValue(headers, 'Subject'),
      from: headerValue(headers, 'From'),
      to: headerValue(headers, 'To'),
      date: internal ?? dateHeader,
      snippet: data?.snippet ? String(data.snippet) : null,
    }
  }

  /** List upcoming events (events.list, single-events, ordered by start time). */
  async listEvents(
    accessToken: string,
    calendarId: string,
    opts: { timeMin: string; maxResults: number; q?: string },
  ): Promise<CalendarEventSummary[]> {
    const params = new URLSearchParams({
      timeMin: opts.timeMin,
      maxResults: String(opts.maxResults),
      singleEvents: 'true',
      orderBy: 'startTime',
    })
    if (opts.q) params.set('q', opts.q)
    const url = `${CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events?${params.toString()}`
    const res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Google Calendar list events failed: ${await readError(res)}`)
    const data = (await res.json()) as { items?: RawGoogleEvent[] }
    return (data?.items ?? []).map(toCalendarEventSummary)
  }

  /** Create a Gmail draft (users.drafts.create) — composed, NOT sent. */
  async createDraft(accessToken: string, raw: string): Promise<CreatedDraft> {
    const res = await fetch(GMAIL_DRAFTS_URL, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ message: { raw } }),
    })
    if (!res.ok) throw new Error(`Gmail create draft failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string; message?: { id?: string; threadId?: string } }
    return {
      id: String(data?.id ?? ''),
      messageId: data?.message?.id ? String(data.message.id) : null,
      threadId: data?.message?.threadId ? String(data.message.threadId) : null,
    }
  }

  /**
   * The connected mailbox's own address (users.getProfile).
   *
   * Not cosmetic: it is the ONLY reliable way to tell an outbound message from
   * an inbound one, and therefore the ground truth behind "who has not replied
   * to me". Guessing from the `SENT` label alone breaks on aliases and on
   * messages the user sent from another client.
   */
  async getProfile(accessToken: string): Promise<{ emailAddress: string | null }> {
    const res = await fetch(GMAIL_PROFILE_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Gmail get profile failed: ${await readError(res)}`)
    const data = (await res.json()) as { emailAddress?: string }
    return { emailAddress: data?.emailAddress ? String(data.emailAddress) : null }
  }

  /**
   * One message's metadata, richer than {@link getMessageMetadata}: recipients,
   * labels and the RFC 5322 `Message-ID` needed to thread a reply.
   *
   * Still `format=metadata` — the body is never requested, so it can neither be
   * logged nor forwarded to a model by accident.
   */
  async getMessageDetail(accessToken: string, messageId: string): Promise<GmailMessageDetail> {
    const params = new URLSearchParams({ format: 'metadata' })
    for (const header of ['Subject', 'From', 'To', 'Cc', 'Date', 'Message-ID', 'References']) {
      params.append('metadataHeaders', header)
    }
    const url = `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}?${params.toString()}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Gmail get message failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      id?: string
      threadId?: string
      snippet?: string
      internalDate?: string
      labelIds?: string[]
      payload?: { headers?: Array<{ name?: string; value?: string }> }
    }
    const headers = data?.payload?.headers
    const internal = data?.internalDate ? new Date(Number(data.internalDate)).toISOString() : null
    return {
      id: String(data?.id ?? messageId),
      threadId: data?.threadId ? String(data.threadId) : null,
      subject: headerValue(headers, 'Subject'),
      from: headerValue(headers, 'From'),
      to: splitAddressList(headerValue(headers, 'To')),
      cc: splitAddressList(headerValue(headers, 'Cc')),
      date: internal ?? headerValue(headers, 'Date'),
      snippet: data?.snippet ? String(data.snippet) : null,
      labelIds: (data?.labelIds ?? []).map(String),
      messageIdHeader: headerValue(headers, 'Message-ID'),
      references: headerValue(headers, 'References'),
    }
  }

  /**
   * The attachments carried by a message.
   *
   * This is the one call that must ask for `format=full`, because Gmail exposes
   * part metadata nowhere else. The response body parts are discarded inside
   * this function and never returned, logged or stored — only filename, MIME
   * type, size and the opaque attachment id leave it.
   */
  async listAttachments(
    accessToken: string,
    messageId: string,
  ): Promise<Array<{ attachmentId: string; filename: string; mimeType: string | null; sizeBytes: number | null }>> {
    const url = `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}?format=full`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Gmail list attachments failed: ${await readError(res)}`)
    const data = (await res.json()) as { payload?: GmailPart }
    const out: Array<{ attachmentId: string; filename: string; mimeType: string | null; sizeBytes: number | null }> = []
    walkParts(data?.payload, part => {
      const attachmentId = part?.body?.attachmentId
      const filename = part?.filename?.trim()
      if (!attachmentId || !filename) return
      out.push({
        attachmentId: String(attachmentId),
        filename,
        mimeType: part?.mimeType ? String(part.mimeType) : null,
        sizeBytes: typeof part?.body?.size === 'number' ? part.body.size : null,
      })
    })
    return out
  }

  /**
   * Le CORPS d'un message (`format=full`).
   *
   * Le seul appel de ce client qui rapporte du texte écrit par un humain, et il
   * n'existe que depuis l'arbitrage du 16/08 : les activités du CRM stockent le
   * corps intégral pour que l'historique survive au changement de messagerie.
   * Partout ailleurs — recherche, non-réponses, brouillons — on reste sur
   * `format=metadata`, parce que ce qu'on ne lit pas ne peut pas fuiter.
   *
   * Rend les deux formes telles que Gmail les donne ; c'est l'appelant
   * (`normalizeMailBody`) qui préfère le texte brut au HTML.
   */
  async getMessageBody(accessToken: string, messageId: string): Promise<{ plain: string | null; html: string | null }> {
    const url = `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}?format=full`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Gmail get message body failed: ${await readError(res)}`)
    const data = (await res.json()) as { payload?: GmailPart }
    let plain: string | null = null
    let html: string | null = null
    walkParts(data?.payload, part => {
      // Une pièce jointe porte un `attachmentId` et pas de données inline : la
      // prendre pour un corps collerait un PDF binaire dans la timeline.
      if (part?.body?.attachmentId) return
      const raw = part?.body?.data
      if (!raw) return
      const mime = String(part?.mimeType ?? '').toLowerCase()
      if (mime.startsWith('text/plain') && plain === null) plain = decodeGmailPart(raw)
      else if (mime.startsWith('text/html') && html === null) html = decodeGmailPart(raw)
    })
    return { plain, html }
  }

  /**
   * #4405.1 / #4417.1 — un FIL entier, corps compris (`threads.get?format=full`), lu PAR SON IDENTIFIANT.
   *
   * Remplace la lecture « chercher les 60 derniers messages puis filtrer sur le fil » : un fil absent de
   * cette fenêtre (plus de 90 jours, ou noyé par les messages plus récents) rendait « introuvable » alors
   * que Gmail le connaît. 404 = fil inconnu → `null`, jamais une erreur. Le corps traverse cette méthode et
   * son appelant (c96) : rien n'est journalisé, conservé ni mis en cache ici.
   */
  async getThreadFull(
    accessToken: string,
    threadId: string,
  ): Promise<Array<{
    id: string
    labelIds: string[]
    date: string | null
    from: string | null
    subject: string | null
    plain: string | null
    html: string | null
  }> | null> {
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?format=full`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Gmail get thread failed: ${res.status} ${await readError(res)}`)
    const data = (await res.json()) as {
      messages?: Array<{
        id?: string
        labelIds?: string[]
        internalDate?: string
        payload?: GmailPart & { headers?: Array<{ name?: string; value?: string }> }
      }>
    }
    return (data?.messages ?? []).map(message => {
      let plain: string | null = null
      let html: string | null = null
      walkParts(message.payload, part => {
        if (part?.body?.attachmentId) return
        const raw = part?.body?.data
        if (!raw) return
        const mime = String(part?.mimeType ?? '').toLowerCase()
        if (mime.startsWith('text/plain') && plain === null) plain = decodeGmailPart(raw)
        else if (mime.startsWith('text/html') && html === null) html = decodeGmailPart(raw)
      })
      const headers = message.payload?.headers
      return {
        id: String(message.id ?? ''),
        labelIds: (message.labelIds ?? []).map(String),
        date: message.internalDate
          ? new Date(Number(message.internalDate)).toISOString()
          : headerValue(headers, 'Date'),
        from: headerValue(headers, 'From'),
        subject: headerValue(headers, 'Subject'),
        plain,
        html,
      }
    })
  }

  /**
   * Télécharge une pièce jointe (users.messages.attachments.get), rendue en
   * base64. L'identifiant vient de {@link listAttachments} : on ne devine jamais
   * un `attachmentId`, on relit celui que Gmail a donné.
   */
  async getAttachmentBase64(accessToken: string, messageId: string, attachmentId: string): Promise<string> {
    const url = `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Gmail get attachment failed: ${await readError(res)}`)
    const data = (await res.json()) as { data?: string }
    // Gmail rend du base64URL ; la conversion en base64 standard est ce que
    // tout le reste de la chaîne (RAG, pièces jointes) attend.
    return Buffer.from(String(data?.data ?? ''), 'base64url').toString('base64')
  }

  /** Read the out-of-office responder (users.settings.getVacation). */
  async getVacation(accessToken: string): Promise<GmailVacationSettings> {
    const res = await fetch(GMAIL_VACATION_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Gmail get vacation failed: ${await readError(res)}`)
    const data = (await res.json()) as Record<string, unknown>
    return {
      enabled: Boolean(data['enableAutoReply']),
      subject: data['responseSubject'] ? String(data['responseSubject']) : null,
      message: data['responseBodyPlainText'] ? String(data['responseBodyPlainText']) : null,
      startsAt: data['startTime'] ? new Date(Number(data['startTime'])).toISOString() : null,
      endsAt: data['endTime'] ? new Date(Number(data['endTime'])).toISOString() : null,
      contactsOnly: Boolean(data['restrictToContacts']),
    }
  }

  /** Write the out-of-office responder (users.settings.updateVacation, PUT). */
  async updateVacation(accessToken: string, input: GmailVacationSettings): Promise<GmailVacationSettings> {
    const payload: Record<string, unknown> = {
      enableAutoReply: input.enabled,
      restrictToContacts: input.contactsOnly,
    }
    if (input.subject) payload['responseSubject'] = input.subject
    if (input.message) payload['responseBodyPlainText'] = input.message
    if (input.startsAt) payload['startTime'] = String(Date.parse(input.startsAt))
    if (input.endsAt) payload['endTime'] = String(Date.parse(input.endsAt))

    const res = await fetch(GMAIL_VACATION_URL, {
      method: 'PUT',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(payload),
    })
    if (!res.ok) throw new Error(`Gmail update vacation failed: ${await readError(res)}`)
    return this.getVacation(accessToken)
  }

  /**
   * The user's REAL signature, taken from their default send-as identity.
   *
   * Garde-fou n°2 of the field reports: never write the word "signature" as a
   * placeholder. A signature we did not read is a signature we must not invent —
   * when this returns null the caller leaves the draft unsigned and says so.
   */
  async getDefaultSignature(accessToken: string): Promise<{ address: string | null; signatureHtml: string | null }> {
    const res = await fetch(GMAIL_SEND_AS_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Gmail list sendAs failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      sendAs?: Array<{ sendAsEmail?: string; isDefault?: boolean; signature?: string }>
    }
    const identities = data?.sendAs ?? []
    const chosen = identities.find(identity => identity?.isDefault) ?? identities[0]
    return {
      address: chosen?.sendAsEmail ? String(chosen.sendAsEmail) : null,
      signatureHtml: chosen?.signature ? String(chosen.signature) : null,
    }
  }

  /** List the mailbox's labels (users.labels.list). */
  async listLabels(accessToken: string): Promise<Array<{ id: string; name: string; type: string | null }>> {
    const res = await fetch(GMAIL_LABELS_URL, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Gmail list labels failed: ${await readError(res)}`)
    const data = (await res.json()) as { labels?: Array<{ id?: string; name?: string; type?: string }> }
    return (data?.labels ?? []).map(label => ({
      id: String(label?.id ?? ''),
      name: String(label?.name ?? ''),
      type: label?.type ? String(label.type) : null,
    }))
  }

  /** Create a label (users.labels.create) — idempotence is the caller's job. */
  async createLabel(accessToken: string, name: string): Promise<{ id: string; name: string }> {
    const res = await fetch(GMAIL_LABELS_URL, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }),
    })
    if (!res.ok) throw new Error(`Gmail create label failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string; name?: string }
    return { id: String(data?.id ?? ''), name: String(data?.name ?? name) }
  }

  /**
   * APPLY labels to a message, and optionally archive it (users.messages.modify).
   *
   * Requires the RESTRICTED `gmail.modify` scope. The caller checks the
   * capability first — a 403 here means someone bypassed that check, and the
   * error is surfaced rather than swallowed.
   *
   * Archiving = removing `INBOX`. It is NOT a deletion, and this client has no
   * way to delete: `users.messages.delete` is deliberately absent. A tool that
   * can tidy a mailbox should not be able to empty it.
   */
  async modifyMessage(
    accessToken: string,
    messageId: string,
    input: { addLabelIds?: string[]; archive?: boolean },
  ): Promise<{ id: string; labelIds: string[] }> {
    const removeLabelIds = input.archive ? ['INBOX'] : []
    const res = await fetch(`${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}/modify`, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({
        addLabelIds: input.addLabelIds ?? [],
        removeLabelIds,
      }),
    })
    if (!res.ok) throw new Error(`Gmail modify message failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string; labelIds?: string[] }
    return { id: String(data?.id ?? messageId), labelIds: Array.isArray(data?.labelIds) ? data.labelIds : [] }
  }

  /**
   * Create a draft INSIDE an existing thread. Passing `threadId` is what makes
   * Gmail show the draft under the conversation instead of on its own.
   */
  async createDraftInThread(accessToken: string, raw: string, threadId?: string): Promise<CreatedDraft> {
    const message: Record<string, unknown> = { raw }
    if (threadId) message['threadId'] = threadId
    const res = await fetch(GMAIL_DRAFTS_URL, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify({ message }),
    })
    if (!res.ok) throw new Error(`Gmail create draft failed: ${await readError(res)}`)
    const data = (await res.json()) as { id?: string; message?: { id?: string; threadId?: string } }
    return {
      id: String(data?.id ?? ''),
      messageId: data?.message?.id ? String(data.message.id) : null,
      threadId: data?.message?.threadId ? String(data.message.threadId) : null,
    }
  }

  /**
   * #4417.1 — l'ancre de réponse d'un fil : le `Message-ID` RFC 5322 de son DERNIER message et ses
   * `References`. `format=metadata` : aucun corps n'est demandé. Sans ces en-têtes, un brouillon
   * déposé avec seulement `threadId` ouvre une nouvelle conversation chez le destinataire.
   */
  async getThreadReplyAnchor(
    accessToken: string,
    threadId: string,
  ): Promise<{ messageId: string | null; references: string | null }> {
    const params = new URLSearchParams({ format: 'metadata' })
    for (const header of ['Message-ID', 'References']) params.append('metadataHeaders', header)
    const url = `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}?${params.toString()}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
    if (!res.ok) throw new Error(`Gmail get thread failed: ${await readError(res)}`)
    const data = (await res.json()) as {
      messages?: Array<{ payload?: { headers?: Array<{ name?: string; value?: string }> } }>
    }
    const last = data?.messages?.[data.messages.length - 1]
    return {
      messageId: headerValue(last?.payload?.headers, 'Message-ID'),
      references: headerValue(last?.payload?.headers, 'References'),
    }
  }

  /**
   * Delete a draft (#2277.34, épopée #2771). `drafts/{id}` is a SEPARATE id
   * space from `messages/{id}` — this can never reach a sent/received
   * message, even given the wrong id (it 404s instead). 404 is read as
   * "already gone", not an error: a rollback replayed on an already-deleted
   * draft is a no-op, never a failure.
   */
  async deleteDraft(accessToken: string, draftId: string): Promise<{ deleted: boolean }> {
    const res = await fetch(`${GMAIL_DRAFTS_URL}/${encodeURIComponent(draftId)}`, {
      method: 'DELETE',
      headers: this.authHeaders(accessToken),
    })
    if (res.status === 404) return { deleted: false }
    if (!res.ok) throw new Error(`Gmail delete draft failed: ${await readError(res)}`)
    return { deleted: true }
  }

  /**
   * The user's calendar list — their own, the team's, any shared one.
   *
   * `minAccessRole=reader` drops the calendars they cannot even read: offering
   * one in a picker that then returns 403 is worse than not offering it.
   */
  async listCalendarList(accessToken: string): Promise<RawGoogleCalendarListEntry[]> {
    const params = new URLSearchParams({ minAccessRole: 'reader', maxResults: '250', showHidden: 'false' })
    const res = await fetch(`${CALENDAR_LIST_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`Google Calendar list calendars failed: ${await readError(res)}`)
    const data = (await res.json()) as { items?: RawGoogleCalendarListEntry[] }
    return Array.isArray(data?.items) ? data.items : []
  }

  /**
   * List events over a bounded window. `showDeleted` surfaces the cancelled
   * ones, which is the whole point of the "client cancelled → propose three
   * slots" trigger: an event that vanished silently cannot be replanned.
   */
  async listEventsInRange(
    accessToken: string,
    calendarId: string,
    opts: { timeMin: string; timeMax: string; maxResults: number; q?: string; showDeleted?: boolean },
  ): Promise<CalendarEventSummary[]> {
    const collected: CalendarEventSummary[] = []
    let pageToken: string | undefined
    // #4065.7 — Google peut rendre une page plus COURTE que `maxResults` avec un `nextPageToken` :
    // l'ignorer laissait une fenêtre de 15 jours « partielle » sans le dire. On lit jusqu'au bout,
    // borné par `maxResults` (le plafond demandé) et par `CALENDAR_MAX_PAGES` (garde-fou).
    for (let page = 0; page < CALENDAR_MAX_PAGES && collected.length < opts.maxResults; page += 1) {
      const params = new URLSearchParams({
        timeMin: opts.timeMin,
        timeMax: opts.timeMax,
        maxResults: String(opts.maxResults - collected.length),
        singleEvents: 'true',
        orderBy: 'startTime',
      })
      if (opts.q) params.set('q', opts.q)
      if (opts.showDeleted) params.set('showDeleted', 'true')
      if (pageToken) params.set('pageToken', pageToken)
      const url = `${CALENDAR_BASE}/${encodeURIComponent(calendarId)}/events?${params.toString()}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      if (!res.ok) throw new Error(`Google Calendar list events failed: ${await readError(res)}`)
      const data = (await res.json()) as { items?: RawGoogleEvent[]; nextPageToken?: string }
      collected.push(...(data?.items ?? []).map(toCalendarEventSummary))
      pageToken = data?.nextPageToken
      if (!pageToken) break
    }
    return collected.slice(0, opts.maxResults)
  }

  /** Create a spreadsheet in the user's Drive, pre-filled with a grid of strings. */
  async createSpreadsheet(
    accessToken: string,
    input: { title: string; sheetTitle: string; rows: string[][] },
  ): Promise<CreatedSpreadsheet> {
    const rowData = input.rows.map(row => ({
      values: row.map(cell => ({ userEnteredValue: { stringValue: cell } })),
    }))
    const body = {
      properties: { title: input.title },
      sheets: [
        {
          properties: { title: input.sheetTitle },
          data: [{ startRow: 0, startColumn: 0, rowData }],
        },
      ],
    }
    const res = await fetch(SHEETS_URL, {
      method: 'POST',
      headers: this.authHeaders(accessToken),
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`Google Sheets create failed: ${await readError(res)}`)
    const data = (await res.json()) as { spreadsheetId?: string; spreadsheetUrl?: string }
    return {
      spreadsheetId: String(data?.spreadsheetId ?? ''),
      spreadsheetUrl: data?.spreadsheetUrl ? String(data.spreadsheetUrl) : null,
    }
  }
}
