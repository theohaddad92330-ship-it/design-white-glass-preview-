import { Injectable } from '@nestjs/common'
import type {
  AgendaCalendar,
  AgendaEvent,
  AgendaEventDraft,
  AgendaReschedule,
  AgendaRescheduleResult,
  AgendaStatus,
} from '@bellum/contracts'
import { GoogleService } from '../google/google.service'
import {
  isExternalAddress,
  isPrivateAgendaEvent,
  maskPrivateAgendaEvent,
  type AgendaBackend,
  type AgendaCreateResult,
} from './agenda-backend'

/** L'agenda Google derrière l'interface `AgendaBackend`. */
@Injectable()
export class GoogleAgendaBackend implements AgendaBackend {
  constructor(private readonly google: GoogleService) {}

  async status(userId: string): Promise<AgendaStatus | null> {
    if (!this.google.isConfigured()) return null
    const status = await this.google.getStatus(userId)
    if (!status.connected) return null
    return {
      connected: true,
      provider: 'google',
      capabilities: {
        read: Boolean(status.capabilities?.calendarRead),
        write: Boolean(status.capabilities?.calendar),
        // Ce fournisseur accepte de ne PAS prévenir les invités d'une
        // modification : la case « prévenir » de l'écran sera donc honorée.
        silentReschedule: true,
        // #2101.29 — ce fournisseur POSE réellement le rappel choisi sur
        // l'évènement créé (`google.service.ts`, `reminders.overrides`) :
        // l'écran peut donc proposer le choix.
        customReminder: true,
        // #2101.26 — ce fournisseur POSE réellement la RRULE fournie sur
        // l'évènement créé (`google.service.ts`, `event.recurrence`).
        recurrence: true,
      },
    }
  }

  /**
   * Les agendas visibles du compte.
   *
   * Un agenda supprimé est écarté, et un agenda dont on ne peut lire que le
   * « libre/occupé » (`freeBusyReader`) aussi : il ne rend aucun titre, donc il
   * n'y a rien à afficher — le proposer promettrait une liste toujours vide.
   */
  async listCalendars(userId: string): Promise<AgendaCalendar[]> {
    const { client, accessToken } = await this.google.authorize(userId)
    const entries = await client.listCalendarList(accessToken)
    return entries
      .filter(entry => entry.id && !entry.deleted && entry.accessRole !== 'freeBusyReader')
      .map(entry => ({
        id: String(entry.id),
        // `summaryOverride` est le nom que l'utilisateur a lui-même donné à
        // l'agenda : c'est celui qu'il reconnaît dans son propre écran.
        name: entry.summaryOverride?.trim() || entry.summary?.trim() || String(entry.id),
        provider: 'google' as const,
        primary: Boolean(entry.primary),
        canWrite: entry.accessRole === 'writer' || entry.accessRole === 'owner',
      }))
  }

  async listEvents(
    userId: string,
    window: { from: string; to: string; query?: string; limit: number; calendarId?: string },
  ): Promise<AgendaEvent[]> {
    const { client, accessToken } = await this.google.authorize(userId)
    const status = await this.google.getStatus(userId)
    const ownAddress = status.accountLabel ?? null

    const events = await client.listEventsInRange(accessToken, window.calendarId ?? 'primary', {
      timeMin: window.from,
      timeMax: window.to,
      maxResults: window.limit,
      // `showDeleted` est ce qui rend le déclencheur « le client a annulé »
      // possible : un évènement disparu en silence ne peut pas être replanifié.
      showDeleted: true,
      ...(window.query ? { q: window.query } : {}),
    })

    // #2390.16 — un évènement marqué privé ne garde que son créneau (« indisponible »).
    return events.map(event => {
      const attendees = event.attendees.map(attendee => ({
        email: attendee.email,
        displayName: attendee.displayName,
        responseStatus: attendee.responseStatus,
        external: isExternalAddress(attendee.email, ownAddress),
        // #2390.9 — `resource: true` quand Google marque cet invité comme une salle.
        resource: attendee.resource,
      }))
      const mapped: AgendaEvent = {
        id: event.id,
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: event.start,
        end: event.end,
        organizer: event.organizer,
        attendees,
        conferenceUrl: event.conferenceUrl,
        webUrl: event.htmlLink,
        status: event.status,
        isExternal: attendees.some(attendee => attendee.external),
        cancelled: event.status === 'cancelled',
        // #2319.10 / #2319.18 — `private` est déjà exclu par le filtre
        // ci-dessus ; ce qui reste (`default`/`public`/`confidential`) voyage
        // BRUT, `normalizeAgendaEventVisibility` (@bellum/contracts) le lit.
        visibility: event.visibility,
        // #2103.29 — `recurringEventId` n'existe que sur une OCCURRENCE.
        recurring: Boolean(event.recurringEventId),
        // #2390.1 / #2390.6 — nature brute, toujours rendue par Google.
        providerEventType: event.eventType,
        // Microsoft seul porte `showAs` ; Google n'a pas d'équivalent PAR
        // évènement (voir `providerEventType`).
        showAs: null,
      }
      return isPrivateAgendaEvent(event.visibility) ? maskPrivateAgendaEvent(mapped) : mapped
    })
  }

  async createEvent(userId: string, draft: AgendaEventDraft): Promise<AgendaCreateResult> {
    const created = await this.google.createCalendarEvent(userId, {
      summary: draft.summary,
      startDateTime: draft.startsAt,
      endDateTime: draft.endsAt,
      ...(draft.description ? { description: draft.description } : {}),
      attendees: draft.attendees,
      addConferencing: draft.addConferencing,
      reminderMinutes: draft.reminderMinutes,
      // #2101.27 — absent, `createCalendarEvent` retombe déjà sur `DEFAULT_CALENDAR_ID`.
      ...(draft.calendarId ? { calendarId: draft.calendarId } : {}),
      // #2101.26 — validé en amont par `AgendaService.createEvent` contre la capacité.
      ...(draft.recurrence ? { recurrence: draft.recurrence } : {}),
    })
    return {
      id: created.id,
      webUrl: created.htmlLink,
      conferenceUrl: created.conferenceUrl,
      attendees: draft.attendees,
    }
  }

  async rescheduleEvent(userId: string, input: AgendaReschedule): Promise<AgendaRescheduleResult> {
    const moved = await this.google.rescheduleCalendarEvent(userId, input)
    return {
      id: moved.id,
      startsAt: moved.startsAt,
      endsAt: moved.endsAt,
      // Ce que l'appelant a demandé EST ce qui s'est passé : le fournisseur
      // honore le silence.
      guestsNotified: input.notifyGuests,
    }
  }

  async deleteEvent(userId: string, eventId: string): Promise<void> {
    await this.google.deleteCalendarEvent(userId, eventId)
  }
}
