import type { AgendaConflict, AgendaEvent, AgendaRescheduleResult } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * LE CONTENU DE LA BOÎTE DE CONFLIT — #2102.3 / #2102.4 / #2102.5 / #2102.7,
 * et désormais #2390.11 / #2390.12 / #2390.19.
 *
 * `ConflictDialog` (#2102.1/.2) montrait déjà les deux rendez-vous, nus : un
 * titre et une heure. Le registre du 16/09 retient quatre compléments, tous
 * lisibles depuis `AgendaEvent` ou déjà écrits ailleurs dans ce dépôt :
 *  - #2102.3 — interne/externe : réutilise `agenda.external`/`agenda.internal`
 *    (`AgendaBoard.tsx`), jamais un second mot pour la même idée (GA-26).
 *  - #2102.4 — invités et durée : `guestCount` (`agenda-drag.ts`) et
 *    `durationLabel` (`duration-label.ts`), déjà écrits pour
 *    `RescheduleDialog`/`AgendaGrid`. « importance » n'a AUCUNE source dans
 *    `AgendaEvent` — elle n'est pas inventée, cf. le commentaire du composant.
 *  - #2102.7 — qui sera prévenu : `agenda.reschedule.guests`/`externals`,
 *    déjà la phrase de `RescheduleDialog` pour la MÊME question.
 *  - #2102.5 — proposer lequel déplacer, sans décider seul : un lien
 *    « Ouvrir dans l'agenda » SYMÉTRIQUE sur les deux cartes (même libellé,
 *    même position), jamais une carte mise en avant.
 *
 * #2390.11/#2390.12 (LAU-FINAL-104) — la boîte ne se contente plus de montrer :
 * chaque carte propose les résolutions que `resolveOverlap` calcule pour ELLE
 * (`conflict-resolution.test.ts` couvre le calcul lui-même, pur). #2390.19 —
 * NO-GO : un clic ouvre une confirmation, rien n'écrit avant elle.
 */

const rescheduleMutate = vi.fn(
  (
    input: { eventId: string; startsAt: string; endsAt: string; notifyGuests: boolean },
    handlers: { onSuccess: (result: AgendaRescheduleResult) => void },
  ) => {
    handlers.onSuccess({ id: input.eventId, startsAt: input.startsAt, endsAt: input.endsAt, guestsNotified: true })
  },
)

vi.mock('@/features/agenda/api', () => ({
  useAgendaStatus: () => ({ data: undefined }),
  useRescheduleEvent: () => ({ mutate: rescheduleMutate, isPending: false }),
}))

const toastSuccess = vi.fn()
vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: vi.fn() } }))

const { ConflictDialog } = await import('./ConflictDialog')

function agendaEvent(partial: Partial<AgendaEvent> & Pick<AgendaEvent, 'id'>): AgendaEvent {
  return {
    summary: 'Point client',
    description: null,
    location: null,
    // Dans le passé : hors des phases `live`/`soon` de `timingOf`, pour ne
    // jamais faire apparaître `JoinButton` (hors du périmètre de ce test).
    start: '2020-01-01T09:00:00.000Z',
    end: '2020-01-01T10:00:00.000Z',
    organizer: 'moi@bellum.fr',
    attendees: [],
    conferenceUrl: null,
    webUrl: null,
    status: 'confirmed',
    isExternal: true,
    cancelled: false,
    ...partial,
  }
}

function attendee(email: string, external: boolean) {
  return { email, displayName: null, responseStatus: null, external }
}

function renderConflict(first: AgendaEvent, second: AgendaEvent, onClose = () => {}) {
  const conflict: AgendaConflict = { first, second, overlapMinutes: 15 }
  return render(<ConflictDialog conflict={conflict} onClose={onClose} />)
}

beforeEach(() => {
  rescheduleMutate.mockClear()
})

describe('ConflictDialog — interne/externe (#2102.3)', () => {
  it('distingue les deux rendez-vous, chacun avec son propre statut', () => {
    const first = agendaEvent({ id: 'e1', summary: 'Point ACME', isExternal: true })
    const second = agendaEvent({ id: 'e2', summary: 'Point interne', isExternal: false })
    renderConflict(first, second)

    expect(screen.getAllByText('Client')).toHaveLength(1)
    expect(screen.getAllByText('Interne')).toHaveLength(1)
  })
})

