import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { AgendaCalendar, AgendaEvent, AgendaEventDraft, AgendaStatus } from '@bellum/contracts'
import type { ProfileEntity } from '../../database/entities/profile.entity'
import { agendaProviderSchema, toolFamiliesOf } from '@bellum/contracts'
import { TOOL_CATALOG } from '../tool-registry/tool-catalog'
import { AGENDA_TOOL_PROVIDERS, agendaProvidersExcludedBy, type AgendaBackend } from './agenda-backend'
import { AgendaService, agendaReadFailure } from './agenda.service'

/**
 * Le choix d'agenda.
 *
 * Ce qui se teste ici n'est pas « appelle-t-on le bon SDK » mais les trois
 * décisions qui, prises de travers, produisent un écran faux sans rien dire :
 * quel agenda est lu, ce qu'on répond quand un fournisseur ne répond pas, et ce
 * qu'on accepte d'enregistrer comme choix.
 */

type Call = { userId: string; window: { calendarId?: string } }

function backend(
  provider: 'google' | 'microsoft',
  options: {
    connected?: boolean
    read?: boolean
    calendars?: AgendaCalendar[]
    calendarsThrow?: boolean
    eventsThrow?: boolean
    /** Ce que rend chaque agenda, par identifiant. */
    eventsByCalendar?: Record<string, AgendaEvent[]>
    /** Identifiants d'agenda dont la lecture échoue (les autres répondent). */
    failingCalendars?: string[]
    calls?: Call[]
    write?: boolean
    /** Le fournisseur sait-il déplacer sans prévenir les invités ? */
    silentReschedule?: boolean
    /** Les déplacements demandés, pour vérifier ce qui part réellement. */
    moves?: Array<{ eventId: string; notifyGuests: boolean }>
    /** #2101.26 — le fournisseur sait-il poser une RRULE à la création ? */
    recurrence?: boolean
    /** Les brouillons reçus par `createEvent`, pour vérifier ce qui part réellement. */
    created?: AgendaEventDraft[]
    /** Les identifiants reçus par `deleteEvent` — #2770.52. */
    deleted?: string[]
    deleteThrows?: boolean
  } = {},
): AgendaBackend {
  const status: AgendaStatus | null =
    options.connected === false
      ? null
      : {
          connected: true,
          provider,
          capabilities: {
            read: options.read ?? true,
            write: options.write ?? true,
            silentReschedule: options.silentReschedule ?? true,
            ...(options.recurrence === undefined ? {} : { recurrence: options.recurrence }),
          },
        }
  return {
    status: async () => status,
    listCalendars: async () => {
      if (options.calendarsThrow) throw new Error('provider down')
      return options.calendars ?? []
    },
    listEvents: async (userId, window) => {
      options.calls?.push({ userId, window })
      if (options.eventsThrow) throw new Error(`${provider} calendar API disabled`)
      if (window.calendarId && options.failingCalendars?.includes(window.calendarId)) {
        throw new Error(`${window.calendarId} unreachable`)
      }
      return (window.calendarId ? options.eventsByCalendar?.[window.calendarId] : undefined) ?? []
    },
    createEvent: async (_userId, draft) => {
      options.created?.push(draft)
      return { id: 'e1', webUrl: null, conferenceUrl: null, attendees: [] }
    },
    rescheduleEvent: async (_userId, input) => {
      options.moves?.push({ eventId: input.eventId, notifyGuests: input.notifyGuests })
      return {
        id: input.eventId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        // Un fournisseur qui ne sait pas se taire prévient TOUJOURS, quoi qu'on
        // lui demande — c'est ce que le double doit reproduire.
        guestsNotified: (options.silentReschedule ?? true) ? input.notifyGuests : true,
      }
    },
    deleteEvent: async (_userId, eventId) => {
      if (options.deleteThrows) throw new Error(`${provider} calendar API disabled`)
      options.deleted?.push(eventId)
    },
  }
}

function calendar(partial: Partial<AgendaCalendar> & Pick<AgendaCalendar, 'id' | 'provider'>): AgendaCalendar {
  return { name: partial.id, primary: false, canWrite: true, ...partial }
}

function event(id: string, start: string): AgendaEvent {
  return {
    id,
    summary: id,
    description: null,
    location: null,
    start,
    end: start,
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: false,
    cancelled: false,
  }
}

/** La raison portée par l'exception rendue au client. */
function reasonOf(error: unknown): unknown {
  return (error as ServiceUnavailableException).getResponse?.() as { reason?: unknown }
}

