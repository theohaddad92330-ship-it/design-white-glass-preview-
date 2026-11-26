import type { AgendaCalendar, AgendaEvent } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import {
  agendaEventTitle,
  checkedCalendarKeys,
  currentOrNextEvent,
  toggleCalendarSelection,
  dayLoad,
  daysOf,
  eventsOfDay,
  isAllDay,
  isBellumCreatedAgendaEvent,
  isProposedAgendaEvent,
  liveLeftDisplay,
  shiftAnchor,
  startOfWeek,
  timingOf,
  undatedEvents,
  windowFor,
} from './agenda-view'

/**
 * Ce qui se teste ici, ce sont les affirmations que l'écran fait à voix haute :
 * « en cours », « dans 12 min », « journée entière », « mercredi ». Chacune est
 * fausse silencieusement quand le calcul dérape — personne ne signale un
 * rendez-vous affiché le mauvais jour, on le rate simplement.
 */

function event(partial: Partial<AgendaEvent> & Pick<AgendaEvent, 'id'>): AgendaEvent {
  return {
    summary: partial.id,
    description: null,
    location: null,
    start: null,
    end: null,
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: false,
    cancelled: false,
    ...partial,
  }
}

/** Un instant local, écrit en heure locale pour que le test dise ce qu'il veut
 *  dire quelle que soit la machine qui l'exécute. */
