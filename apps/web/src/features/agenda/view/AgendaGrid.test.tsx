import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DEFAULT_BRAND_NAME, type AgendaEvent } from '@bellum/contracts'
import { AgendaGrid } from './AgendaGrid'

/**
 * La grille doit être MANIPULABLE, pas seulement bien dessinée.
 *
 * Le défaut que ce test verrouille est passé sous les gardes de structure : le
 * bloc d'un rendez-vous était `disabled` dès qu'aucun gestionnaire de clic
 * n'était fourni, et un élément désactivé ne reçoit aucun évènement de souris.
 * Le glisser-déposer était donc entièrement inerte — sans rien casser
 * d'apparent : le curseur devenait bien une main, et il ne se passait rien.
 *
 * Aucun test de source ne pouvait le voir, parce que tout le code était là et
 * correctement câblé. Il faut monter le composant et pousser la souris.
 */

vi.mock('./AgendaBoard', () => ({ JoinButton: () => null }))

function event(partial: Partial<AgendaEvent> = {}): AgendaEvent {
  const day = new Date(2026, 7, 18)
  return {
    id: 'e1',
    summary: 'Cadrage',
    description: null,
    location: null,
    start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 14, 0).toISOString(),
    end: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 15, 0).toISOString(),
    organizer: null,
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: null,
    isExternal: false,
    cancelled: false,
    ...partial,
  }
}

const NOW = new Date(2026, 7, 18, 12, 0)