describe('ConflictDialog — invités, durée, qui sera prévenu (#2102.4, #2102.7)', () => {
  it('affiche la durée réelle et le compte de personnes prévenues, externes nommées à part', () => {
    const first = agendaEvent({
      id: 'e1',
      start: '2020-01-01T09:00:00.000Z',
      end: '2020-01-01T10:00:00.000Z',
      attendees: [attendee('a@acme.com', true), attendee('b@bellum.fr', false)],
    })
    const second = agendaEvent({ id: 'e2', attendees: [] })
    renderConflict(first, second)

    // Durée réelle (1 h), pas un nombre de minutes brut — sur les DEUX cartes,
    // le second rendez-vous du fixture ayant la même durée par défaut.
    expect(screen.getAllByText(/1 h/).length).toBeGreaterThan(0)
    // Même phrase que `RescheduleDialog` pour « qui sera prévenu ».
    expect(screen.getByText(/2 invités seront prévenus/)).toBeInTheDocument()
    expect(screen.getByText(/dont 1 externe/)).toBeInTheDocument()
  })

  it('sans invité, ne prétend prévenir personne (pas de « 0 invité »)', () => {
    const first = agendaEvent({ id: 'e1', attendees: [] })
    const second = agendaEvent({ id: 'e2', attendees: [] })
    renderConflict(first, second)

    expect(screen.queryByText(/seront prévenus/)).not.toBeInTheDocument()
  })
})

// #2102.4 (arbitrage Louis 31/10) — l'IMPORTANCE d'un conflit = le TYPE de réunion (client vs interne), lu sur
// ce que l'évènement porte déjà (`isExternal`). Jamais une importance inventée ; jamais un déplacement automatique.
describe('ConflictDialog — importance = type de réunion (#2102.4)', () => {
  it('nomme l’importance de CHAQUE carte d’après son type : client plus haut qu’interne', () => {
    renderConflict(agendaEvent({ id: 'e1', isExternal: true }), agendaEvent({ id: 'e2', isExternal: false }))
    expect(screen.getByText('Importance : élevée (rendez-vous client)')).toBeInTheDocument()
    expect(screen.getByText('Importance : standard (point interne)')).toBeInTheDocument()
  })

  it('dit lequel pèse davantage, et laisse le choix à l’utilisateur', () => {
    renderConflict(agendaEvent({ id: 'e1', isExternal: false }), agendaEvent({ id: 'e2', isExternal: true }))
    expect(screen.getByText(/Le rendez-vous client pèse davantage que le point interne/)).toBeInTheDocument()
    expect(screen.getByText(/rien ne bouge sans ta confirmation/)).toBeInTheDocument()
  })

  it('deux rendez-vous du même type : le type ne départage pas — pas de gagnant inventé', () => {
    renderConflict(agendaEvent({ id: 'e1', isExternal: true }), agendaEvent({ id: 'e2', isExternal: true }))
    expect(screen.getByText(/Même type de rendez-vous : le type ne les départage pas/)).toBeInTheDocument()
    expect(screen.queryByText(/pèse davantage/)).not.toBeInTheDocument()
  })
})

// #2102.8 — le message de notification calendrier : avant de confirmer, on voit CE QUE les invités vont recevoir.
describe('ConflictDialog — message de notification des invités (#2102.8)', () => {
  const first = agendaEvent({
    id: 'e1',
    summary: 'Point ACME',
    start: '2020-01-01T09:00:00.000Z',
    end: '2020-01-01T10:00:00.000Z',
    attendees: [attendee('a@acme.com', true)],
  })
  const second = agendaEvent({
    id: 'e2',
    summary: 'Point Decathlon',
    start: '2020-01-01T09:45:00.000Z',
    end: '2020-01-01T10:45:00.000Z',
  })

  it('la confirmation montre le message que partira : nouvel horaire, au lieu de l’ancien', () => {
    renderConflict(first, second)
    fireEvent.click(screen.getAllByRole('button', { name: "Déplacer après l'autre rendez-vous" })[0]!)
    expect(screen.getByText(/Les invités recevront la mise à jour de l’agenda : nouvel horaire/)).toBeInTheDocument()
    expect(rescheduleMutate).not.toHaveBeenCalled()
  })

  it('sans invité, aucun message ne part — et rien n’en annonce un', () => {
    renderConflict({ ...first, attendees: [] }, second)
    fireEvent.click(screen.getAllByRole('button', { name: "Déplacer après l'autre rendez-vous" })[0]!)
    expect(screen.queryByText(/Les invités recevront/)).not.toBeInTheDocument()
  })
})