function local(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

describe('où en est un rendez-vous', () => {
  const now = local(2026, 8, 17, 10, 0)

  it('dit « en cours » pendant la réunion, avec ce qu’il en reste', () => {
    const timing = timingOf(
      { start: local(2026, 8, 17, 9, 30).toISOString(), end: local(2026, 8, 17, 10, 30).toISOString() },
      now,
    )

    expect(timing.phase).toBe('live')
    expect(timing.minutesLeft).toBe(30)
  })

  // B2-RESTES (recette prod 12/10) — « En cours · 110146 min restantes » (≈ 76 jours).
  it('ne dit pas combien il reste quand la fin est à plus d’un jour : échéance non fiable', () => {
    const timing = timingOf(
      { start: local(2026, 8, 17, 9, 30).toISOString(), end: local(2026, 11, 31, 10, 0).toISOString() },
      now,
    )

    expect(timing.phase).toBe('live')
    expect(timing.minutesLeft).toBeNull()
  })

  it('compte en minutes sous deux heures, en heures au-delà', () => {
    expect(liveLeftDisplay(45)).toEqual({ key: 'liveLeft', count: 45 })
    expect(liveLeftDisplay(119)).toEqual({ key: 'liveLeft', count: 119 })
    expect(liveLeftDisplay(150)).toEqual({ key: 'liveLeftHours', count: 3 })
    expect(liveLeftDisplay(600)).toEqual({ key: 'liveLeftHours', count: 10 })
  })

  it('dit « imminent » à quinze minutes, et pas avant', () => {
    const soon = timingOf({ start: local(2026, 8, 17, 10, 12).toISOString(), end: null }, now)
    const later = timingOf({ start: local(2026, 8, 17, 11, 0).toISOString(), end: null }, now)

    expect(soon.phase).toBe('soon')
    expect(soon.minutesUntil).toBe(12)
    expect(later.phase).toBe('later')
  })

  it('une réunion terminée est passée, même si elle a duré plus longtemps que prévu', () => {
    const timing = timingOf(
      { start: local(2026, 8, 17, 8, 0).toISOString(), end: local(2026, 8, 17, 9, 0).toISOString() },
      now,
    )

    expect(timing.phase).toBe('past')
  })

  it('une journée entière n’a pas de compte à rebours', () => {
    // Une date nue vaut minuit : un salon afficherait « dans 14 h » alors qu'il
    // dure toute la journée.
    const timing = timingOf({ start: '2026-08-18', end: '2026-08-19' }, now)

    expect(isAllDay({ start: '2026-08-18' })).toBe(true)
    expect(timing.phase).toBe('undated')
    expect(timing.minutesUntil).toBeNull()
  })

  it('un évènement sans date n’est pas rangé au hasard', () => {
    expect(timingOf({ start: null, end: null }, now).phase).toBe('undated')
    expect(undatedEvents([event({ id: 'sans-date' })]).map(item => item.id)).toEqual(['sans-date'])
  })
})

describe('la fenêtre demandée au serveur', () => {
  it('la journée couvre minuit à minuit', () => {
    const { from, to } = windowFor('day', local(2026, 8, 17, 15, 30))

    expect(from.getTime()).toBe(local(2026, 8, 17).getTime())
    expect(to.getTime()).toBe(local(2026, 8, 18).getTime())
  })

  it('la semaine commence LUNDI, y compris quand on l’ouvre un dimanche', () => {
    // Le 16 août 2026 est un dimanche : une semaine qui commencerait ce jour-là
    // décalerait toutes les colonnes d'un jour.
    expect(startOfWeek(local(2026, 8, 16, 18, 0)).getTime()).toBe(local(2026, 8, 10).getTime())
    expect(startOfWeek(local(2026, 8, 17, 8, 0)).getTime()).toBe(local(2026, 8, 17).getTime())
  })

  it('la semaine tient sept jours, du lundi au dimanche', () => {
    const days = daysOf('week', local(2026, 8, 19))

    expect(days).toHaveLength(7)
    expect(days[0]?.getTime()).toBe(local(2026, 8, 17).getTime())
    expect(days[6]?.getTime()).toBe(local(2026, 8, 23).getTime())
  })

  it('naviguer avance d’un jour ou d’une semaine selon la vue', () => {
    expect(shiftAnchor('day', local(2026, 8, 17), 1).getDate()).toBe(18)
    expect(shiftAnchor('week', local(2026, 8, 17), -1).getDate()).toBe(10)
  })
})

describe('répartir les évènements dans les jours', () => {
  const salon = event({ id: 'salon', start: '2026-08-18', end: '2026-08-20' })
  const matin = event({
    id: 'matin',
    start: local(2026, 8, 18, 9, 0).toISOString(),
    end: local(2026, 8, 18, 10, 0).toISOString(),
  })
  const nuit = event({
    id: 'nuit',
    start: local(2026, 8, 18, 23, 30).toISOString(),
    end: local(2026, 8, 19, 0, 30).toISOString(),
  })

  it('un évènement de plusieurs jours apparaît sur CHACUN', () => {
    // Le montrer seulement le premier jour ferait croire le 19 libre.
    expect(eventsOfDay([salon], local(2026, 8, 18)).map(item => item.id)).toEqual(['salon'])
    expect(eventsOfDay([salon], local(2026, 8, 19)).map(item => item.id)).toEqual(['salon'])
  })

  it('la fin d’une journée entière est exclusive', () => {
    expect(eventsOfDay([salon], local(2026, 8, 20))).toEqual([])
  })

  it('les journées entières passent en tête, pas à minuit', () => {
    const day = eventsOfDay([matin, salon], local(2026, 8, 18))

    expect(day.map(item => item.id)).toEqual(['salon', 'matin'])
  })

  it('une réunion qui court sur la nuit reste visible le lendemain', () => {
    expect(eventsOfDay([nuit], local(2026, 8, 19)).map(item => item.id)).toEqual(['nuit'])
  })
})

describe('ce que l’écran met en avant', () => {
  const now = local(2026, 8, 17, 10, 0)
  const enCours = event({
    id: 'en-cours',
    start: local(2026, 8, 17, 9, 30).toISOString(),
    end: local(2026, 8, 17, 10, 30).toISOString(),
  })
  const suivant = event({
    id: 'suivant',
    start: local(2026, 8, 17, 11, 0).toISOString(),
    end: local(2026, 8, 17, 12, 0).toISOString(),
  })

  it('met en avant la réunion EN COURS avant la suivante', () => {
    // Quelqu'un qui ouvre l'écran pendant sa réunion cherche le lien de
    // CETTE réunion.
    expect(currentOrNextEvent([suivant, enCours], now)?.id).toBe('en-cours')
  })

  it('à défaut, le prochain rendez-vous daté', () => {
    expect(currentOrNextEvent([suivant], now)?.id).toBe('suivant')
    expect(currentOrNextEvent([event({ id: 'salon', start: '2026-08-17' })], now)).toBeNull()
  })

  it('compte les rendez-vous restants sans compter un salon comme 24 h de réunion', () => {
    const load = dayLoad([enCours, suivant, event({ id: 'salon', start: '2026-08-17', end: '2026-08-18' })], now)

    expect(load.remaining).toBe(2)
    // 30 min RESTANTES de « en-cours » (9 h 30-10 h 30, `now` = 10 h) + 60 min
    // de « suivant » — pas les 60 min pleines de « en-cours » depuis son début
    // réel : « ce qui reste de la journée » compte ce qui reste, pas le passé.
    expect(load.meetingMinutes).toBe(90)
    expect(load.allDay).toBe(1)
  })

  it('ne compte pas un créneau PROPOSÉ comme un rendez-vous fixé', () => {
    // Le défaut que ce lot corrige : un commercial qui lit « 3 rendez-vous à
    // venir » organise sa journée autour de trois engagements — pas de deux
    // engagements et une proposition sans réponse.
    const propose = event({
      id: 'propose',
      status: 'tentative',
      start: local(2026, 8, 17, 14, 0).toISOString(),
      end: local(2026, 8, 17, 14, 30).toISOString(),
    })
    const load = dayLoad([enCours, suivant, propose], now)

    expect(load.remaining).toBe(2)
    expect(load.meetingMinutes).toBe(90)
    // La proposition n'est pas jetée pour autant : un écran peut vouloir dire
    // « + 1 proposé » sans avoir à reconstruire la donnée.
    expect(load.proposed).toBe(1)
  })

  it('un évènement commencé BIEN avant maintenant ne compte que ce qu’il en reste', () => {
    // Relevé en recette live le 14/09/2026 : « 2 rendez-vous à venir · 50 h en
    // réunion ». Un fournisseur d'agenda (Google, Microsoft) rend un évènement
    // dès qu'il CHEVAUCHE la fenêtre demandée — y compris un bloc commencé
    // bien avant `now` (un déplacement, une absence saisie avec une heure
    // plutôt qu'une date nue, donc pas `isAllDay`). Sommer depuis son début
    // RÉEL fait dépasser la fenêtre de 36 h elle-même, ce qui est la preuve
    // du défaut : le nombre ne peut pas être vrai.
    const chevauchement = event({
      id: 'deplacement',
      start: local(2026, 8, 15, 8, 0).toISOString(), // commencé 2 jours avant `now`
      end: local(2026, 8, 17, 12, 0).toISOString(), // se termine dans 2 h
    })

    const load = dayLoad([chevauchement], now)

    expect(load.remaining).toBe(1)
    // Ce qu'il RESTE : 2 h (10 h → 12 h), pas les 52 h depuis le vrai début.
    expect(load.meetingMinutes).toBe(120)
  })

  // Recette live 14/09/2026 : « 2 rendez-vous à venir · 50 h en réunion » sur
  // une fenêtre de 36 h — `175aecc5c` avait posé la borne BASSE (`now`) mais
  // aucune borne HAUTE : un évènement qui finit APRÈS la fenêtre comptait
  // au-delà d'elle. `meetingMinutes` reçoit désormais `until`, la fin de la
  // fenêtre, et compte `min(end, until) − max(start, now)`.
  const until = new Date(now.getTime() + 36 * 3600_000) // fenêtre de 36 h

  it('un évènement qui déborde de la fenêtre ne compte que jusqu’à sa borne haute', () => {
    // 14 h → +49 h sur une fenêtre de 36 h : compte jusqu'à la fin de la
    // fenêtre (18 h le lendemain), pas jusqu'à la fin réelle de l'évènement.
    const debordant = event({
      id: 'paris',
      start: local(2026, 8, 17, 14, 0).toISOString(),
      end: local(2026, 8, 19, 15, 0).toISOString(), // +49 h depuis son début
    })

    const load = dayLoad([debordant], now, until)

    // until (10 h + 36 h) − start (14 h) = 32 h, pas 49 h.
    expect(load.meetingMinutes).toBe(32 * 60)
  })

  it('témoin : un évènement entièrement dans la fenêtre compte sa durée pleine', () => {
    const dansLaFenetre = event({
      id: 'depot-cles',
      start: local(2026, 8, 17, 11, 0).toISOString(),
      end: local(2026, 8, 17, 12, 0).toISOString(),
    })

    const load = dayLoad([dansLaFenetre], now, until)

    expect(load.meetingMinutes).toBe(60)
  })

  it('témoin : un évènement qui finit avant `now` compte 0', () => {
    const termine = event({
      id: 'termine',
      start: local(2026, 8, 17, 7, 0).toISOString(),
      end: local(2026, 8, 17, 9, 0).toISOString(),
    })

    const load = dayLoad([termine], now, until)

    expect(load.meetingMinutes).toBe(0)
  })
})

describe('un créneau PROPOSÉ n’est pas un rendez-vous FIXÉ', () => {
  it('seul `tentative` est un créneau proposé', () => {
    expect(isProposedAgendaEvent({ status: 'tentative' })).toBe(true)
  })

  it('sait dire NON — confirmé, annulé, une valeur inconnue ne sont PAS des propositions', () => {
    // Les pièges réels d'une garde borgne : une valeur proche mais fausse.
    expect(isProposedAgendaEvent({ status: 'confirmed' })).toBe(false)
    expect(isProposedAgendaEvent({ status: 'cancelled' })).toBe(false)
    expect(isProposedAgendaEvent({ status: 'needsAction' })).toBe(false)
  })

  it('un statut ABSENT n’est ni confirmé ni proposé — « non mesuré » n’est jamais « 0 »', () => {
    expect(isProposedAgendaEvent({ status: null })).toBe(false)
  })
})

describe('#2770 (#2101.19/.21/.22/.37) — un rendez-vous FIXÉ dont on distingue l’origine', () => {
  it('`createdByBellum: true` est distingué — un rendez-vous écrit par la porte de proposition', () => {
    expect(isBellumCreatedAgendaEvent({ createdByBellum: true })).toBe(true)
  })

  it('`createdByBellum: false` ou ABSENT ne l’est pas — jamais confondu avec un geste manuel', () => {
    expect(isBellumCreatedAgendaEvent({ createdByBellum: false })).toBe(false)
    expect(isBellumCreatedAgendaEvent({ createdByBellum: undefined })).toBe(false)
  })
})

describe('cocher ses agendas', () => {
  const calendars: AgendaCalendar[] = [
    { id: 'moi', name: 'Mon agenda', provider: 'google', primary: true, canWrite: true },
    { id: 'equipe', name: 'Équipe', provider: 'google', primary: false, canWrite: false },
    { id: 'feries', name: 'Jours fériés', provider: 'google', primary: false, canWrite: false },
  ]

  it('sans choix, c’est l’agenda par défaut qui est coché — pas rien', () => {
    // Zéro case cochée laisserait croire que Bellum ne lit aucun agenda, alors
    // qu'il lit celui du compte.
    expect([...checkedCalendarKeys(calendars, { readsAll: false, selected: [] })]).toEqual(['google:moi'])
  })

  it('« tous mes agendas » coche tout', () => {
    expect(checkedCalendarKeys(calendars, { readsAll: true, selected: [] }).size).toBe(3)
  })

  it('cocher un deuxième agenda envoie la liste ENTIÈRE', () => {
    const checked = checkedCalendarKeys(calendars, { readsAll: false, selected: [] })
    const next = toggleCalendarSelection(calendars, checked, calendars[1]!)

    expect(next.kind).toBe('some')
    expect(next.refs).toEqual([
      { provider: 'google', calendarId: 'moi' },
      { provider: 'google', calendarId: 'equipe' },
    ])
  })

  it('tout cocher à la main veut dire « tous mes agendas », pas une liste figée', () => {
    // La nuance compte : un agenda partagé demain doit entrer tout seul dans
    // « tous », alors qu'une liste de trois identifiants l'ignorerait.
    const checked = new Set(['google:moi', 'google:equipe'])
    expect(toggleCalendarSelection(calendars, checked, calendars[2]!).kind).toBe('all')
  })

  it('décocher le dernier agenda ne fait rien', () => {
    // « Aucun agenda » n'est pas un réglage : ce serait un écran vide sans rien
    // pour le comprendre.
    const checked = new Set(['google:moi'])
    expect(toggleCalendarSelection(calendars, checked, calendars[0]!)).toEqual({ kind: 'noop', refs: [] })
  })

  it('décocher « Jours fériés » quand tout est coché rend une liste', () => {
    const checked = checkedCalendarKeys(calendars, { readsAll: true, selected: [] })
    const next = toggleCalendarSelection(calendars, checked, calendars[2]!)

    expect(next.kind).toBe('some')
    expect(next.refs.map(ref => ref.calendarId)).toEqual(['moi', 'equipe'])
  })
})

describe('#2390.16 — un évènement privé n’affiche que « Indisponible »', () => {
  const labels = { busy: 'Indisponible', untitled: 'Sans titre' }

  it('un créneau busyOnly montre « Indisponible », jamais un titre', () => {
    expect(agendaEventTitle({ summary: 'Médecin', busyOnly: true }, labels)).toBe('Indisponible')
  })

  it('un évènement ordinaire garde son titre, ou « Sans titre » s’il n’en a pas', () => {
    expect(agendaEventTitle({ summary: 'Point ACME' }, labels)).toBe('Point ACME')
    expect(agendaEventTitle({ summary: null }, labels)).toBe('Sans titre')
  })
})