function profiles(
  stored: {
    agenda_provider?: string | null
    agenda_calendar_id?: string | null
    agenda_calendar_ids?: Array<{ provider: string; calendarId: string }> | null
    agenda_read_all?: boolean
  } = {},
) {
  const update = jest.fn().mockResolvedValue({ affected: 1 })
  const repo = {
    findOne: jest.fn().mockResolvedValue({
      agenda_provider: stored.agenda_provider ?? null,
      agenda_calendar_id: stored.agenda_calendar_id ?? null,
      agenda_calendar_ids: stored.agenda_calendar_ids ?? null,
      agenda_read_all: stored.agenda_read_all ?? false,
    }),
    update,
  } as unknown as Repository<ProfileEntity>
  return { repo, update }
}

const WINDOW = { from: '2026-08-16T08:00:00.000Z', to: '2026-08-16T20:00:00.000Z', limit: 50 }

describe('AgendaService — quel agenda est lu', () => {
  it('lit l’agenda par défaut tant que rien n’a été choisi', async () => {
    const calls: Call[] = []
    const service = new AgendaService([backend('google', { calls })], profiles().repo)

    await service.listEvents('u1', WINDOW)

    expect(calls[0]?.window.calendarId).toBeUndefined()
  })

  it('lit l’agenda choisi, et donc le brief le lit aussi', async () => {
    // La préférence vit sur le profil, pas dans le navigateur : c'est ce qui
    // fait que l'écran et le brief du matin parlent de la même journée.
    const calls: Call[] = []
    const service = new AgendaService(
      [backend('google', { calls })],
      profiles({ agenda_provider: 'google', agenda_calendar_id: 'equipe@acme.com' }).repo,
    )

    await service.listEvents('u1', WINDOW)

    expect(calls[0]?.window.calendarId).toBe('equipe@acme.com')
  })

  it('une demande explicite passe devant la préférence enregistrée', async () => {
    const calls: Call[] = []
    const service = new AgendaService(
      [backend('google', { calls })],
      profiles({ agenda_provider: 'google', agenda_calendar_id: 'equipe@acme.com' }).repo,
    )

    await service.listEvents('u1', { ...WINDOW, calendarId: 'perso@acme.com' })

    expect(calls[0]?.window.calendarId).toBe('perso@acme.com')
  })

  it('bascule sur l’autre agenda connecté quand le premier tombe et que rien n’a été choisi', async () => {
    // Constaté en production : l'API Calendar du premier fournisseur était
    // désactivée, le second répondait, et le brief affichait « agenda
    // indisponible » — une journée vidée pour une raison qui ne concerne pas
    // celui qui la lit. L'ordre des backends est une déclaration, pas un choix.
    const secondCalls: Call[] = []
    const service = new AgendaService(
      [backend('google', { eventsThrow: true }), backend('microsoft', { calls: secondCalls })],
      profiles().repo,
    )

    await expect(service.listEvents('u1', WINDOW)).resolves.toEqual([])
    expect(secondCalls).toHaveLength(1)
  })

  it('ne bascule PAS quand le fournisseur a été explicitement demandé', async () => {
    const secondCalls: Call[] = []
    const service = new AgendaService(
      [backend('google', { eventsThrow: true }), backend('microsoft', { calls: secondCalls })],
      profiles().repo,
    )

    await expect(service.listEvents('u1', { ...WINDOW, provider: 'google' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    )
    expect(secondCalls).toHaveLength(0)
  })

  it('ne bascule PAS quand l’utilisateur a choisi son agenda', async () => {
    // Un choix explicite qui échoue doit se voir : le remplacer en silence par
    // un autre agenda ferait lire à quelqu'un une journée qui n'est pas celle
    // qu'il a demandée.
    const secondCalls: Call[] = []
    const service = new AgendaService(
      [backend('google', { eventsThrow: true }), backend('microsoft', { calls: secondCalls })],
      profiles({ agenda_provider: 'google', agenda_calendar_id: 'g1' }).repo,
    )

    await expect(service.listEvents('u1', WINDOW)).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(secondCalls).toHaveLength(0)
  })

  it('remonte l’échec quand il n’y a personne d’autre à interroger', async () => {
    const service = new AgendaService([backend('google', { eventsThrow: true })], profiles().repo)

    await expect(service.listEvents('u1', WINDOW)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('nomme l’agenda muet même quand le repli a répondu', async () => {
    // Le repli rend une journée VRAIE, mais ce n'est pas la journée complète :
    // sans ce signalement, « aucun rendez-vous » se lirait « rien de prévu »
    // alors que la journée est peut-être pleine dans l'agenda qui s'est tu.
    const service = new AgendaService([backend('google', { eventsThrow: true }), backend('microsoft')], profiles().repo)

    const result = await service.listEventsDetailed('u1', WINDOW)

    expect(result.events).toEqual([])
    expect(result.unavailable).toEqual([{ provider: 'google', reason: 'events_unavailable', calendarName: null }])
  })

  it('refuse de servir un autre fournisseur que celui demandé', async () => {
    // Rendre l'agenda Google à qui a demandé Outlook, c'est répondre à côté
    // sans le dire — et un identifiant d'un fournisseur envoyé à l'autre ne
    // rendrait de toute façon rien.
    const service = new AgendaService([backend('google')], profiles().repo)

    await expect(service.listEvents('u1', { ...WINDOW, provider: 'microsoft' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})

/**
 * #3973 — « Outils et sources » : un agenda DÉCOCHÉ pour ce fil n'est jamais
 * lu, quel que soit le chemin (défaut, choix enregistré, « tous », repli).
 */
describe('AgendaService — un outil décoché n’est jamais lu (#3973)', () => {
  const ONLY_GOOGLE = { excludedProviders: ['microsoft'] as const }
  const ONLY_MICROSOFT = { excludedProviders: ['google'] as const }

  it('par défaut : le premier décoché, c’est l’autre agenda branché qui est lu', async () => {
    const googleCalls: Call[] = []
    const microsoftCalls: Call[] = []
    const service = new AgendaService(
      [backend('google', { calls: googleCalls }), backend('microsoft', { calls: microsoftCalls })],
      profiles().repo,
    )

    await service.listEvents('u1', WINDOW, ONLY_MICROSOFT)

    expect(googleCalls).toHaveLength(0)
    expect(microsoftCalls).toHaveLength(1)
  })

  it('le repli ne bascule jamais vers un agenda décoché', async () => {
    const microsoftCalls: Call[] = []
    const service = new AgendaService(
      [backend('google', { eventsThrow: true }), backend('microsoft', { calls: microsoftCalls })],
      profiles().repo,
    )

    await expect(service.listEvents('u1', WINDOW, ONLY_GOOGLE)).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(microsoftCalls).toHaveLength(0)
  })

  it('un agenda enregistré chez le fournisseur décoché cède la place à l’autre, sans son identifiant', async () => {
    const googleCalls: Call[] = []
    const microsoftCalls: Call[] = []
    const service = new AgendaService(
      [backend('google', { calls: googleCalls }), backend('microsoft', { calls: microsoftCalls })],
      profiles({ agenda_provider: 'google', agenda_calendar_id: 'equipe@acme.com' }).repo,
    )

    await service.listEvents('u1', WINDOW, ONLY_MICROSOFT)

    expect(googleCalls).toHaveLength(0)
    expect(microsoftCalls).toHaveLength(1)
    expect(microsoftCalls[0]?.window.calendarId).toBeUndefined()
  })

  it('« tous mes agendas » : ceux du fournisseur décoché ne sont ni lus ni nommés', async () => {
    const googleCalls: Call[] = []
    const service = new AgendaService(
      [
        backend('google', {
          calls: googleCalls,
          calendars: [calendar({ id: 'g1', provider: 'google' })],
          eventsByCalendar: { g1: [event('e-g', '2026-08-16T09:00:00.000Z')] },
        }),
        backend('microsoft', {
          calendarsThrow: true,
        }),
      ],
      profiles({ agenda_read_all: true }).repo,
    )

    const result = await service.listEventsDetailed('u1', WINDOW, ONLY_GOOGLE)

    expect(result.events.map(item => item.id)).toEqual(['e-g'])
    expect(result.unavailable).toEqual([])
    expect(googleCalls).toHaveLength(1)
  })

  it('agendas cochés : ceux du fournisseur décoché sortent de la lecture', async () => {
    const microsoftCalls: Call[] = []
    const service = new AgendaService(
      [
        backend('google', {
          calendars: [calendar({ id: 'g1', provider: 'google' })],
          eventsByCalendar: { g1: [event('e-g', '2026-08-16T09:00:00.000Z')] },
        }),
        backend('microsoft', {
          calls: microsoftCalls,
          calendars: [calendar({ id: 'm1', provider: 'microsoft' })],
          eventsByCalendar: { m1: [event('e-m', '2026-08-16T10:00:00.000Z')] },
        }),
      ],
      profiles({
        agenda_calendar_ids: [
          { provider: 'google', calendarId: 'g1' },
          { provider: 'microsoft', calendarId: 'm1' },
        ],
      }).repo,
    )

    const result = await service.listEventsDetailed('u1', WINDOW, ONLY_GOOGLE)

    expect(result.events.map(item => item.id)).toEqual(['e-g'])
    expect(result.unavailable).toEqual([])
    expect(microsoftCalls).toHaveLength(0)
  })

  it('tous décochés : aucun agenda n’est lu', async () => {
    const googleCalls: Call[] = []
    const microsoftCalls: Call[] = []
    const service = new AgendaService(
      [backend('google', { calls: googleCalls }), backend('microsoft', { calls: microsoftCalls })],
      profiles().repo,
    )

    await expect(
      service.listEvents('u1', WINDOW, { excludedProviders: ['google', 'microsoft'] }),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(googleCalls).toHaveLength(0)
    expect(microsoftCalls).toHaveLength(0)
  })

  it('les créneaux libres se calculent sur l’agenda non décoché', async () => {
    const googleCalls: Call[] = []
    const microsoftCalls: Call[] = []
    const service = new AgendaService(
      [backend('google', { calls: googleCalls }), backend('microsoft', { calls: microsoftCalls })],
      profiles().repo,
    )

    await service.freeSlots('u1', { from: WINDOW.from, to: WINDOW.to, durationMinutes: 30 } as never, ONLY_MICROSOFT)

    expect(googleCalls).toHaveLength(0)
    expect(microsoftCalls).toHaveLength(1)
  })

  it('traduit les identifiants d’outils du registre en agendas, et ignore le reste', () => {
    expect(agendaProvidersExcludedBy(['google-calendar', 'gmail'])).toEqual(['google'])
    expect(agendaProvidersExcludedBy(['microsoft'])).toEqual(['microsoft'])
    expect(agendaProvidersExcludedBy(null)).toEqual([])
  })

  it('chaque identifiant d’outil traduit existe au registre, et y sert la famille « calendar » (#3973)', () => {
    for (const provider of agendaProviderSchema.options) {
      const entry = TOOL_CATALOG.find(tool => tool.provider === AGENDA_TOOL_PROVIDERS[provider])
      expect(entry && toolFamiliesOf(entry)).toContain('calendar')
    }
  })
})

describe('AgendaService — la liste des agendas', () => {
  it('rassemble les agendas des DEUX fournisseurs connectés', async () => {
    const service = new AgendaService(
      [
        backend('google', { calendars: [calendar({ id: 'g1', provider: 'google', primary: true })] }),
        backend('microsoft', { calendars: [calendar({ id: 'm1', provider: 'microsoft' })] }),
      ],
      profiles().repo,
    )

    const result = await service.listCalendars('u1')

    expect(result.calendars.map(c => c.id)).toEqual(['g1', 'm1'])
    expect(result.unavailable).toEqual([])
  })

  it('un fournisseur en panne est NOMMÉ, il ne disparaît pas de la liste', async () => {
    // Une liste courte parce qu'un appel a raté se lit « je n'ai qu'un
    // agenda ». C'est faux, et c'est invérifiable pour celui qui la lit.
    const service = new AgendaService(
      [
        backend('google', { calendarsThrow: true }),
        backend('microsoft', { calendars: [calendar({ id: 'm1', provider: 'microsoft' })] }),
      ],
      profiles().repo,
    )

    const result = await service.listCalendars('u1')

    expect(result.calendars.map(c => c.id)).toEqual(['m1'])
    expect(result.unavailable).toEqual([{ provider: 'google', reason: 'calendars_unavailable', calendarName: null }])
  })

  it('n’interroge pas un fournisseur qui n’autorise pas la lecture', async () => {
    const service = new AgendaService([backend('google', { read: false })], profiles().repo)

    const result = await service.listCalendars('u1')

    expect(result.calendars).toEqual([])
    expect(result.unavailable).toEqual([])
  })
})

describe('AgendaService — lire TOUS les agendas', () => {
  const twoGoogleCalendars = (options: Parameters<typeof backend>[1] = {}) =>
    backend('google', {
      calendars: [
        calendar({ id: 'perso@acme.com', provider: 'google', primary: true }),
        calendar({ id: 'equipe@acme.com', provider: 'google' }),
      ],
      ...options,
    })

  it('interroge chaque agenda et rassemble la journée, triée', async () => {
    // Le vrai reproche produit : un commercial sous Workspace a cinq agendas et
    // son prochain rendez-vous peut être dans n'importe lequel. Lui faire
    // désigner LE bon revient à lui demander de deviner.
    const service = new AgendaService(
      [
        twoGoogleCalendars({
          eventsByCalendar: {
            'perso@acme.com': [event('tard', '2026-08-16T15:00:00.000Z')],
            'equipe@acme.com': [event('tot', '2026-08-16T09:00:00.000Z')],
          },
        }),
      ],
      profiles({ agenda_read_all: true }).repo,
    )

    const result = await service.listEventsDetailed('u1', WINDOW)

    expect(result.events.map(item => item.id)).toEqual(['tot', 'tard'])
    expect(result.unavailable).toEqual([])
  })

  it('ne compte qu’une fois un évènement présent dans deux agendas', async () => {
    // Une réunion d'équipe apparaît dans l'agenda partagé ET dans le sien : la
    // compter deux fois ferait paraître la journée deux fois plus chargée.
    const service = new AgendaService(
      [
        twoGoogleCalendars({
          eventsByCalendar: {
            'perso@acme.com': [event('revue', '2026-08-16T10:00:00.000Z')],
            'equipe@acme.com': [event('revue', '2026-08-16T10:00:00.000Z')],
          },
        }),
      ],
      profiles({ agenda_read_all: true }).repo,
    )

    const result = await service.listEventsDetailed('u1', WINDOW)

    expect(result.events).toHaveLength(1)
  })

  it('un agenda muet ne fait pas tomber les autres, et il est NOMMÉ', async () => {
    const service = new AgendaService(
      [
        twoGoogleCalendars({
          failingCalendars: ['equipe@acme.com'],
          eventsByCalendar: { 'perso@acme.com': [event('point', '2026-08-16T10:00:00.000Z')] },
        }),
      ],
      profiles({ agenda_read_all: true }).repo,
    )

    const result = await service.listEventsDetailed('u1', WINDOW)

    expect(result.events.map(item => item.id)).toEqual(['point'])
    // L'agenda muet est nommé : « il manque un agenda » se répare, « il ne se
    // passe rien » ne se répare pas.
    expect(result.unavailable).toEqual([
      { provider: 'google', reason: 'events_unavailable', calendarName: 'equipe@acme.com' },
    ])
  })

  it('lève quand AUCUN agenda ne répond — une panne totale n’est pas une journée calme', async () => {
    const service = new AgendaService(
      [twoGoogleCalendars({ failingCalendars: ['perso@acme.com', 'equipe@acme.com'] })],
      profiles({ agenda_read_all: true }).repo,
    )

    await expect(service.listEventsDetailed('u1', WINDOW)).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('une demande explicite d’un agenda précis reste prioritaire sur « tous »', async () => {
    const calls: Call[] = []
    const service = new AgendaService([twoGoogleCalendars({ calls })], profiles({ agenda_read_all: true }).repo)

    await service.listEvents('u1', { ...WINDOW, calendarId: 'perso@acme.com' })

    expect(calls.map(entry => entry.window.calendarId)).toEqual(['perso@acme.com'])
  })
})

describe('AgendaService — ce qu’on dit d’un échec', () => {
  it('distingue « réessaie » d’un accès ÉTEINT côté fournisseur', () => {
    // Le cas a coûté des jours en production : compte connecté, portées
    // accordées, statut « lecture : oui » — et chaque lecture en 500 opaque
    // parce que l'API Agenda n'avait jamais été activée sur le projet.
    // « Réessaie dans un moment » y était un mensonge : ça ne repasse jamais
    // tout seul.
    const disabled = agendaReadFailure(
      new Error('Google Calendar API has not been used in project 240781671020 before or it is disabled.'),
    )
    expect(reasonOf(disabled)).toMatchObject({ reason: 'provider_api_disabled' })

    const transient = agendaReadFailure(new Error('socket hang up'))
    expect(reasonOf(transient)).toMatchObject({ reason: 'provider_unavailable' })
  })

  it('ne fait pas fuiter la trace technique ni le nom de l’éditeur', () => {
    const failure = agendaReadFailure(new Error('Google Calendar API has not been used in project 240781671020'))
    const body = failure.getResponse() as { message: string }

    expect(body.message).not.toMatch(/google|calendar api|240781671020/i)
  })
})

describe('AgendaService — enregistrer le choix', () => {
  it('n’enregistre qu’un agenda que le fournisseur liste vraiment', async () => {
    // Accepter un identifiant jamais vu produirait un écran vide et durable,
    // sans rien pour le diagnostiquer.
    const { repo, update } = profiles()
    const service = new AgendaService(
      [backend('google', { calendars: [calendar({ id: 'g1', provider: 'google' })] })],
      repo,
    )

    await expect(service.selectCalendar('u1', { provider: 'google', calendarId: 'inconnu' })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(update).not.toHaveBeenCalled()
  })

  it('enregistre le couple fournisseur + agenda', async () => {
    const { repo, update } = profiles()
    const service = new AgendaService(
      [backend('google', { calendars: [calendar({ id: 'g1', provider: 'google' })] })],
      repo,
    )

    const result = await service.selectCalendar('u1', { provider: 'google', calendarId: 'g1' })

    expect(update).toHaveBeenCalledWith(
      { user_id: 'u1' },
      {
        agenda_provider: null,
        agenda_calendar_id: null,
        agenda_calendar_ids: [{ provider: 'google', calendarId: 'g1' }],
        agenda_read_all: false,
      },
    )
    expect(result.selectedCalendars).toEqual([{ provider: 'google', calendarId: 'g1' }])
    expect(result.readsAll).toBe(false)
  })

  it('enregistre PLUSIEURS agendas, dédoublonnés', async () => {
    // « Mon agenda et celui de l'équipe, mais pas les jours fériés » est la
    // réponse juste pour la plupart des gens ; le même agenda coché deux fois
    // ne doit pas être lu deux fois.
    const { repo, update } = profiles()
    const service = new AgendaService(
      [
        backend('google', {
          calendars: [calendar({ id: 'g1', provider: 'google' }), calendar({ id: 'g2', provider: 'google' })],
        }),
      ],
      repo,
    )

    const result = await service.selectCalendars('u1', [
      { provider: 'google', calendarId: 'g1' },
      { provider: 'google', calendarId: 'g2' },
      { provider: 'google', calendarId: 'g1' },
    ])

    expect(update).toHaveBeenCalledWith(
      { user_id: 'u1' },
      {
        agenda_provider: null,
        agenda_calendar_id: null,
        agenda_calendar_ids: [
          { provider: 'google', calendarId: 'g1' },
          { provider: 'google', calendarId: 'g2' },
        ],
        agenda_read_all: false,
      },
    )
    expect(result.selectedCalendars).toHaveLength(2)
  })

  it('refuse TOUT le choix dès qu’un agenda est inconnu', async () => {
    // Enregistrer les bons en silence et jeter le mauvais produirait une
    // journée amputée d'un agenda que l'utilisateur croit coché.
    const { repo, update } = profiles()
    const service = new AgendaService(
      [backend('google', { calendars: [calendar({ id: 'g1', provider: 'google' })] })],
      repo,
    )

    await expect(
      service.selectCalendars('u1', [
        { provider: 'google', calendarId: 'g1' },
        { provider: 'google', calendarId: 'inconnu' },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(update).not.toHaveBeenCalled()
  })

  it('refuse une sélection vide', async () => {
    const { repo, update } = profiles()
    const service = new AgendaService([backend('google', { calendars: [] })], repo)

    await expect(service.selectCalendars('u1', [])).rejects.toBeInstanceOf(BadRequestException)
    expect(update).not.toHaveBeenCalled()
  })

  it('« tous mes agendas » efface le choix unique', async () => {
    // Garder l'ancien choix « au cas où » ferait réapparaître un jour une
    // journée amputée sans que personne ne se souvienne pourquoi.
    const { repo, update } = profiles({ agenda_provider: 'google', agenda_calendar_id: 'g1' })
    const service = new AgendaService(
      [backend('google', { calendars: [calendar({ id: 'g1', provider: 'google' })] })],
      repo,
    )

    const result = await service.selectAllCalendars('u1')

    expect(update).toHaveBeenCalledWith(
      { user_id: 'u1' },
      { agenda_provider: null, agenda_calendar_id: null, agenda_calendar_ids: null, agenda_read_all: true },
    )
    expect(result.readsAll).toBe(true)
    expect(result.selectedCalendars).toEqual([])
  })
})

describe('AgendaService — lire plusieurs agendas cochés', () => {
  it('rend l’union des agendas cochés, et EUX SEULS', async () => {
    // Le test porte la moitié utile de la fonctionnalité : cocher deux agendas
    // sur cinq doit lire deux agendas, pas cinq (ce serait « tous ») et pas un
    // (ce serait l'ancien comportement).
    const calls: Call[] = []
    const service = new AgendaService(
      [
        backend('google', {
          calls,
          calendars: [
            calendar({ id: 'moi', provider: 'google' }),
            calendar({ id: 'equipe', provider: 'google' }),
            calendar({ id: 'feries', provider: 'google' }),
          ],
          eventsByCalendar: {
            moi: [event('e-moi', '2026-08-16T09:00:00.000Z')],
            equipe: [event('e-equipe', '2026-08-16T10:00:00.000Z')],
            feries: [event('e-ferie', '2026-08-16T00:00:00.000Z')],
          },
        }),
      ],
      profiles({
        agenda_calendar_ids: [
          { provider: 'google', calendarId: 'moi' },
          { provider: 'google', calendarId: 'equipe' },
        ],
      }).repo,
    )

    const result = await service.listEventsDetailed('u1', WINDOW)

    expect(result.events.map(item => item.id)).toEqual(['e-moi', 'e-equipe'])
    expect(calls.map(call => call.window.calendarId).sort()).toEqual(['equipe', 'moi'])
  })

  it('un agenda coché qui tombe ne vide pas la journée, il est NOMMÉ', async () => {
    const service = new AgendaService(
      [
        backend('google', {
          calendars: [calendar({ id: 'moi', provider: 'google' }), calendar({ id: 'equipe', provider: 'google' })],
          eventsByCalendar: { moi: [event('e-moi', '2026-08-16T09:00:00.000Z')] },
          failingCalendars: ['equipe'],
        }),
      ],
      profiles({
        agenda_calendar_ids: [
          { provider: 'google', calendarId: 'moi' },
          { provider: 'google', calendarId: 'equipe' },
        ],
      }).repo,
    )

    const result = await service.listEventsDetailed('u1', WINDOW)

    expect(result.events.map(item => item.id)).toEqual(['e-moi'])
    expect(result.unavailable).toEqual([{ provider: 'google', reason: 'events_unavailable', calendarName: 'equipe' }])
  })

  it('un agenda coché qui a DISPARU de la liste est signalé, pas ignoré', async () => {
    // Un partage retiré par quelqu'un d'autre ne doit ni faire tomber la
    // lecture ni disparaître en silence : l'utilisateur croirait sa journée
    // complète.
    const service = new AgendaService(
      [
        backend('google', {
          calendars: [calendar({ id: 'moi', provider: 'google' })],
          eventsByCalendar: { moi: [event('e-moi', '2026-08-16T09:00:00.000Z')] },
        }),
      ],
      profiles({
        agenda_calendar_ids: [
          { provider: 'google', calendarId: 'moi' },
          { provider: 'google', calendarId: 'partage-retire' },
        ],
      }).repo,
    )

    const result = await service.listEventsDetailed('u1', WINDOW)

    expect(result.events.map(item => item.id)).toEqual(['e-moi'])
    expect(result.unavailable).toEqual([{ provider: 'google', reason: 'calendar_missing', calendarName: null }])
  })

  it('reprend l’ancien choix unique tant que la liste n’a pas été écrite', async () => {
    // La migration reprend les colonnes historiques, mais un profil créé par un
    // autre chemin ne doit pas perdre son agenda en silence.
    const calls: Call[] = []
    const service = new AgendaService(
      [backend('google', { calls, calendars: [calendar({ id: 'g1', provider: 'google' })] })],
      profiles({ agenda_provider: 'google', agenda_calendar_id: 'g1' }).repo,
    )

    await service.listEvents('u1', WINDOW)

    expect(calls[0]?.window.calendarId).toBe('g1')
  })
})

describe('AgendaService — déplacer un rendez-vous', () => {
  const MOVE = {
    eventId: 'evt-1',
    startsAt: '2026-08-16T14:00:00.000Z',
    endsAt: '2026-08-16T15:00:00.000Z',
    notifyGuests: true,
  }

  it('transmet le choix de prévenir au fournisseur', async () => {
    const moves: Array<{ eventId: string; notifyGuests: boolean }> = []
    const service = new AgendaService([backend('google', { moves })], profiles().repo)
    await service.rescheduleEvent('u1', { ...MOVE, notifyGuests: false })
    expect(moves).toEqual([{ eventId: 'evt-1', notifyGuests: false }])
  })

  it('rend ce qui S’EST PASSÉ, pas ce qui a été demandé', async () => {
    // Un fournisseur qui prévient toujours doit le dire. Renvoyer la demande de
    // l'appelant ferait croire à une discrétion qui n'a pas eu lieu — et un
    // commercial le découvrirait par la réponse d'un client.
    const service = new AgendaService([backend('microsoft', { silentReschedule: false })], profiles().repo)
    const result = await service.rescheduleEvent('u1', { ...MOVE, notifyGuests: false })
    expect(result.guestsNotified).toBe(true)
  })

  it('refuse une fin antérieure au début', async () => {
    const service = new AgendaService([backend('google')], profiles().repo)
    await expect(
      service.rescheduleEvent('u1', { ...MOVE, startsAt: MOVE.endsAt, endsAt: MOVE.startsAt }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuse quand aucun agenda n’est connecté', async () => {
    const service = new AgendaService([backend('google', { connected: false })], profiles().repo)
    await expect(service.rescheduleEvent('u1', MOVE)).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuse quand l’agenda connecté est en lecture seule', async () => {
    // Sans ce refus, l'appel partirait chez le fournisseur pour revenir en 403,
    // et l'écran afficherait une panne là où il y a une portée manquante.
    const service = new AgendaService([backend('google', { write: false })], profiles().repo)
    await expect(service.rescheduleEvent('u1', MOVE)).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('AgendaService — annuler un évènement (#2770.52)', () => {
  it('transmet l’identifiant exact au backend connecté', async () => {
    const deleted: string[] = []
    const service = new AgendaService([backend('google', { deleted })], profiles().repo)
    await service.deleteEvent('u1', 'evt-9')
    expect(deleted).toEqual(['evt-9'])
  })

  it('refuse quand aucun agenda n’est connecté', async () => {
    const service = new AgendaService([backend('google', { connected: false })], profiles().repo)
    await expect(service.deleteEvent('u1', 'evt-9')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('refuse quand l’agenda connecté est en lecture seule', async () => {
    const service = new AgendaService([backend('google', { write: false })], profiles().repo)
    await expect(service.deleteEvent('u1', 'evt-9')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('relaie une vraie panne fournisseur plutôt que de l’avaler', async () => {
    const service = new AgendaService([backend('google', { deleteThrows: true })], profiles().repo)
    await expect(service.deleteEvent('u1', 'evt-9')).rejects.toThrow('calendar API disabled')
  })
})

describe('AgendaService.createEvent — calendarId et recurrence (épopée #2835)', () => {
  const DRAFT: AgendaEventDraft = {
    summary: 'Point ACME',
    startsAt: '2026-10-01T09:00:00.000Z',
    endsAt: '2026-10-01T09:30:00.000Z',
    timeZone: 'Europe/Paris',
    attendees: [],
    addConferencing: true,
    reminderMinutes: 60,
    inviteSelf: false,
  }

  describe('calendarId — #2101.27, calendrier cible', () => {
    it('sans calendarId : rien de nouveau n’est vérifié, le brouillon part tel quel (comportement historique)', async () => {
      const created: AgendaEventDraft[] = []
      const service = new AgendaService([backend('google', { created })], profiles().repo)
      await service.createEvent('u1', DRAFT)
      expect(created[0]?.calendarId).toBeUndefined()
    })

    it('un calendrier CONNU et inscriptible est vérifié puis transmis au fournisseur', async () => {
      const created: AgendaEventDraft[] = []
      const calendars = [calendar({ id: 'team@group.calendar.google.com', provider: 'google', canWrite: true })]
      const service = new AgendaService([backend('google', { calendars, created })], profiles().repo)
      await service.createEvent('u1', { ...DRAFT, calendarId: 'team@group.calendar.google.com' })
      expect(created[0]?.calendarId).toBe('team@group.calendar.google.com')
    })

    it('REFUSE un calendrier absent de la liste RENDUE par le fournisseur — jamais deviné', async () => {
      const service = new AgendaService([backend('google', { calendars: [] })], profiles().repo)
      await expect(
        service.createEvent('u1', { ...DRAFT, calendarId: 'inconnu@group.calendar.google.com' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('REFUSE un calendrier CONNU mais en lecture seule — créer y échouerait chez le fournisseur', async () => {
      const calendars = [calendar({ id: 'lecture-seule', provider: 'google', canWrite: false })]
      const service = new AgendaService([backend('google', { calendars })], profiles().repo)
      await expect(service.createEvent('u1', { ...DRAFT, calendarId: 'lecture-seule' })).rejects.toBeInstanceOf(
        BadRequestException,
      )
    })
  })

  describe('recurrence — #2101.26, RRULE', () => {
    it('sans recurrence : aucune capacité n’est exigée (comportement historique)', async () => {
      const created: AgendaEventDraft[] = []
      const service = new AgendaService([backend('google', { recurrence: false, created })], profiles().repo)
      await service.createEvent('u1', DRAFT)
      expect(created[0]?.recurrence).toBeUndefined()
    })

    it('transmet la RRULE quand le fournisseur connecté la pose réellement', async () => {
      const created: AgendaEventDraft[] = []
      const service = new AgendaService([backend('google', { recurrence: true, created })], profiles().repo)
      await service.createEvent('u1', { ...DRAFT, recurrence: 'RRULE:FREQ=WEEKLY;COUNT=5' })
      expect(created[0]?.recurrence).toBe('RRULE:FREQ=WEEKLY;COUNT=5')
    })

    it('REFUSE une récurrence demandée à un fournisseur qui ne la pose pas — jamais relayée en silence', async () => {
      // Microsoft aujourd'hui : `recurrence: false` explicite. Relayer quand
      // même ferait perdre la récurrence sans que personne ne le sache — le
      // rendez-vous se créerait unique, silencieusement.
      const service = new AgendaService([backend('microsoft', { recurrence: false })], profiles().repo)
      await expect(
        service.createEvent('u1', { ...DRAFT, recurrence: 'RRULE:FREQ=WEEKLY;COUNT=5' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('REFUSE une récurrence quand le fournisseur ne dit RIEN de sa capacité — le cas prudent', async () => {
      // `recurrence` absent de `AgendaCapabilities` (déploiement antérieur à
      // #2101.26) doit se lire « pas honoré », jamais « honoré par défaut ».
      const service = new AgendaService([backend('google', { recurrence: undefined })], profiles().repo)
      await expect(
        service.createEvent('u1', { ...DRAFT, recurrence: 'RRULE:FREQ=WEEKLY;COUNT=5' }),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })
})
