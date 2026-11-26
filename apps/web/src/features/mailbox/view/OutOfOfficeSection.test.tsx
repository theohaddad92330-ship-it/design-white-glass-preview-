import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { useMailboxStatus, useOutOfOffice, useSaveOutOfOffice } from '../api'
import { OutOfOfficeSection } from './OutOfOfficeSection'

vi.mock('../api', () => ({
  useMailboxStatus: vi.fn(),
  useOutOfOffice: vi.fn(),
  useSaveOutOfOffice: vi.fn(),
}))

const user = () => userEvent.setup({ pointerEventsCheck: 0 })
const mutate = vi.fn()

function setStatus(provider: 'google' | 'microsoft' | null, outOfOffice = true) {
  vi.mocked(useMailboxStatus).mockReturnValue({
    data: {
      connected: provider !== null,
      provider,
      address: null,
      connectedCount: provider ? 1 : 0,
      capabilities: { read: true, draft: true, send: true, labels: true, outOfOffice },
    },
  } as unknown as ReturnType<typeof useMailboxStatus>)
}

function setCurrent(data: unknown) {
  vi.mocked(useOutOfOffice).mockReturnValue({ data, isLoading: false } as unknown as ReturnType<typeof useOutOfOffice>)
}

describe('Théo D settings-integrations.DÉC.absence — la réponse d’absence se règle dans Outlook ET Gmail', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mutate.mockClear()
    vi.mocked(useSaveOutOfOffice).mockReturnValue({
      mutate,
      isPending: false,
    } as unknown as ReturnType<typeof useSaveOutOfOffice>)
    setCurrent({ enabled: false, contactsOnly: false })
  })

  it('apparaît dans le tiroir Outlook quand la boîte est Microsoft', () => {
    setStatus('microsoft')
    render(<OutOfOfficeSection provider="microsoft" />)
    expect(screen.getByRole('heading', { name: 'Réponse d’absence' })).toBeInTheDocument()
  })

  it('apparaît dans le tiroir Gmail quand la boîte est Google', () => {
    setStatus('google')
    render(<OutOfOfficeSection provider="google" />)
    expect(screen.getByRole('heading', { name: 'Réponse d’absence' })).toBeInTheDocument()
  })

  it('ne s’affiche pas dans le tiroir d’un autre fournisseur que celui de la boîte', () => {
    setStatus('google')
    const { container } = render(<OutOfOfficeSection provider="microsoft" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sans la permission, dit quoi reconnecter au lieu d’un formulaire qui échouerait', () => {
    setStatus('google', false)
    setCurrent(null)
    render(<OutOfOfficeSection provider="google" />)
    expect(screen.getByText(/reconnecte/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Enregistrer' })).not.toBeInTheDocument()
  })

  it('une absence activée exige une date de fin (jamais une relance sans fin)', async () => {
    setStatus('microsoft')
    render(<OutOfOfficeSection provider="microsoft" />)
    await user().click(screen.getByRole('switch', { name: 'Activer la réponse d’absence' }))
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    expect(screen.getByText('Choisis une date de fin.')).toBeInTheDocument()
  })

  it('enregistre le message, les dates en ISO et « contacts connus seulement »', async () => {
    setStatus('microsoft')
    render(<OutOfOfficeSection provider="microsoft" />)
    await user().click(screen.getByRole('switch', { name: 'Activer la réponse d’absence' }))
    await user().type(screen.getByLabelText('Message'), 'Absent jusqu’au 30.')
    const end = screen.getByLabelText('Au')
    await user().type(end, '2026-10-30T18:00')
    await user().click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(mutate).toHaveBeenCalledTimes(1)
    const sent = mutate.mock.calls[0]?.[0] as { enabled: boolean; endsAt?: string; message?: string }
    expect(sent.enabled).toBe(true)
    expect(sent.message).toBe('Absent jusqu’au 30.')
    expect(sent.endsAt).toMatch(/^2026-10-30T\d\d:00:00\.000Z$/)
  })

  it('relit la valeur posée chez le fournisseur', () => {
    setStatus('google')
    setCurrent({ enabled: true, contactsOnly: true, message: 'Je reviens le 3.', endsAt: '2026-11-03T08:00:00.000Z' })
    render(<OutOfOfficeSection provider="google" />)
    expect(screen.getByLabelText('Message')).toHaveValue('Je reviens le 3.')
    expect(screen.getByRole('switch', { name: 'Activer la réponse d’absence' })).toBeChecked()
  })
})
