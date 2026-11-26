import type { AgendaCalendars, AgendaEvent, AgendaWindow } from '@bellum/contracts'
import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Le plateau agenda, rendu pour de vrai.
 *
 * Les calculs sont testés à côté (`agenda-view.test.ts`) ; ce qui se vérifie
 * ici est ce que le calcul ne dit pas : que le lien de visio est bien un
 * ÉLÉMENT CLIQUABLE avec son URL, que la semaine montre sept jours, et que
 * cocher un agenda envoie la liste entière. Trois choses qui ne cassent pas le
 * build quand elles cassent.
 */

const selectMany = vi.fn()
const selectAll = vi.fn()
let calendars: AgendaCalendars
let window_: AgendaWindow
// #2926 — l'état des deux lectures (évènements, plages libres), pour prouver qu'on ne
// dessine « N h de libre » qu'une fois l'agenda LU.
let windowFetching = false
let freeSlotsQuery: {
  data: { start: string; end: string; minutes: number }[]
  isFetching?: boolean
  isPlaceholderData?: boolean
} = { data: [] }
// #2770 (#2101.19/.21/.22/.37) — les identifiants que le plateau croise avec
// `event.id`. Vide par défaut : ces tests ne portent pas sur cette
// distinction, sauf le describe dédié plus bas qui la réassigne.
let bellumCreatedEventIds: string[] = []

vi.mock('@/features/briefing/api', () => ({
  useBellumCreatedEventIds: () => ({ data: { eventIds: bellumCreatedEventIds } }),
}))

