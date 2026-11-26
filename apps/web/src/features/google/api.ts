import type { OAuthAccessLevel } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/**
 * Which Google capabilities the connected token actually unlocks — derived
 * server-side from the scopes the user GRANTED (not what we requested). A mailbox
 * connected before a scope was added keeps the old grant, so the matching flag
 * stays false and the UI greys the feature behind a "reconnect to activate" CTA.
 */
export type GoogleCapabilities = {
  calendar: boolean
  calendarRead: boolean
  gmail: boolean
  gmailRead: boolean
  gmailDraft: boolean
  drive: boolean
  sheets: boolean
}

export type GoogleStatus = {
  configured: boolean
  connected: boolean
  provider?: 'google'
  accountLabel?: string | null
  connectedAt?: string
  scopes?: string | null
  capabilities?: GoogleCapabilities
  /** #2078.23 — le niveau ACCORDÉ, dérivé des portées rendues ; `null` quand on les ignore. */
  accessLevel?: OAuthAccessLevel | null
}

/**
 * #4546.4 — UNE boîte Google connectée (`GET /google/connections`). L'API en rend plusieurs : un commercial peut
 * brancher plusieurs boîtes. `accountLabel` est `null` quand le fournisseur n'a pas dit laquelle — jamais deviné.
 */
export type GoogleConnection = {
  id: string
  accountLabel: string | null
  externalAccountId: string | null
  connectedAt: string | null
  scopes: string | null
  capabilities: GoogleCapabilities
  scopeType: 'personal' | 'inherited_shared' | null
}

type CalendarEventAttendee = {
  email: string
  displayName: string | null
  responseStatus: string | null
}

export type CalendarEventSummary = {
  id: string
  summary: string | null
  description: string | null
  location: string | null
  htmlLink: string | null
  start: string | null
  end: string | null
  attendees: CalendarEventAttendee[]
}

type CreatedCalendarEvent = { id: string; htmlLink: string | null; status: string | null }
type CreatedSpreadsheet = { spreadsheetId: string; spreadsheetUrl: string | null }

export type DriveFile = {
  id: string
  name: string | null
  mimeType: string | null
  modifiedTime: string | null
}
type DriveFilePage = { files: DriveFile[]; nextPageToken: string | null }

/**
 * La réponse QUALIFIÉE de la recherche par contenu (`connectorSearchResult`).
 *
 * `searched: true` distingue « il n'y avait rien » de « je n'ai pas pu regarder » :
 * un 200 dit que la recherche est partie, un 503 dit pourquoi elle n'a pas pu.
 * `scanned` vaut `null` quand Drive ne dit pas combien il a parcouru — on ne
 * l'invente pas.
 */
type DriveSearchPage = {
  items: DriveFile[]
  searched: true
  scanned: number | null
  nextPageToken: string | null
}

export type CreateCalendarEventInput = {
  summary: string
  startDateTime: string
  endDateTime?: string
  description?: string
  attendees?: string[]
  link?: string
}

export type ExportSheetInput = { title: string; columns: string[]; rows: string[][] }

function query(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') qs.set(key, String(value))
  }
  const str = qs.toString()
  return str ? `?${str}` : ''
}

export const googleApi = {
  status(): Promise<GoogleStatus> {
    return apiFetch<GoogleStatus>({ path: '/google/status' })
  },
  /**
   * Returns the Google consent URL to redirect the browser to.
   * #2078.23 — le niveau est OBLIGATOIRE : un écran qui propose de (re)connecter
   * le calcule avec `accessLevelToRequest`, jamais par défaut.
   */
  connectUrl(level: OAuthAccessLevel): Promise<{ url: string }> {
    return apiFetch<{ url: string }>({ path: `/google/authorize?level=${encodeURIComponent(level)}` })
  },
  /** #4546.4 — toutes les boîtes du commercial. */
  connections(): Promise<GoogleConnection[]> {
    return apiFetch<GoogleConnection[]>({ path: '/google/connections' })
  },
  /**
   * Sans identifiant : le débranchement d'avant (la carte). #4546.4 — avec `connectionId`, UNE boîte seulement
   * (`DELETE /google/:connectionId`), les autres restent branchées.
   */
  disconnect(connectionId?: string): Promise<void> {
    return apiFetch<void>({
      path: connectionId ? `/google/${encodeURIComponent(connectionId)}` : '/google',
      method: 'DELETE',
    })
  },

  // La messagerie passe par `/mailbox/*` (capacité, pas éditeur) : c'est là que
  // vivent l'opt-out, l'idempotence et la signature. Un second chemin d'envoi
  // ici les contournerait.

  createCalendarEvent(input: CreateCalendarEventInput): Promise<CreatedCalendarEvent> {
    return apiFetch<CreatedCalendarEvent, CreateCalendarEventInput>({
      path: '/google/calendar/events',
      method: 'POST',
      body: input,
    })
  },
  /** Upcoming events, optionally filtered by an account domain / name. */
  async upcomingEvents(input: { query?: string; maxResults?: number } = {}): Promise<CalendarEventSummary[]> {
    // Réponse QUALIFIÉE depuis le PDF 7 : un 200 dit que la lecture a eu lieu,
    // un 503 dit pourquoi elle n'a pas pu. Le 16/08, un agenda plein s'est
    // affiché vide parce que les deux se ressemblaient.
    const page = await apiFetch<{ items: CalendarEventSummary[]; searched: true; scanned: number | null }>({
      path: `/google/calendar/events/upcoming${query({ query: input.query, maxResults: input.maxResults })}`,
    })
    return page.items
  },

  driveFiles(input: { search?: string; pageToken?: string; pageSize?: number } = {}): Promise<DriveFilePage> {
    return apiFetch<DriveFilePage>({
      path: `/google/drive/files${query({ search: input.search, pageToken: input.pageToken, pageSize: input.pageSize })}`,
    })
  },
  /**
   * Cherche dans le CONTENU des documents, pas seulement dans leur nom.
   *
   * `driveFiles` filtre sur le NOM (`name contains`) ; cette route-ci emploie
   * `fullText contains`, qui couvre le texte indexé. Un CV s'appelle
   * `CV_2024_v3.pdf` et une proposition `Proposition_ACME_v3.pdf` : chercher
   * « Java » ou « Kubernetes » dans les NOMS ne rend jamais rien, et
   * l'utilisateur en conclut qu'il n'a pas le document.
   *
   * ⚠ Le serveur exige `q` d'au moins 2 caractères (`driveSearchQuerySchema`).
   */
  driveSearch(input: { q: string; pageSize?: number }): Promise<DriveSearchPage> {
    return apiFetch<DriveSearchPage>({
      path: `/google/drive/search${query({ q: input.q, pageSize: input.pageSize })}`,
    })
  },
  driveIngest(fileId: string): Promise<{ success: boolean; data: Record<string, unknown> }> {
    return apiFetch<{ success: boolean; data: Record<string, unknown> }, { fileId: string }>({
      path: '/google/drive/ingest',
      method: 'POST',
      body: { fileId },
    })
  },

  exportSheet(input: ExportSheetInput): Promise<CreatedSpreadsheet> {
    return apiFetch<CreatedSpreadsheet, ExportSheetInput>({
      path: '/google/sheets/export',
      method: 'POST',
      body: input,
    })
  },
}
