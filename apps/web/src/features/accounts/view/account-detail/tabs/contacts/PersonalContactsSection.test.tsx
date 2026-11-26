import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

const api = vi.hoisted(() => ({ fetchPersonalContacts: vi.fn(), sharePersonalContact: vi.fn() }))
vi.mock('@/features/universal-import/api', () => api)

import { PersonalContactsSection } from './PersonalContactsSection'

const row = (over: Record<string, unknown>) => ({
  id: 'p1',
  accountId: 'acc-1',
  fullName: 'Clémence Aubry',
  title: 'Responsable achats',
  email: null,
  phone: null,
  linkedinUrl: null,
  createdAt: '2026-10-02T10:00:00.000Z',
  ...over,
})

function renderSection() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PersonalContactsSection accountId="acc-1" />
    </QueryClientProvider>,
  )
}

/**
 * #2927 — « Mes contacts personnels » : ce que l'utilisateur a importé en portée Personnel, visible de lui seul.
 * Une absence ne fait AUCUNE ligne : sans contact personnel, la section n'existe pas.
 */
describe('PersonalContactsSection — #2927', () => {
  beforeEach(() => vi.clearAllMocks())

  it('liste les contacts personnels et dit qu’ils sont visibles par toi seul', async () => {
    api.fetchPersonalContacts.mockResolvedValue([row({}), row({ id: 'p2', fullName: 'Hugo Delmas', title: null })])
    renderSection()
    expect(await screen.findByText('Clémence Aubry')).toBeInTheDocument()
    expect(screen.getByText('Hugo Delmas')).toBeInTheDocument()
    expect(screen.getByText(/Mes contacts personnels/)).toBeInTheDocument()
    expect(screen.getByText(/visibles par toi seul/i)).toBeInTheDocument()
    expect(api.fetchPersonalContacts).toHaveBeenCalledWith('acc-1')
  })

  it('sans compte (écran /contacts), lit TOUS les contacts personnels', async () => {
    api.fetchPersonalContacts.mockResolvedValue([row({})])
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PersonalContactsSection />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('Clémence Aubry')).toBeInTheDocument()
    expect(api.fetchPersonalContacts).toHaveBeenCalledWith(undefined)
    expect(screen.getByRole('button', { name: /Partager avec l.équipe/ })).toBeInTheDocument()
  })

  it('ne rend RIEN quand il n’y a aucun contact personnel', async () => {
    api.fetchPersonalContacts.mockResolvedValue([])
    const { container } = renderSection()
    await vi.waitFor(() => expect(api.fetchPersonalContacts).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('« Partager avec l’équipe » appelle l’API pour CE contact, puis relit la liste', async () => {
    api.fetchPersonalContacts.mockResolvedValue([row({}), row({ id: 'p2', fullName: 'Hugo Delmas' })])
    api.sharePersonalContact.mockResolvedValue({ contactId: 'c-9', alreadyKnown: false })
    renderSection()
    await screen.findByText('Hugo Delmas')
    const buttons = screen.getAllByRole('button', { name: /Partager avec l’équipe|Partager avec l'équipe/ })
    expect(buttons).toHaveLength(2)
    await userEvent.click(buttons[1]!)
    await vi.waitFor(() => expect(api.sharePersonalContact).toHaveBeenCalledWith('p2'))
    await vi.waitFor(() => expect(api.fetchPersonalContacts).toHaveBeenCalledTimes(2))
  })
})

describe('#4805 — un échec de lecture n’est pas « aucun contact personnel »', () => {
  beforeEach(() => vi.clearAllMocks())

  it('dit de réessayer au lieu de disparaître', async () => {
    api.fetchPersonalContacts.mockRejectedValue(new Error('boom'))
    renderSection()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
