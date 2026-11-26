import { apiFetch } from '@/lib/api'

/**
 * Ce que le jeton Microsoft autorise vraiment. Même règle que Google et le CRM :
 * les portées viennent du consentement, donc un compte branché avant l'ajout
 * d'une portée garde sa concession étroite. Sans cette information, la recherche
 * documentaire rendait une liste vide qui se lisait « tu n'as aucun document ».
 */
export type MicrosoftCapabilities = {
  mailSend: boolean
  mailRead: boolean
  mailDraft: boolean
  calendar: boolean
  mailboxSettings: boolean
  files: boolean
}

export type MicrosoftStatus = {
  configured: boolean
  connected: boolean
  provider?: 'microsoft'
  accountLabel?: string | null
  connectedAt?: string
  scopes?: string | null
  capabilities?: MicrosoftCapabilities
}

/**
 * #4546.4 — UNE boîte Outlook connectée (`GET /microsoft/connections`). `accountLabel` est `null` quand le fournisseur
 * n'a pas dit laquelle — jamais deviné. Les capacités sont celles des portées RENDUES pour CETTE boîte (#4546.7).
 */
export type MicrosoftConnection = {
  id: string
  accountLabel: string | null
  connectedAt: string | null
  capabilities: MicrosoftCapabilities
}

/** An Outlook attendee — Graph wants `{ email, name? }`, unlike Google's flat email list. */
type OutlookEventAttendee = { email: string; name?: string }

/**
 * Create an Outlook calendar event. Unlike Google (where `endDateTime` defaults
 * server-side), Microsoft Graph requires BOTH `start` and `end` — the UI computes
 * a sensible `end` before calling.
 */
export type OutlookCalendarEventInput = {
  subject: string
  start: string
  end: string
  body?: string
  bodyType?: 'Text' | 'HTML'
  timeZone?: string
  location?: string
  attendees?: OutlookEventAttendee[]
}

type OutlookCalendarEventResult = { id: string; webLink: string | null }

export const microsoftApi = {
  status(): Promise<MicrosoftStatus> {
    return apiFetch<MicrosoftStatus>({ path: '/microsoft/status' })
  },
  /** Returns the Microsoft (Azure AD) consent URL to redirect the browser to. */
  connectUrl(): Promise<{ url: string }> {
    return apiFetch<{ url: string }>({ path: '/microsoft/authorize' })
  },
  /** #4546.4 — toutes les boîtes Outlook du commercial. */
  connections(): Promise<MicrosoftConnection[]> {
    return apiFetch<MicrosoftConnection[]>({ path: '/microsoft/connections' })
  },
  /**
   * Sans identifiant : le débranchement d'avant (la carte). #4546.4 — avec `connectionId`, UNE boîte seulement
   * (`DELETE /microsoft/:connectionId`), les autres restent branchées.
   */
  disconnect(connectionId?: string): Promise<void> {
    return apiFetch<void>({
      path: connectionId ? `/microsoft/${encodeURIComponent(connectionId)}` : '/microsoft',
      method: 'DELETE',
    })
  },

  // L'envoi passe par `/mailbox/*`, seul chemin qui porte l'opt-out et
  // l'idempotence — voir `features/mailbox/api.ts`.
  /** Create an event / follow-up reminder on the connected Outlook calendar. */
  createCalendarEvent(input: OutlookCalendarEventInput): Promise<OutlookCalendarEventResult> {
    return apiFetch<OutlookCalendarEventResult, OutlookCalendarEventInput>({
      path: '/microsoft/calendar/events',
      method: 'POST',
      body: input,
    })
  },
}
