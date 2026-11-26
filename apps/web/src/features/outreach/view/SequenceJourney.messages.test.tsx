import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { initialJourney, reduceJourney, type JourneyContact } from '../sequence-journey'
import { SequenceJourney } from './SequenceJourney'

/**
 * Théo C sequences-assistant, étape Messages — les messages s'ouvrent DÉJÀ rédigés par Laura, éditables, avec
 * « Régénérer » : jamais un champ vide. La rédaction passe par `requestEmailDraft` (crédit 0, jamais un texte de
 * repli inventé) ; ici elle est simulée.
 */

const marie: JourneyContact = {
  id: 'c1',
  full_name: 'Marie Dubois',
  title: 'DSI',
  email: 'marie@acme.fr',
  assigned_to: null,
}
const paul: JourneyContact = { id: 'c2', full_name: 'Paul Martin', title: 'DAF', email: null, assigned_to: null }
const lea: JourneyContact = { id: 'c3', full_name: 'Léa Robert', title: 'CTO', email: 'lea@acme.fr', assigned_to: null }

const requestEmailDraft = vi.fn()
vi.mock('../campaign-sample', async importOriginal => ({
  ...(await importOriginal<typeof import('../campaign-sample')>()),
  requestEmailDraft: (...args: unknown[]) => requestEmailDraft(...args),
}))
vi.mock('@/features/contacts/hooks/useContacts', () => ({
  useContacts: () => ({ data: { pages: [{ data: [marie, paul, lea] }] }, isLoading: false }),
}))
vi.mock('@/features/automations/api', () => ({
  useCreateAutomationRule: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/mailbox/api', () => ({
  useMailboxStatus: () => ({ data: { connected: true, address: 'theo@bellum-conseil.fr' } }),
}))

function at(step: 'messages' | 'review', contacts: JourneyContact[]) {
  let state = initialJourney()
  for (const contact of contacts) state = reduceJourney(state, { type: 'toggleContact', contact })
  const target = step === 'messages' ? 2 : 3
  for (let i = 0; i < target; i += 1) state = reduceJourney(state, { type: 'next' })
  return state
}

function setup(step: 'messages' | 'review', contacts: JourneyContact[]) {
  const onSaveDraft = vi.fn()
  renderWithRouter(
    <SequenceJourney
      initial={at(step, contacts)}
      onLaunchManual={vi.fn()}
      onSaveDraft={onSaveDraft}
      onClose={vi.fn()}
    />,
  )
  return { onSaveDraft }
}

beforeEach(async () => {
  requestEmailDraft.mockReset()
  requestEmailDraft.mockImplementation(async (contactId: string, context: string) => ({
    subject: `Objet pour ${contactId}`,
    body: `Bonjour, message rédigé (${context.slice(0, 20)})`,
  }))
  await i18n.changeLanguage('fr')
})

describe('étape Messages — rédigés par Laura', () => {
  it('chaque touche e-mail s’ouvre rédigée pour la première personne joignable, jamais vide', async () => {
    setup('messages', [paul, marie])
    const first = await screen.findByTestId('journey-touch-0')
    const body = await within(first).findByRole('textbox', { name: /Message · aperçu pour Marie Dubois/ })
    expect((body as HTMLTextAreaElement).value).toContain('message rédigé')
    // La relance du J+4 est un rappel (pas un e-mail) dans ce modèle : elle dit ce que Laura prépare.
    expect(requestEmailDraft.mock.calls.every(call => call[0] === 'c1')).toBe(true)
    expect(requestEmailDraft.mock.calls[0]?.[1]).toContain('Premier message')
  })

  it('un seul appel par touche et par personne, même en revenant sur l’étape', async () => {
    setup('messages', [marie])
    await screen.findByTestId('journey-touch-0')
    await waitFor(() => expect(requestEmailDraft).toHaveBeenCalled())
    const count = requestEmailDraft.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: '1. Audience' }))
    fireEvent.click(screen.getByRole('button', { name: '3. Messages' }))
    await screen.findByTestId('journey-touch-0')
    expect(requestEmailDraft.mock.calls.length).toBe(count)
  })

  it('le texte est éditable, et « Régénérer » repart du texte retouché pour garder le ton', async () => {
    setup('messages', [marie])
    const first = await screen.findByTestId('journey-touch-0')
    const body = await within(first).findByRole('textbox', { name: /Message · aperçu pour/ })
    fireEvent.change(body, { target: { value: 'Mon texte à moi, très direct.' } })
    requestEmailDraft.mockClear()
    await userEvent.setup().click(within(first).getByRole('button', { name: 'Régénérer' }))
    await waitFor(() => expect(requestEmailDraft).toHaveBeenCalledTimes(1))
    expect(requestEmailDraft.mock.calls[0]?.[1]).toContain('Mon texte à moi, très direct.')
  })

  it('un échec de rédaction se dit et se retente, sans texte de repli inventé', async () => {
    requestEmailDraft.mockResolvedValue(null)
    setup('messages', [marie])
    const first = await screen.findByTestId('journey-touch-0')
    expect(await within(first).findByText('Je n’ai pas pu rédiger ce message.')).toBeInTheDocument()
    expect(within(first).queryByRole('textbox', { name: /Message · aperçu/ })).toBeNull()
    requestEmailDraft.mockResolvedValue({ subject: 'Objet', body: 'Enfin rédigé.' })
    await userEvent.setup().click(within(first).getByRole('button', { name: 'Réessayer' }))
    expect(await within(first).findByDisplayValue('Enfin rédigé.')).toBeInTheDocument()
  })

  it('sans contact joignable, l’étape le dit au lieu de proposer un champ vide', async () => {
    setup('messages', [paul])
    const first = await screen.findByTestId('journey-touch-0')
    expect(within(first).getByText(/Choisis au moins un contact avec un e-mail pro/)).toBeInTheDocument()
    expect(requestEmailDraft).not.toHaveBeenCalled()
  })

  it('un sélecteur change la personne d’aperçu, et le texte suit', async () => {
    setup('messages', [marie, lea])
    const first = await screen.findByTestId('journey-touch-0')
    await within(first).findByRole('textbox', { name: /aperçu pour Marie Dubois/ })
    const user = userEvent.setup()
    await user.click(screen.getByRole('combobox', { name: 'Aperçu pour' }))
    await user.click(await screen.findByRole('option', { name: 'Léa Robert' }))
    expect(await within(first).findByRole('textbox', { name: /aperçu pour Léa Robert/ })).toBeInTheDocument()
    await waitFor(() => expect(requestEmailDraft.mock.calls.some(call => call[0] === 'c3')).toBe(true))
  })
})

