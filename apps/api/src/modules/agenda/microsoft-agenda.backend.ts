import { Injectable } from '@nestjs/common'
import type {
  AgendaCalendar,
  AgendaEvent,
  AgendaEventDraft,
  AgendaReschedule,
  AgendaRescheduleResult,
  AgendaStatus,
} from '@bellum/contracts'
import { CALENDARS_RW_SCOPE, MicrosoftService, PLACE_READ_SCOPE } from '../microsoft/microsoft.service'
import { dropSelfAttendees } from '../../common/util/self-invite'
import {
  isExternalAddress,
  isPrivateAgendaEvent,
  maskPrivateAgendaEvent,
  type AgendaBackend,
  type AgendaCreateResult,
} from './agenda-backend'

/** L'agenda Outlook derrière la même interface. */
@Injectable()
export class MicrosoftAgendaBackend implements AgendaBackend {
  constructor(private readonly microsoft: MicrosoftService) {}

  async status(userId: string): Promise<AgendaStatus | null> {
    if (!this.microsoft.isConfigured()) return null
    const status = await this.microsoft.getStatus(userId)
    if (!status.connected) return null
    const granted = await this.microsoft.grantedScopes(userId)
    const canWrite = granted.has(CALENDARS_RW_SCOPE)
    return {
      connected: true,
      provider: 'microsoft',
      // `Calendars.ReadWrite` porte les deux ; `Calendars.Read` seul ne donne que la lecture.
      capabilities: {
        read: canWrite || granted.has('Calendars.Read'),
        write: canWrite,
        // Ce fournisseur PRÉVIENT TOUJOURS les invités quand l'organisateur
        // modifie un rendez-vous, et n'expose aucun moyen de l'en empêcher —
        // contrairement à l'autre, qui accepte un déplacement silencieux.
        // L'écran désactive donc la case et dit pourquoi, plutôt que d'offrir
        // un choix qui ne serait pas honoré.
        silentReschedule: false,
        // #2101.29 — ce fournisseur ne pose pas le rappel choisi à la
        // création (aucun `reminderMinutes` transmis à Microsoft Graph
        // aujourd'hui) : proposer le choix ici promettrait un réglage qui ne
        // serait pas honoré.
        customReminder: false,
        // #2101.26 — Microsoft Graph n'accepte pas de RRULE brute à la
        // création : son `recurrence` est un objet structuré `pattern`/
        // `range` (un contrat DISTINCT de celui posé par `agendaEventDraftSchema`,
        // jamais vérifié ici — un contrat d'API non vérifiable ne se devine
        // pas). Même motif que `customReminder` : proposer le champ
        // promettrait un réglage que ce fournisseur ignorerait.
        recurrence: false,
      },
    }
  }

  /** Les agendas de cette boîte : le principal, ceux créés, ceux partagés. */
  async listCalendars(userId: string): Promise<AgendaCalendar[]> {
    const { client, accessToken } = await this.microsoft.authorize(userId)
    const calendars = await client.listCalendars(accessToken)
    return calendars
      .filter(calendar => calendar.id)
      .map(calendar => ({
        id: String(calendar.id),
        name: calendar.name?.trim() || String(calendar.id),
        provider: 'microsoft' as const,
        primary: Boolean(calendar.isDefaultCalendar),
        canWrite: Boolean(calendar.canEdit),
      }))
  }