describe('AgendaGrid — le geste', () => {
  it('rend le bloc manipulable dès qu’un déplacement est possible', () => {
    render(<AgendaGrid events={[event()]} freeSlots={[]} now={NOW} language="fr" onDragEnd={vi.fn()} />)
    // `onOpenEvent` n'est PAS fourni : c'est exactement la configuration de
    // l'écran réel, et c'est elle qui désactivait le bloc.
    expect(screen.getByRole('button', { name: /Cadrage/ })).not.toBeDisabled()
  })

  it('propose un nouvel horaire à la fin du geste', () => {
    const onDragEnd = vi.fn()
    render(<AgendaGrid events={[event()]} freeSlots={[]} now={NOW} language="fr" onDragEnd={onDragEnd} />)

    const block = screen.getByRole('button', { name: /Cadrage/ })
    fireEvent.mouseDown(block, { button: 0, clientY: 100 })
    fireEvent.mouseMove(window, { clientY: 200 })
    fireEvent.mouseUp(window, { clientY: 200 })

    expect(onDragEnd).toHaveBeenCalledTimes(1)
    const [, proposal] = onDragEnd.mock.calls[0]!
    // Déplacé vers le bas, et la durée est conservée — la promesse du geste.
    expect(proposal.startMinutes).toBeGreaterThan(14 * 60)
    expect(proposal.endMinutes - proposal.startMinutes).toBe(60)
  })

  it('ne propose RIEN quand la souris n’a pas bougé', () => {
    // Un simple clic ne doit pas ouvrir une confirmation, et surtout pas
    // prévenir les invités d'un changement inexistant.
    const onDragEnd = vi.fn()
    render(<AgendaGrid events={[event()]} freeSlots={[]} now={NOW} language="fr" onDragEnd={onDragEnd} />)

    const block = screen.getByRole('button', { name: /Cadrage/ })
    fireEvent.mouseDown(block, { button: 0, clientY: 100 })
    fireEvent.mouseUp(window, { clientY: 100 })

    expect(onDragEnd).not.toHaveBeenCalled()
  })

  it('un clic sur un rendez-vous à l’heure BANCALE ne propose aucun déplacement', () => {
    // Le défaut vu en production : un rendez-vous de 16 h 54 aimanté au quart
    // d'heure donne 17 h, donc un appui parfaitement immobile produisait une
    // proposition. Cliquer pour PRÉPARER ouvrait la confirmation de
    // déplacement par-dessus, prête à prévenir les invités.
    const onDragEnd = vi.fn()
    const onOpenEvent = vi.fn()
    const bancal = event({
      start: new Date(2026, 7, 18, 16, 54).toISOString(),
      end: new Date(2026, 7, 18, 17, 54).toISOString(),
    })
    render(
      <AgendaGrid
        events={[bancal]}
        freeSlots={[]}
        now={NOW}
        language="fr"
        onDragEnd={onDragEnd}
        onOpenEvent={onOpenEvent}
      />,
    )

    const block = screen.getByRole('button', { name: /Cadrage/ })
    fireEvent.mouseDown(block, { button: 0, clientY: 300 })
    // Deux pixels : le tremblement d'une main qui clique, pas un geste.
    fireEvent.mouseMove(window, { clientY: 302 })
    fireEvent.mouseUp(window, { clientY: 302 })
    fireEvent.click(block)

    expect(onDragEnd).not.toHaveBeenCalled()
    expect(onOpenEvent).toHaveBeenCalledTimes(1)
  })

  it('ignore un bouton de souris autre que le gauche', () => {
    // Un clic droit ouvre le menu du navigateur : le rendez-vous resterait
    // accroché au pointeur sans que rien ne le relâche.
    const onDragEnd = vi.fn()
    render(<AgendaGrid events={[event()]} freeSlots={[]} now={NOW} language="fr" onDragEnd={onDragEnd} />)

    const block = screen.getByRole('button', { name: /Cadrage/ })
    fireEvent.mouseDown(block, { button: 2, clientY: 100 })
    fireEvent.mouseMove(window, { clientY: 200 })
    fireEvent.mouseUp(window, { clientY: 200 })

    expect(onDragEnd).not.toHaveBeenCalled()
  })

  it('rend une plage libre CLIQUABLE quand la création est offerte', () => {
    // Même famille de défaut que le bloc désactivé : le bouton d'une plage
    // libre porte `disabled={!onPickFreeSlot}`, et un élément désactivé ne
    // reçoit aucun clic. Le vérifier dans la configuration réelle de l'écran.
    const onPickFreeSlot = vi.fn()
    const slot = {
      start: new Date(2026, 7, 18, 10, 0).toISOString(),
      end: new Date(2026, 7, 18, 11, 0).toISOString(),
      minutes: 60,
    }
    render(<AgendaGrid events={[]} freeSlots={[slot]} now={NOW} language="fr" onPickFreeSlot={onPickFreeSlot} />)
    // La durée est écrite en heures dès qu'elle en fait une : on vise donc le
    // mot stable du libellé, pas sa mise en forme.
    const free = screen.getByRole('button', { name: /libre/ })
    expect(free).not.toBeDisabled()
    fireEvent.click(free)
    // La plage transmise est celle du trou ENTIER, pas une tranche.
    expect(onPickFreeSlot).toHaveBeenCalledWith(expect.objectContaining({ minutes: 60 }))
  })

  it('ouvre la préparation au clic sur un rendez-vous', () => {
    const onOpenEvent = vi.fn()
    render(<AgendaGrid events={[event()]} freeSlots={[]} now={NOW} language="fr" onOpenEvent={onOpenEvent} />)
    fireEvent.click(screen.getByRole('button', { name: /Cadrage/ }))
    expect(onOpenEvent).toHaveBeenCalledTimes(1)
  })

  it('reste inerte quand l’écran ne permet aucun geste', () => {
    render(<AgendaGrid events={[event()]} freeSlots={[]} now={NOW} language="fr" />)
    expect(screen.getByRole('button', { name: /Cadrage/ })).toBeDisabled()
  })
})