describe('ConflictDialog — proposer lequel déplacer, sans décider seul (#2102.5)', () => {
  it('porte le MÊME lien vers l’agenda sur les deux cartes, à égalité', () => {
    const first = agendaEvent({ id: 'e1', summary: 'Point ACME', webUrl: 'https://calendar.example/e1' })
    const second = agendaEvent({ id: 'e2', summary: 'Point Decathlon', webUrl: 'https://calendar.example/e2' })
    renderConflict(first, second)

    const links = screen.getAllByRole('link', { name: /agenda/i })
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute('href', 'https://calendar.example/e1')
    expect(links[1]).toHaveAttribute('href', 'https://calendar.example/e2')
  })

  it('sans lien d’agenda pour un rendez-vous, aucun lien muet à sa place', () => {
    const first = agendaEvent({ id: 'e1', webUrl: 'https://calendar.example/e1' })
    const second = agendaEvent({ id: 'e2', webUrl: null })
    renderConflict(first, second)

    expect(screen.getAllByRole('link', { name: /agenda/i })).toHaveLength(1)
  })
})

describe('ConflictDialog — pas de résolution rétroactive si déjà commencé (#2102.10)', () => {
  it('un rendez-vous déjà en cours ne propose plus de le résoudre, l’autre le peut encore (« replanifier la suite »)', () => {
    const now = Date.now()
    // #2102.10 — déjà commencé : `start` dans le passé, `end` dans le futur
    // (même définition que `timingOf` pour la phase `live`).
    const ongoing = agendaEvent({
      id: 'e1',
      summary: 'Point ACME',
      start: new Date(now - 5 * 60_000).toISOString(),
      end: new Date(now + 55 * 60_000).toISOString(),
    })
    const upcoming = agendaEvent({
      id: 'e2',
      summary: 'Point Decathlon',
      start: new Date(now + 10 * 60_000).toISOString(),
      end: new Date(now + 70 * 60_000).toISOString(),
    })
    renderConflict(ongoing, upcoming)

    // Un seul bouton « Déplacer après l'autre rendez-vous » : celui du
    // rendez-vous PAS ENCORE commencé. Les options du premier (`e1`, déjà
    // commencé) seraient rétroactives — aucune n'apparaît pour lui.
    expect(screen.getAllByRole('button', { name: "Déplacer après l'autre rendez-vous" })).toHaveLength(1)
    expect(
      screen.queryByRole('button', { name: "Raccourcir jusqu'au début de l'autre rendez-vous" }),
    ).not.toBeInTheDocument()
  })
})

describe('ConflictDialog — prévenir un invité hors CRM (#2938, #2102.12)', () => {
  it('un bouton « Prévenir » par carte, seulement quand elle a des invités', () => {
    const first = agendaEvent({ id: 'e1', attendees: [attendee('a@acme.com', true)] })
    const second = agendaEvent({ id: 'e2', attendees: [] })
    renderConflict(first, second)

    expect(screen.getAllByRole('button', { name: 'Prévenir' })).toHaveLength(1)
  })

  it('ouvre un brouillon `mailto:` vers l’adresse tapée, jamais un envoi direct', () => {
    const first = agendaEvent({
      id: 'e1',
      summary: 'Point ACME',
      attendees: [attendee('a@acme.com', true)],
    })
    const second = agendaEvent({ id: 'e2', attendees: [] })
    renderConflict(first, second)

    fireEvent.click(screen.getAllByRole('button', { name: 'Prévenir' })[0]!)
    expect(screen.getByText('Prévenir un invité')).toBeInTheDocument()

    // Sans adresse valide, rien à cliquer qui parte quelque part.
    expect(screen.queryByRole('link', { name: 'Ouvrir dans ma messagerie' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: 'hors-crm@exemple.com' } })

    const link = screen.getByRole('link', { name: 'Ouvrir dans ma messagerie' })
    expect(link).toHaveAttribute('href', expect.stringContaining('mailto:hors-crm%40exemple.com?'))
    expect(link).toHaveAttribute('href', expect.stringContaining('Point%20ACME'))
  })

  it('nomme une adresse invalide plutôt que de laisser un lien muet', () => {
    const first = agendaEvent({ id: 'e1', attendees: [attendee('a@acme.com', true)] })
    const second = agendaEvent({ id: 'e2', attendees: [] })
    renderConflict(first, second)

    fireEvent.click(screen.getAllByRole('button', { name: 'Prévenir' })[0]!)
    const input = screen.getByLabelText('Adresse e-mail')
    fireEvent.change(input, { target: { value: 'pas-une-adresse' } })
    fireEvent.blur(input)

    expect(screen.getByText('Adresse e-mail invalide.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ouvrir dans ma messagerie' })).not.toBeInTheDocument()
  })
})