vi.mock('../api', () => ({
  useAgendaCalendars: () => ({ data: calendars }),
  useAgendaWindow: () => ({
    data: window_,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    isFetching: windowFetching,
  }),
  // Les trous de la journée : vides ici, ces tests portent sur le plateau et
  // son sélecteur, pas sur ce que la grille dessine.
  useFreeSlots: () => freeSlotsQuery,
  // La capacité du fournisseur et l'écriture : ces tests portent sur le plateau
  // et son sélecteur, pas sur le déplacement — dont la confirmation a son
  // propre garde (`reschedule-needs-confirmation.test.ts`).
  useAgendaStatus: () => ({ data: undefined }),
  useRescheduleEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateAgendaEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useSelectAgendaCalendars: () => ({ mutate: selectMany, isPending: false, isError: false }),
  useSelectAllAgendaCalendars: () => ({ mutate: selectAll, isPending: false, isError: false }),
  useSelectAgendaCalendar: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

// #2926 — le pré-brief RÉEL dépend de comptes/missions/timeline (hors sujet de
// ce fichier, déjà couvert par `MeetingPrepDialog.test.tsx`) : un double léger
// suffit à prouver QUEL évènement le plateau lui a transmis.
vi.mock('./MeetingPrepDialog', () => ({
  MeetingPrepDialog: ({ event }: { event: { summary?: string | null } | null }) =>
    event ? <div data-testid="prep-dialog">{event.summary}</div> : null,
}))

// #3788.5 — `NewEventDialog` (monté même fermé, comme les autres dialogues du
// plateau) lit maintenant `useIsDemo` : hors sujet de ce fichier, qui porte
// sur le plateau lui-même (son propre garde : `NewEventDialog.demo.test.tsx`).
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

// Théo A today-agenda.A5 — le sélecteur de compte a son propre test (`AgendaSlotProposalPicker.test.tsx`).
vi.mock('./AgendaSlotProposalPicker', () => ({ AgendaSlotProposalPicker: () => null }))

const { AgendaBoard } = await import('./AgendaBoard')

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

function inHours(hours: number): string {
  return new Date(Date.now() + hours * 3600_000).toISOString()
}

beforeEach(() => {
  // Horloge FIGÉE en milieu de journée. Sans elle, ce test tombait entre 22 h et
  // minuit : `inHours(1)` / `inHours(2)` débordaient sur le lendemain, la colonne
  // du jour se retrouvait vide, et le bouton « Rejoindre » n'existait plus. Un
  // test rouge une fois sur douze se lit comme une régression du produit — or
  // c'est justement celui qui garde le geste de 9 h 58.
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-08-17T09:00:00Z'))
  selectMany.mockClear()
  selectAll.mockClear()
  bellumCreatedEventIds = []
  windowFetching = false
  freeSlotsQuery = { data: [] }
  calendars = {
    calendars: [
      { id: 'moi', name: 'Mon agenda', provider: 'google', primary: true, canWrite: true },
      { id: 'equipe', name: 'Équipe commerciale', provider: 'google', primary: false, canWrite: false },
    ],
    selectedCalendars: [],
    readsAll: false,
    unavailable: [],
  }
  window_ = {
    events: [
      event({
        id: 'cadrage',
        summary: 'Cadrage refonte',
        start: inHours(0.2),
        end: inHours(1),
        conferenceUrl: 'https://meet.example/cadrage',
      }),
      event({ id: 'sans-visio', summary: 'Point interne', start: inHours(2), end: inHours(3) }),
    ],
    unavailable: [],
  }
})

describe('le plateau agenda', () => {
  it('rend le lien de visio comme un BOUTON cliquable, avec son adresse', () => {
    // Le geste de 9 h 58 est de cliquer pour entrer, pas de recopier une URL.
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)

    const join = screen.getByRole('link', { name: /rejoindre/i })
    expect(join).toHaveAttribute('href', 'https://meet.example/cadrage')
    expect(join).toHaveAttribute('target', '_blank')
  })

  it('n’affiche aucun bouton pour un rendez-vous sans visio', () => {
    // Un bouton présent mais inerte se clique quand même, et on découvre à ce
    // moment-là qu'il n'y a pas de lien.
    window_ = {
      events: [event({ id: 'seul', summary: 'Point interne', start: inHours(2), end: inHours(3) })],
      unavailable: [],
    }
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)

    expect(screen.queryByRole('link', { name: /rejoindre/i })).toBeNull()
  })

  it('montre les sept jours de la semaine, y compris ceux sans rendez-vous', () => {
    // Un mercredi absent du tableau se lirait « il manque un jour ».
    render(<AgendaBoard enabled mode="week" onModeChange={vi.fn()} />)

    expect(screen.getAllByTestId('agenda-day')).toHaveLength(7)
  })

  // Théo A today-agenda.R4 — jour vide = titre seul : aucune ligne « — » ni phrase d'absence.
  it('un jour sans rendez-vous ne garde que son titre', () => {
    window_ = { events: [], unavailable: [] }
    render(<AgendaBoard enabled mode="week" onModeChange={vi.fn()} />)

    for (const day of screen.getAllByTestId('agenda-day')) {
      expect(day.querySelector('button, a')).toBeNull()
      expect(day).not.toHaveTextContent('—')
      expect(day).not.toHaveTextContent(/aucun/i)
    }
  })

  // Théo A today-agenda.N2 — la phrase de synthèse de la semaine.
  it('annonce le nombre de rendez-vous de la semaine', () => {
    render(<AgendaBoard enabled mode="week" onModeChange={vi.fn()} />)

    expect(screen.getByText('2 rendez-vous cette semaine')).toBeInTheDocument()
  })

  // Théo A today-agenda.R2 — le basculeur Jour / Semaine disparaît ; un simple lien reste.
  it('n’a plus de basculeur Jour/Semaine, mais un lien vers l’autre vue', () => {
    const onModeChange = vi.fn()
    render(<AgendaBoard enabled mode="week" onModeChange={onModeChange} />)

    expect(screen.queryByRole('button', { name: 'Semaine' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Voir la journée' }))
    expect(onModeChange).toHaveBeenCalledWith('day')
  })

  // Théo A today-agenda.A3 — une seule pastille « n points » par carte.
  it('résume les points d’un rendez-vous en UNE pastille', () => {
    window_ = {
      events: [
        event({
          id: 'ext',
          summary: 'Cadrage data',
          start: inHours(2),
          end: inHours(3),
          attendees: [
            { email: 'client@dehors.example', displayName: 'Client', responseStatus: 'accepted', external: true },
          ],
        }),
        event({ id: 'simple', summary: 'Point interne', start: inHours(4), end: inHours(5) }),
      ],
      unavailable: [],
    }
    render(<AgendaBoard enabled mode="week" onModeChange={vi.fn()} conflictingIds={new Set(['ext'])} />)

    expect(screen.getAllByText('2 points')).toHaveLength(1)
  })

  // Théo A today-agenda.A2 — reprogrammer par une modale, jamais par glisser.
  it('« Reprogrammer » ouvre la modale de déplacement du rendez-vous', () => {
    render(<AgendaBoard enabled mode="week" onModeChange={vi.fn()} />)

    fireEvent.click(screen.getAllByRole('button', { name: /Reprogrammer/ })[0]!)

    expect(screen.getByText('Déplacer ce rendez-vous ?')).toBeInTheDocument()
  })

  // Théo A today-agenda.R3 — « Ajouter un rendez-vous » en tête de page.
  it('« Ajouter un rendez-vous » ouvre le formulaire avec date, heure et durée', () => {
    render(<AgendaBoard enabled mode="week" onModeChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un rendez-vous' }))

    expect(screen.getByLabelText('Date')).toBeInTheDocument()
    expect(screen.getByLabelText('Heure')).toBeInTheDocument()
    expect(screen.getByLabelText('Durée (minutes)')).toBeInTheDocument()
  })

  // #2926 (reste R05/R06, 29/09) — en prod, une carte de la semaine ne
  // s'ouvrait au clic d'AUCUNE façon : ni pré-brief (fuseaux de l'invité), ni
  // boîte de conflit (réponses, délégation). Les deux vivaient déjà ailleurs
  // (jour, panneau des priorités) — seule la carte de la semaine n'y menait pas.
  it('un rendez-vous de la semaine SANS conflit s’ouvre au clic — le pré-brief', () => {
    render(<AgendaBoard enabled mode="week" onModeChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /^(?!Reprogrammer).*Cadrage refonte/ }))

    expect(screen.getByTestId('prep-dialog')).toHaveTextContent('Cadrage refonte')
  })

  it('un rendez-vous de la semaine EN CONFLIT s’ouvre vers la boîte de conflit, pas le pré-brief', () => {
    const onOpenConflict = vi.fn()
    render(
      <AgendaBoard
        enabled
        mode="week"
        onModeChange={vi.fn()}
        conflictingIds={new Set(['cadrage'])}
        onOpenConflict={onOpenConflict}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^(?!Reprogrammer).*Cadrage refonte/ }))

    expect(onOpenConflict).toHaveBeenCalledWith(expect.objectContaining({ id: 'cadrage' }))
    expect(screen.queryByTestId('prep-dialog')).toBeNull()
  })

  it('un rendez-vous en conflit SANS `onOpenConflict` retombe sur le pré-brief — jamais un clic muet', () => {
    // `onOpenConflict` absent (écran qui ne porte pas encore la liste des
    // conflits) : la carte reste ouvrable, comme avant #2926.
    render(<AgendaBoard enabled mode="week" onModeChange={vi.fn()} conflictingIds={new Set(['cadrage'])} />)

    fireEvent.click(screen.getByRole('button', { name: /^(?!Reprogrammer).*Cadrage refonte/ }))

    expect(screen.getByTestId('prep-dialog')).toHaveTextContent('Cadrage refonte')
  })

  it('nomme l’agenda qui n’a pas répondu', () => {
    window_ = {
      events: [],
      unavailable: [{ provider: 'google', reason: 'events_unavailable', calendarName: 'Équipe commerciale' }],
    }
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)

    expect(screen.getByText(/Équipe commerciale/)).toBeInTheDocument()
  })

  it('cocher un second agenda envoie la LISTE entière', () => {
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: /mon agenda/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /équipe commerciale/i }))

    expect(selectMany).not.toHaveBeenCalled()
    // Deux agendas sur deux = « tous mes agendas », et non une liste figée : un
    // agenda partagé demain doit en faire partie tout seul.
    expect(selectAll).toHaveBeenCalled()
  })

  it('marque, dans la semaine, un rendez-vous PROPOSÉ et lui seul', () => {
    // Le même défaut que la grille du jour, vu cette fois dans la vue semaine :
    // un créneau proposé et un rendez-vous confirmé se rendaient identiques.
    window_ = {
      events: [
        event({ id: 'propose', summary: 'À confirmer', status: 'tentative', start: inHours(2), end: inHours(3) }),
        event({ id: 'confirme', summary: 'Cadrage', status: 'confirmed', start: inHours(4), end: inHours(5) }),
      ],
      unavailable: [],
    }
    const { container } = render(<AgendaBoard enabled mode="week" onModeChange={vi.fn()} />)

    expect(container.querySelectorAll('[aria-label="Proposé"]')).toHaveLength(1)
  })

  it('un statut ABSENT ne se rend ni PROPOSÉ ni confirmé, dans la semaine', () => {
    window_ = {
      events: [event({ id: 'sans-statut', summary: 'Point', status: null, start: inHours(2), end: inHours(3) })],
      unavailable: [],
    }
    const { container } = render(<AgendaBoard enabled mode="week" onModeChange={vi.fn()} />)

    expect(container.querySelector('[aria-label="Proposé"]')).toBeNull()
  })

  it('#2770 (#2101.19/.21/.22/.37) — marque, dans la semaine, un rendez-vous ÉCRIT par la porte de proposition', () => {
    window_ = {
      events: [
        event({ id: 'bellum', summary: 'Point de suivi', status: 'confirmed', start: inHours(2), end: inHours(3) }),
        event({ id: 'manuel', summary: 'Cadrage', status: 'confirmed', start: inHours(4), end: inHours(5) }),
      ],
      unavailable: [],
    }
    // La liste croisée est l'unique source de vérité : `window_` lui-même ne
    // porte pas `createdByBellum`, exactement comme le vrai serveur (jamais
    // rendu par un fournisseur).
    bellumCreatedEventIds = ['bellum']
    const { container } = render(<AgendaBoard enabled mode="week" onModeChange={vi.fn()} />)

    expect(container.querySelectorAll('[aria-label^="Confirmé — proposé par"]')).toHaveLength(1)
  })

  // #2103.27 (épopée #2878) — un rendez-vous annulé était filtré avant tout
  // rendu : la personne ne savait jamais QU'IL AVAIT ÉTÉ annulé, seulement
  // qu'il n'était plus là. Un second chemin, lecture seule, hors de la grille
  // et de son glisser-déposer : aucune action, juste le fait nommé.
  it('nomme un rendez-vous annulé dans une section lecture seule, hors grille', () => {
    window_ = {
      events: [
        event({ id: 'cadrage', summary: 'Cadrage refonte', start: inHours(0.2), end: inHours(1) }),
        event({ id: 'annule', summary: 'Point annulé', start: inHours(2), end: inHours(3), cancelled: true }),
      ],
      unavailable: [],
    }
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)

    expect(screen.getByText('Point annulé')).toBeInTheDocument()
    expect(screen.getByText('1 rendez-vous annulé')).toBeInTheDocument()
    // Ni bouton ni lien : lecture seule, aucune action possible sur cette ligne.
    expect(screen.queryByRole('button', { name: /point annulé/i })).toBeNull()
  })

  it('n’affiche aucune section « annulé » en l’absence d’annulation', () => {
    // On n'affiche pas ce qu'on n'a pas : zéro annulation ne fait aucune ligne.
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)

    expect(screen.queryByText(/annulé/i)).toBeNull()
  })

  // #2390.9 — une salle réservée (`AgendaAttendee.resource`) n'est jamais une
  // personne invitée : elle s'affiche à part, sur sa propre ligne, et ne pèse
  // jamais dans le compte des invités externes. `EventCard` (via `DayColumn`)
  // est le patron de la journée SOUS 768px (#2097) — la vue « jour » de bureau
  // passe par `AgendaGrid` (garde séparée, `AgendaGrid.test.tsx`).
  it('#2390.9 — nomme la salle à part, jamais comptée comme invité externe', () => {
    stubMatchMedia(true)
    window_ = {
      events: [
        event({
          id: 'avec-salle',
          summary: 'Point recrutement',
          start: inHours(2),
          end: inHours(3),
          attendees: [
            {
              email: 'client@dehors.example',
              displayName: 'Client Externe',
              responseStatus: 'accepted',
              external: true,
            },
            {
              email: 'salle-debussy@bellum.example',
              displayName: 'Salle Debussy',
              responseStatus: 'accepted',
              external: false,
              resource: true,
            },
          ],
        }),
      ],
      unavailable: [],
    }
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)

    expect(screen.getByText('Salle : Salle Debussy')).toBeInTheDocument()
    // Un seul VRAI invité externe : la salle n'est jamais comptée avec lui.
    expect(screen.getByText('1 invité externe')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('#2390.9 — aucune ligne « Salle » quand l’évènement n’en porte pas', () => {
    stubMatchMedia(true)
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)

    expect(screen.queryByText(/^Salle :/)).toBeNull()
    vi.unstubAllGlobals()
  })
})

