import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { NewEventDialog } from './NewEventDialog'

// #3788.5 — hors démo par défaut ici : ce fichier couvre le comportement
// NORMAL (hors démo), déjà testé séparément dans `NewEventDialog.demo.test.tsx`.
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

/**
 * #2101.29 — LE RAPPEL, CHOISI À LA CRÉATION — QUAND LE FOURNISSEUR L'HONORE.
 *
 * `AgendaBoard.confirmCreate` envoyait `reminderMinutes: 60` EN DUR, alors que
 * `google.service.ts` pose réellement la valeur reçue sur l'évènement créé.
 * Le champ existe UNIQUEMENT quand `allowCustomReminder` est vrai
 * (`AgendaStatus.capabilities.customReminder`, Google seul) : le proposer à
 * un fournisseur qui l'ignore (Microsoft) promettrait un réglage fictif.
 */
describe('#2101.29 — le rappel choisi à la création', () => {
  const slot = { start: '2026-09-24T10:00:00.000Z', end: '2026-09-24T10:30:00.000Z', minutes: 30 }

  async function open(allowCustomReminder: boolean) {
    await i18n.changeLanguage('fr')
    const onCreate = vi.fn()
    render(
      <NewEventDialog
        slot={slot}
        language="fr"
        pending={false}
        allowCustomReminder={allowCustomReminder}
        allowRecurrence={false}
        writableCalendars={[]}
        onCreate={onCreate}
        onCancel={() => {}}
      />,
    )
    return onCreate
  }

  it('fournisseur qui l’honore : le champ « Rappel » est proposé', async () => {
    await open(true)
    expect(screen.getByRole('combobox', { name: 'Rappel' })).toBeInTheDocument()
  })

  it('fournisseur qui l’ignore : AUCUN champ « Rappel » — jamais un réglage fictif', async () => {
    await open(false)
    expect(screen.queryByRole('combobox', { name: 'Rappel' })).not.toBeInTheDocument()
  })

  it('sans y toucher : le rappel créé reste celui du contrat (60 min)', async () => {
    const onCreate = await open(false)
    await userEvent.setup().type(screen.getByPlaceholderText('Cadrage — refonte du parcours'), 'Point client')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Créer' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ reminderMinutes: 60 }))
  })

  it('un rappel CHOISI voyage jusqu’à `onCreate`', async () => {
    const onCreate = await open(true)
    await userEvent.setup().type(screen.getByPlaceholderText('Cadrage — refonte du parcours'), 'Point client')
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Rappel' }))
    await userEvent.setup().click(await screen.findByRole('option', { name: "À l'heure du rendez-vous" }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Créer' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ reminderMinutes: 0 }))
  })
})

/**
 * #2101.27 — LE CALENDRIER CIBLE.
 *
 * `agendaEventDraftSchema.calendarId` existe côté contrat, mais un calendrier
 * n'a de sens à choisir QUE s'il y en a plusieurs où écrire : un seul agenda
 * inscriptible n'offre aucun choix réel, et un sélecteur à une seule option
 * serait un réglage qui n'en est pas un (GA-26, « un réglage vit à un seul
 * endroit », transposé : pas de case qui ne change jamais rien).
 */
describe('#2101.27 — le calendrier cible', () => {
  const slot = { start: '2026-09-24T10:00:00.000Z', end: '2026-09-24T10:30:00.000Z', minutes: 30 }
  const CALENDARS = [
    { id: 'perso', name: 'Mon agenda' },
    { id: 'team@group.calendar.google.com', name: 'Équipe commerciale' },
  ]

  async function open(writableCalendars: typeof CALENDARS) {
    await i18n.changeLanguage('fr')
    const onCreate = vi.fn()
    render(
      <NewEventDialog
        slot={slot}
        language="fr"
        pending={false}
        allowCustomReminder={false}
        allowRecurrence={false}
        writableCalendars={writableCalendars}
        onCreate={onCreate}
        onCancel={() => {}}
      />,
    )
    return onCreate
  }

  it('un seul agenda inscriptible : AUCUN sélecteur — rien à choisir', async () => {
    await open([CALENDARS[0]!])
    expect(screen.queryByRole('combobox', { name: 'Calendrier' })).not.toBeInTheDocument()
  })

  it('plusieurs agendas inscriptibles : le sélecteur est proposé', async () => {
    await open(CALENDARS)
    expect(screen.getByRole('combobox', { name: 'Calendrier' })).toBeInTheDocument()
  })

  it('sans y toucher : aucun calendarId n’est envoyé — l’agenda par défaut, comportement inchangé', async () => {
    const onCreate = await open(CALENDARS)
    await userEvent.setup().type(screen.getByPlaceholderText('Cadrage — refonte du parcours'), 'Point client')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Créer' }))
    expect(onCreate.mock.calls[0]?.[0].calendarId).toBeUndefined()
  })

  it('un calendrier CHOISI voyage jusqu’à `onCreate`', async () => {
    const onCreate = await open(CALENDARS)
    await userEvent.setup().type(screen.getByPlaceholderText('Cadrage — refonte du parcours'), 'Point client')
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Calendrier' }))
    await userEvent.setup().click(await screen.findByRole('option', { name: 'Équipe commerciale' }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Créer' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ calendarId: 'team@group.calendar.google.com' }))
  })
})

/**
 * #2101.26 — LA RÉCURRENCE.
 *
 * `AgendaCapabilities.recurrence` : seul Google la pose réellement
 * (`google-agenda.backend.ts`). Le champ ne doit JAMAIS apparaître quand le
 * fournisseur connecté l'ignorerait — même motif que le rappel personnalisé.
 */
describe('#2101.26 — la récurrence', () => {
  const slot = { start: '2026-09-24T10:00:00.000Z', end: '2026-09-24T10:30:00.000Z', minutes: 30 }

  async function open(allowRecurrence: boolean) {
    await i18n.changeLanguage('fr')
    const onCreate = vi.fn()
    render(
      <NewEventDialog
        slot={slot}
        language="fr"
        pending={false}
        allowCustomReminder={false}
        allowRecurrence={allowRecurrence}
        writableCalendars={[]}
        onCreate={onCreate}
        onCancel={() => {}}
      />,
    )
    return onCreate
  }

  it('fournisseur qui l’honore : le champ « Récurrence » est proposé', async () => {
    await open(true)
    expect(screen.getByRole('combobox', { name: 'Récurrence' })).toBeInTheDocument()
  })

  it('fournisseur qui l’ignore : AUCUN champ « Récurrence » — jamais un réglage fictif', async () => {
    await open(false)
    expect(screen.queryByRole('combobox', { name: 'Récurrence' })).not.toBeInTheDocument()
  })

  it('sans y toucher : aucune recurrence n’est envoyée — évènement unique, comportement inchangé', async () => {
    const onCreate = await open(true)
    await userEvent.setup().type(screen.getByPlaceholderText('Cadrage — refonte du parcours'), 'Point client')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Créer' }))
    expect(onCreate.mock.calls[0]?.[0].recurrence).toBeUndefined()
  })

  it('une récurrence CHOISIE voyage jusqu’à `onCreate`, en RRULE', async () => {
    const onCreate = await open(true)
    await userEvent.setup().type(screen.getByPlaceholderText('Cadrage — refonte du parcours'), 'Point client')
    await userEvent.setup().click(screen.getByRole('combobox', { name: 'Récurrence' }))
    await userEvent.setup().click(await screen.findByRole('option', { name: 'Toutes les semaines' }))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Créer' }))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ recurrence: 'RRULE:FREQ=WEEKLY' }))
  })
})

describe('#3693.6 — rendez-vous planifié depuis une fiche contact', () => {
  const slot = { start: '2026-09-24T10:00:00.000Z', end: '2026-09-24T10:30:00.000Z', minutes: 30 }

  function open(defaults?: { guests?: string }) {
    render(
      <NewEventDialog
        slot={slot}
        language="fr"
        pending={false}
        allowCustomReminder={false}
        allowRecurrence={false}
        writableCalendars={[]}
        defaults={defaults}
        onCreate={() => {}}
        onCancel={() => {}}
      />,
    )
  }

  it('l’invité arrive prérempli et valider est annoncé comme un envoi d’invitation', async () => {
    await i18n.changeLanguage('fr')
    open({ guests: 'amina@acme.fr' })
    expect(screen.getByDisplayValue('amina@acme.fr')).toBeInTheDocument()
    expect(screen.getByText('Valider envoie une invitation à 1 invité.')).toBeInTheDocument()
  })

  it('sans invité : le libellé dit qu’aucune invitation ne part', async () => {
    await i18n.changeLanguage('fr')
    open()
    expect(screen.getByText(/aucune invitation ne part/)).toBeInTheDocument()
  })
})