describe('ConflictDialog — des options concrètes, pas seulement un constat (#2390.11, #2390.12)', () => {
  // 9h-10h / 9h45-10h45 : chevauchement partiel de 15 min, le premier commence
  // avant le second et ne le dépasse pas — les trois options sont calculables
  // (`conflict-resolution.test.ts`).
  const first = agendaEvent({
    id: 'e1',
    summary: 'Point ACME',
    start: '2020-01-01T09:00:00.000Z',
    end: '2020-01-01T10:00:00.000Z',
  })
  const second = agendaEvent({
    id: 'e2',
    summary: 'Point Decathlon',
    start: '2020-01-01T09:45:00.000Z',
    end: '2020-01-01T10:45:00.000Z',
  })

  it('propose « déplacer » sur CHACUNE des deux cartes, à égalité (jamais un rendez-vous mis en avant)', () => {
    renderConflict(first, second)
    expect(screen.getAllByRole('button', { name: "Déplacer après l'autre rendez-vous" })).toHaveLength(2)
  })

  it('propose « raccourcir » — seulement là où ça ne coupe personne en deux', () => {
    renderConflict(first, second)
    expect(screen.getAllByRole('button', { name: "Raccourcir jusqu'au début de l'autre rendez-vous" })).toHaveLength(1)
  })

  it('#2390.19 — NO-GO : un clic ouvre une confirmation, rien n’écrit avant elle', () => {
    renderConflict(first, second)
    expect(rescheduleMutate).not.toHaveBeenCalled()
    fireEvent.click(screen.getAllByRole('button', { name: "Déplacer après l'autre rendez-vous" })[0]!)
    // La confirmation montre l'avant/après et demande un second clic.
    expect(screen.getByRole('heading', { name: 'Déplacer ce rendez-vous ?' })).toBeInTheDocument()
    expect(rescheduleMutate).not.toHaveBeenCalled()
  })

  it('confirmer déplace RÉELLEMENT le bon évènement, aux bons horaires, puis referme', () => {
    const onClose = vi.fn()
    renderConflict(first, second, onClose)
    // La première carte (« Point ACME », e1) porte l'option `moveFirst` : la
    // décaler après la fin du second, durée inchangée.
    fireEvent.click(screen.getAllByRole('button', { name: "Déplacer après l'autre rendez-vous" })[0]!)
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }))

    expect(rescheduleMutate).toHaveBeenCalledWith(
      {
        eventId: 'e1',
        startsAt: '2020-01-01T10:45:00.000Z',
        endsAt: '2020-01-01T11:45:00.000Z',
        notifyGuests: true,
      },
      expect.anything(),
    )
    expect(toastSuccess).toHaveBeenCalled()
    // Les deux cartes montraient le conflit RÉSOLU : la boîte referme plutôt
    // que d'afficher un état devenu faux.
    expect(onClose).toHaveBeenCalled()
  })

  it('confirmer « raccourcir » appelle le même écrit, avec le libellé propre à l’action', () => {
    renderConflict(first, second)
    fireEvent.click(screen.getByRole('button', { name: "Raccourcir jusqu'au début de l'autre rendez-vous" }))
    expect(screen.getByRole('heading', { name: 'Raccourcir ce rendez-vous ?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Raccourcir' }))

    expect(rescheduleMutate).toHaveBeenCalledWith(
      {
        eventId: 'e1',
        startsAt: '2020-01-01T09:00:00.000Z',
        endsAt: '2020-01-01T09:45:00.000Z',
        notifyGuests: true,
      },
      expect.anything(),
    )
  })
})