describe('AgendaGrid — un créneau proposé ne se rend pas comme un rendez-vous confirmé', () => {
  it('marque un rendez-vous PROPOSÉ, et lui seul', () => {
    // Le défaut mesuré : trois rendez-vous côte à côte, identiques à l'écran,
    // alors qu'un seul est réellement fixé.
    const propose = event({ id: 'propose', status: 'tentative' })
    const confirme = event({ id: 'confirme', status: 'confirmed' })
    const { container } = render(<AgendaGrid events={[propose, confirme]} freeSlots={[]} now={NOW} language="fr" />)

    expect(container.querySelectorAll('[aria-label="Proposé"]')).toHaveLength(1)
  })

  it('un statut ABSENT ne se rend ni PROPOSÉ ni confirmé', () => {
    // « non mesuré » n'est jamais « 0 » : un statut qu'on n'a pas su lire ne
    // vaut ni « en attente », ni « confirmé ».
    const sansStatut = event({ id: 'sans-statut', status: null })
    const { container } = render(<AgendaGrid events={[sansStatut]} freeSlots={[]} now={NOW} language="fr" />)

    expect(container.querySelector('[aria-label="Proposé"]')).toBeNull()
  })
})

describe('AgendaGrid — #2770 (#2101.19/.21/.22/.37) — l’origine d’un rendez-vous déjà FIXÉ', () => {
  // GA-252 — la marque passe par {{brand}} (`DEFAULT_BRAND_NAME`), jamais un
  // « BellumAI » écrit en dur dans la traduction ou dans ce test.
  const CREATED_BY_BELLUM_LABEL = `Confirmé — proposé par ${DEFAULT_BRAND_NAME}`

  it('marque un rendez-vous ÉCRIT par la porte de proposition, distinct du créneau encore proposé', () => {
    const createdByBellum = event({ id: 'bellum', status: 'confirmed', createdByBellum: true })
    const confirme = event({ id: 'confirme', status: 'confirmed' })
    const { container } = render(
      <AgendaGrid events={[createdByBellum, confirme]} freeSlots={[]} now={NOW} language="fr" />,
    )

    expect(container.querySelectorAll(`[aria-label="${CREATED_BY_BELLUM_LABEL}"]`)).toHaveLength(1)
  })

  it('`createdByBellum: false` ne se rend PAS marqué — jamais confondu avec un geste manuel', () => {
    const manuel = event({ id: 'manuel', status: 'confirmed', createdByBellum: false })
    const { container } = render(<AgendaGrid events={[manuel]} freeSlots={[]} now={NOW} language="fr" />)

    expect(container.querySelector(`[aria-label="${CREATED_BY_BELLUM_LABEL}"]`)).toBeNull()
  })
})

describe('AgendaGrid — une série récurrente se distingue (#2103.29)', () => {
  it('marque un rendez-vous récurrent, et lui seul', () => {
    const recurrent = event({ id: 'recurrent', recurring: true })
    const ponctuel = event({ id: 'ponctuel', recurring: false })
    const { container } = render(<AgendaGrid events={[recurrent, ponctuel]} freeSlots={[]} now={NOW} language="fr" />)

    expect(container.querySelectorAll('[aria-label="Récurrent"]')).toHaveLength(1)
  })

  it('un champ ABSENT ne se rend pas récurrent', () => {
    const sansChamp = event({ id: 'sans-champ' })
    const { container } = render(<AgendaGrid events={[sansChamp]} freeSlots={[]} now={NOW} language="fr" />)

    expect(container.querySelector('[aria-label="Récurrent"]')).toBeNull()
  })
})

/**
 * #2094.31 / #2097.32 — AUCUN SCROLL INTERNE DANS LA CARTE.
 *
 * La grille en mode jour dessine des heures « pleine journée » : sa hauteur
 * EST l'échelle de temps (`shrink-0` + `height: gridHeight`, sans wrapper
 * `overflow-y-auto`), pour que 8 h ne compriment jamais en 46 px par heure. Un
 * second scroll DANS la carte, sous celui de la page, cacherait le début ou
 * la fin de la journée derrière une barre invisible au premier coup d'œil.
 */
/**
 * #2390.9 — LA SALLE RÉSERVÉE, JAMAIS UNE PERSONNE.
 *
 * `AgendaAttendee.resource` marque un invité que Google/Microsoft rendent
 * eux-mêmes comme une SALLE. La tooltip du bloc listait déjà « N invités » et
 * « M invités externes » — sans en exclure la salle, qui s'y comptait comme
 * une personne. Elle s'affiche désormais à part, sur sa propre ligne.
 */