/**
 * #2097 (correctif du 26/09, mesuré sur iPhone en prod) — SOUS 768px, LA
 * JOURNÉE EST UNE LISTE, JAMAIS LA GRILLE HORAIRE VIDE.
 *
 * La grille (`AgendaGrid`) place chaque rendez-vous par pourcentage de la
 * fenêtre du jour ; sur une largeur de téléphone, ses colonnes d'heures ne
 * tiennent pas et le résultat mesuré était une bande d'heures sans aucun
 * rendez-vous lisible. `DayColumn` (déjà le patron de la vue semaine) rend la
 * MÊME donnée en liste : heure + titre, et « Aucun rendez-vous ce jour. »
 * quand il n'y en a aucun — jamais un rectangle qui semble vide sans le dire.
 */
describe('sous 768px, la journée devient une liste (#2097, correctif du 26/09)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('un rendez-vous s’affiche par son HEURE et son TITRE, pas dans la grille', () => {
    stubMatchMedia(true)
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)

    expect(screen.getByText('Cadrage refonte')).toBeInTheDocument()
    expect(screen.getByText('Point interne')).toBeInTheDocument()
  })

  it('sans aucun rendez-vous, la ligne dédiée s’affiche — jamais une grille horaire vide', () => {
    stubMatchMedia(true)
    window_ = { events: [], unavailable: [] }
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)

    expect(screen.getByText('Aucun rendez-vous ce jour.')).toBeInTheDocument()
  })

  it('au bureau, le même jour reste la GRILLE — non-régression', () => {
    stubMatchMedia(false)
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)

    expect(screen.getByRole('link', { name: /rejoindre/i })).toBeInTheDocument()
  })
})