describe('le fil des étapes', () => {
  it('chaque étape du fil est un bouton : un clic revient à l’audience en gardant la sélection', async () => {
    setup('messages', [marie])
    await screen.findByTestId('journey-touch-0')
    fireEvent.click(screen.getByRole('button', { name: '1. Audience' }))
    expect(await screen.findByRole('heading', { name: 'Qui veux-tu contacter ?' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Marie Dubois/ })).toBeChecked()
  })

  it('on n’avance pas par le fil tant que l’audience est vide', async () => {
    renderWithRouter(
      <SequenceJourney initial={initialJourney()} onLaunchManual={vi.fn()} onSaveDraft={vi.fn()} onClose={vi.fn()} />,
    )
    fireEvent.click(await screen.findByRole('button', { name: '3. Messages' }))
    expect(screen.getByRole('heading', { name: 'Qui veux-tu contacter ?' })).toBeInTheDocument()
  })
})

describe('contacts à vérifier et expéditeur', () => {
  it('un contact sans e-mail pro fait un bandeau « à vérifier » dont le détail nomme la personne', async () => {
    renderWithRouter(
      <SequenceJourney
        initial={reduceJourney(initialJourney(), { type: 'toggleContact', contact: paul })}
        onLaunchManual={vi.fn()}
        onSaveDraft={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    const banner = await screen.findByTestId('journey-exclusions')
    expect(banner).toHaveTextContent('1 contact à vérifier')
    expect(banner).toHaveTextContent('1 contact sélectionné n’a pas d’e-mail pro')
    await userEvent.setup().click(within(banner).getByRole('button', { name: 'Voir le détail' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Paul Martin')).toBeInTheDocument()
    expect(within(dialog).getByText(/Sans e-mail pro/)).toBeInTheDocument()
  })

  it('sans rien à vérifier, aucun bandeau', async () => {
    renderWithRouter(
      <SequenceJourney
        initial={reduceJourney(initialJourney(), { type: 'toggleContact', contact: marie })}
        onLaunchManual={vi.fn()}
        onSaveDraft={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    await screen.findByLabelText('Nom de la séquence')
    expect(screen.queryByTestId('journey-exclusions')).toBeNull()
  })

  it('« Importer » range le brouillon avant de partir vers l’import', async () => {
    const { onSaveDraft } = setup('messages', [marie])
    fireEvent.click(await screen.findByRole('button', { name: '1. Audience' }))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /^Importer/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Une liste CSV ou Excel' }))
    expect(onSaveDraft).toHaveBeenCalledTimes(1)
  })

  it('la vérification nomme l’expéditeur : la boîte connectée, en clair', async () => {
    setup('review', [marie])
    const review = await screen.findByRole('region', { name: 'Vérification' })
    expect(within(review).getByText('theo@bellum-conseil.fr · ta boîte connectée')).toBeInTheDocument()
  })
})