describe('AgendaGrid — la salle réservée ne compte jamais comme un invité (#2390.9)', () => {
  it('nomme la salle à part et l’exclut du compte d’invités', async () => {
    const avecSalle = event({
      id: 'avec-salle',
      summary: 'Point recrutement',
      attendees: [
        { email: 'client@dehors.example', displayName: 'Client Externe', responseStatus: 'accepted', external: true },
        {
          email: 'salle-debussy@bellum.example',
          displayName: 'Salle Debussy',
          responseStatus: 'accepted',
          external: false,
          resource: true,
        },
      ],
    })
    render(<AgendaGrid events={[avecSalle]} freeSlots={[]} now={NOW} language="fr" />)

    await userEvent.hover(screen.getByRole('button', { name: /Point recrutement/ }))
    const tooltip = await screen.findByRole('tooltip')

    // Un seul VRAI invité, un seul VRAI invité externe : la salle n'est comptée
    // dans aucun des deux.
    expect(within(tooltip).getByText('1 invité · 1 invité externe')).toBeInTheDocument()
    expect(within(tooltip).getByText('Salle : Salle Debussy')).toBeInTheDocument()
  })

  it('aucune ligne « Salle » quand l’évènement n’en porte pas', async () => {
    render(<AgendaGrid events={[event()]} freeSlots={[]} now={NOW} language="fr" />)

    await userEvent.hover(screen.getByRole('button', { name: /Cadrage/ }))
    const tooltip = await screen.findByRole('tooltip')

    expect(within(tooltip).queryByText(/^Salle :/)).toBeNull()
  })
})

describe('#2094.31 / #2097.32 — la carte de l’agenda ne scrolle jamais en interne', () => {
  it('ne pose aucune classe overflow-y sur la grille, même avec une journée chargée', () => {
    const longue = Array.from({ length: 12 }, (_, i) => event({ id: `e${i}`, summary: `RDV ${i}` }))
    const { container } = render(<AgendaGrid events={longue} freeSlots={[]} now={NOW} language="fr" />)

    const overflowing = Array.from(container.querySelectorAll('*')).filter(el =>
      /overflow-y-(auto|scroll)/.test(el.className.toString()),
    )
    expect(overflowing).toHaveLength(0)
  })
})

/**
 * #2926 (recette prod 02/10, /briefing vue Jour) — un rendez-vous COURT
 * (12:00 « Rendez-vous personnel ») se rendait à ≈ 12 px de haut, titre
 * tronqué. Hauteur minimale lisible, et l'heure et le titre sur UNE ligne quand
 * le bloc est court.
 */
describe('AgendaGrid — un rendez-vous court reste lisible (#2926)', () => {
  const short = () =>
    event({
      id: 'short',
      summary: 'Rendez-vous personnel',
      start: new Date(2026, 7, 18, 12, 0).toISOString(),
      end: new Date(2026, 7, 18, 12, 15).toISOString(),
    })

  it('porte une hauteur minimale en pixels, jamais les 12 px de sa seule durée', () => {
    render(<AgendaGrid events={[short()]} freeSlots={[]} now={NOW} language="fr" />)
    const block = screen.getByRole('button', { name: /Rendez-vous personnel/ })
    expect(parseInt(block.style.minHeight, 10)).toBeGreaterThanOrEqual(28)
  })

  it('pose l’heure et le titre sur une seule ligne quand le bloc est court', () => {
    render(<AgendaGrid events={[short()]} freeSlots={[]} now={NOW} language="fr" />)
    const block = screen.getByRole('button', { name: /Rendez-vous personnel/ })
    expect(block.getAttribute('data-compact')).toBe('true')
    expect(within(block).getByText('Rendez-vous personnel').className).toContain('truncate')
  })

  it('un rendez-vous d’une heure garde sa mise en page empilée', () => {
    render(<AgendaGrid events={[event()]} freeSlots={[]} now={NOW} language="fr" />)
    expect(screen.getByRole('button', { name: /Cadrage/ }).getAttribute('data-compact')).toBe('false')
  })
})