describe('ConflictDialog — #2390.12 le battement (buffer), CHOISI, jamais calculé', () => {
  // Même conflit que le describe précédent (15 min de chevauchement).
  const first = agendaEvent({
    id: 'e1',
    summary: 'Point ACME',
    start: '2020-01-01T09:00:00.000Z',
    end: '2020-01-01T10:00:00.000Z',
  })
  const second = agendaEvent({
    id: 'e2',
    summary: 'Point Decathlon',
    start: '2020-01-01T09:45:00.000Z',
    end: '2020-01-01T10:45:00.000Z',
  })

  it('propose deux battements CONCRETS (15 min, 30 min) — des choix, jamais un champ libre', () => {
    renderConflict(first, second)
    expect(screen.getByRole('button', { name: 'Déplacer avec 15 min de battement' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Déplacer avec 30 min de battement' })).toBeInTheDocument()
  })

  it('un battement ne remplace pas le déplacement sans battement — les deux restent proposés', () => {
    renderConflict(first, second)
    expect(screen.getAllByRole('button', { name: "Déplacer après l'autre rendez-vous" })).toHaveLength(2)
  })

  it('confirmer un battement de 15 min décale RÉELLEMENT le second après la fin du premier PLUS 15 min', () => {
    const onClose = vi.fn()
    renderConflict(first, second, onClose)
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer avec 15 min de battement' }))
    fireEvent.click(screen.getByRole('button', { name: 'Déplacer' }))

    expect(rescheduleMutate).toHaveBeenCalledWith(
      {
        eventId: 'e2',
        // firstEnd (10:00) + 15 min = 10:15, durée inchangée (1h) → 11:15.
        startsAt: '2020-01-01T10:15:00.000Z',
        endsAt: '2020-01-01T11:15:00.000Z',
        notifyGuests: true,
      },
      expect.anything(),
    )
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ConflictDialog — déléguer : une PROPOSITION, jamais une écriture (#2390.12)', () => {
  it('un bouton « Proposer de déléguer » par carte non commencée', () => {
    renderConflict(agendaEvent({ id: 'e1' }), agendaEvent({ id: 'e2' }))
    expect(screen.getAllByRole('button', { name: 'Proposer de déléguer' })).toHaveLength(2)
  })

  it('prépare un brouillon `mailto:` vers le collègue choisi et n’écrit RIEN dans l’agenda', () => {
    renderConflict(agendaEvent({ id: 'e1', summary: 'Point ACME' }), agendaEvent({ id: 'e2' }))

    fireEvent.click(screen.getAllByRole('button', { name: 'Proposer de déléguer' })[0]!)
    expect(screen.getByText('Proposer de déléguer ce rendez-vous')).toBeInTheDocument()
    // Sans adresse valide, rien à cliquer.
    expect(screen.queryByRole('link', { name: 'Ouvrir dans ma messagerie' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Adresse e-mail'), { target: { value: 'collegue@bellum.fr' } })
    const link = screen.getByRole('link', { name: 'Ouvrir dans ma messagerie' })
    expect(link).toHaveAttribute('href', expect.stringContaining('mailto:collegue%40bellum.fr?'))
    expect(link).toHaveAttribute('href', expect.stringContaining('Point%20ACME'))
    // Ni déplacement ni changement d’organisateur : la porte d’écriture reste fermée.
    expect(rescheduleMutate).not.toHaveBeenCalled()
  })
})

describe('ConflictDialog — critères de priorité, sans verdict (#2390.14, #2390.15)', () => {
  it('nomme les réponses des invités quand elles se lisent', () => {
    const first = agendaEvent({
      id: 'e1',
      attendees: [
        { ...attendee('a@acme.com', true), responseStatus: 'accepted' },
        { ...attendee('b@acme.com', true), responseStatus: 'accepted' },
        { ...attendee('c@bellum.fr', false), responseStatus: 'needsAction' },
      ],
    })
    renderConflict(first, agendaEvent({ id: 'e2' }))
    expect(screen.getByText('Réponses : 2 acceptées · 1 en attente')).toBeInTheDocument()
  })

  it('ne dit rien sans réponse lisible : une absence ne fait aucune ligne', () => {
    renderConflict(agendaEvent({ id: 'e1', attendees: [attendee('a@acme.com', true)] }), agendaEvent({ id: 'e2' }))
    expect(screen.queryByText(/Réponses :/)).not.toBeInTheDocument()
  })

  it('dit explicitement qu’aucun des deux ne prime d’office, même le client', () => {
    renderConflict(agendaEvent({ id: 'e1', isExternal: true }), agendaEvent({ id: 'e2', isExternal: false }))
    expect(screen.getByText(/Aucun des deux ne prime d’office/)).toBeInTheDocument()
  })
})