/**
 * jsdom n'implémente pas `matchMedia` : sans ce faux, `useIsMobile` (via
 * `AgendaBoard`) retombe sur son repli bureau, ce qui est le comportement
 * historique que les tests ci-dessus n'ont pas à re-router.
 */
function stubMatchMedia(narrow: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: narrow && query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

/**
 * #2926 (recette prod 02/10, /briefing vue Jour) — « 5 h de libre » s'affichait
 * avant la fin du chargement, puis « 3 h », puis « 2 h » : des plages libres
 * calculées sur un agenda lu à moitié. On ne dessine RIEN tant que l'agenda
 * n'est pas lu.
 */
describe('les plages libres ne se dessinent qu’une fois l’agenda lu (#2926)', () => {
  const slot = () => ({
    start: new Date(Date.now() + 3 * 3600_000).toISOString(),
    end: new Date(Date.now() + 8 * 3600_000).toISOString(),
    minutes: 300,
  })

  it('dessine la plage libre quand les deux lectures sont terminées', () => {
    freeSlotsQuery = { data: [slot()], isFetching: false, isPlaceholderData: false }
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /de libre/ })).toBeInTheDocument()
  })

  it('ne dessine rien tant que la lecture des plages libres est en cours', () => {
    freeSlotsQuery = { data: [slot()], isFetching: true, isPlaceholderData: false }
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /de libre/ })).toBeNull()
  })

  it('ne dessine rien tant que la lecture des évènements est en cours', () => {
    windowFetching = true
    freeSlotsQuery = { data: [slot()], isFetching: false, isPlaceholderData: false }
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /de libre/ })).toBeNull()
  })

  it('ne dessine pas les plages d’une AUTRE journée gardées en attendant (placeholder)', () => {
    freeSlotsQuery = { data: [slot()], isFetching: false, isPlaceholderData: true }
    render(<AgendaBoard enabled mode="day" onModeChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /de libre/ })).toBeNull()
  })
})