  async listEvents(
    userId: string,
    window: { from: string; to: string; query?: string; limit: number; calendarId?: string },
  ): Promise<AgendaEvent[]> {
    const { client, accessToken } = await this.microsoft.authorize(userId)
    const status = await this.microsoft.getStatus(userId)
    const ownAddress = status.accountLabel ?? null

    const events = await client.listCalendarView(accessToken, {
      start: window.from,
      end: window.to,
      top: window.limit,
      ...(window.calendarId ? { calendarId: window.calendarId } : {}),
    })

    // `calendarView` n'accepte pas de recherche plein texte : Graph veut un
    // `$filter`, incompatible avec la fenêtre déjà exprimée en paramètres. Le
    // filtre se fait donc ici, sur le libellé et les participants — ce que
    // l'utilisateur attend quand il tape le nom d'un compte.
    const needle = window.query?.trim().toLowerCase()
    const filtered = needle
      ? events.filter(event =>
          `${event.subject ?? ''} ${event.attendees.map(a => a.email).join(' ')}`.toLowerCase().includes(needle),
        )
      : events // #2390.16 — privé : créneau seul, masqué plus bas

    // #2390.9 — la capacité d'une salle ne se lit que si la portée `Place.Read.All`
    // a été accordée ; sinon aucun appel, aucun champ.
    const roomEmails = [
      ...new Set(filtered.flatMap(event => event.attendees.filter(a => a.resource).map(a => a.email))),
    ]
    const capacities = new Map<string, number>()
    if (roomEmails.length > 0 && (await this.microsoft.grantedScopes(userId)).has(PLACE_READ_SCOPE)) {
      await Promise.all(
        roomEmails.map(async email => {
          const capacity = await client.getRoomCapacity(accessToken, email).catch(() => null)
          if (capacity !== null) capacities.set(email, capacity)
        }),
      )
    }

    return filtered.map(event => {
      const attendees = event.attendees.map(attendee => ({
        email: attendee.email,
        displayName: attendee.displayName,
        responseStatus: attendee.responseStatus,
        external: isExternalAddress(attendee.email, ownAddress),
        // #2390.9 — `resource: true` quand Graph marque cet invité comme une salle.
        resource: attendee.resource,
        ...(capacities.has(attendee.email) ? { capacity: capacities.get(attendee.email) } : {}),
      }))
      const mapped: AgendaEvent = {
        id: event.id,
        summary: event.subject,
        description: event.preview,
        location: event.location,
        start: event.start,
        end: event.end,
        organizer: event.organizer,
        attendees,
        conferenceUrl: event.conferenceUrl,
        webUrl: event.webUrl,
        status: event.cancelled ? 'cancelled' : 'confirmed',
        isExternal: attendees.some(attendee => attendee.external),
        cancelled: event.cancelled,
        // #2319.10 / #2319.18 — `private` est déjà exclu par le filtre
        // ci-dessus ; ce qui reste (`normal`/`personal`/`confidential`) voyage
        // BRUT, `normalizeAgendaEventVisibility` (@bellum/contracts) le lit.
        visibility: event.sensitivity,
        // #2103.29 — `seriesMasterId` n'existe que sur une occurrence/exception.
        recurring: Boolean(event.seriesMasterId),
        // Google seul porte `eventType` ; Graph n'a pas de champ « nature »
        // équivalent sur la ressource `event` (voir `showAs` ci-dessous).
        providerEventType: null,
        // #2390.6 — brut, toujours rendu par Graph.
        showAs: event.showAs,
      }
      return isPrivateAgendaEvent(event.sensitivity) ? maskPrivateAgendaEvent(mapped) : mapped
    })
  }

  async createEvent(userId: string, draft: AgendaEventDraft): Promise<AgendaCreateResult> {
    const { client, accessToken } = await this.microsoft.authorize(userId)
    const status = await this.microsoft.getStatus(userId)
    const attendees = dropSelfAttendees(draft.attendees, status.accountLabel ?? null)

    const created = await client.createEvent(accessToken, {
      subject: draft.summary,
      start: draft.startsAt,
      end: draft.endsAt,
      timeZone: 'UTC',
      ...(draft.description ? { body: draft.description, bodyType: 'Text' as const } : {}),
      ...(attendees.length ? { attendees: attendees.map(email => ({ email })) } : {}),
      // #2101.27 — absent, l'appel reste sur `/me/events`, comportement inchangé.
      ...(draft.calendarId ? { calendarId: draft.calendarId } : {}),
    })

    return {
      id: created.id,
      webUrl: created.webLink,
      // Graph crée un lien Teams via `isOnlineMeeting`, qui exige une licence
      // Teams sur le tenant. On ne le promet donc pas : mieux vaut « pas de lien
      // visio » que « lien visio » suivi d'une erreur 403 au moment de l'envoi.
      conferenceUrl: null,
      attendees,
    }
  }

  async rescheduleEvent(userId: string, input: AgendaReschedule): Promise<AgendaRescheduleResult> {
    const { client, accessToken } = await this.microsoft.authorize(userId)
    const moved = await client.updateEventSchedule(accessToken, input.eventId, {
      start: input.startsAt,
      end: input.endsAt,
      timeZone: 'UTC',
    })
    return {
      id: moved.id,
      startsAt: moved.startsAt,
      endsAt: moved.endsAt,
      // TOUJOURS `true`, quoi qu'ait demandé l'appelant : ce fournisseur envoie
      // la mise à jour aux invités et ne sait pas s'en abstenir. Renvoyer la
      // demande de l'appelant ferait croire à une discrétion qui n'a pas eu
      // lieu — exactement ce qu'un commercial ne doit pas découvrir après coup.
      guestsNotified: true,
    }
  }

  async deleteEvent(userId: string, eventId: string): Promise<void> {
    const { client, accessToken } = await this.microsoft.authorize(userId)
    await client.deleteEvent(accessToken, eventId)
  }
}
