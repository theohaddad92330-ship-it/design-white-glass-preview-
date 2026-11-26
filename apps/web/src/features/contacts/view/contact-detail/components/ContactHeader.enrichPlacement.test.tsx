import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { useCredits } from '@/features/credits/hooks/useCredits'
import { useEnrichContact } from '@/features/contacts/hooks/useEnrichContact'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { ContactHeader } from './ContactHeader'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), warning: vi.fn() } }))
vi.mock('@/features/credits/hooks/useCredits', () => ({ useCredits: vi.fn() }))
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({ useEnrichContact: vi.fn() }))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => ({ data: [] }) }))
vi.mock('@/features/contacts/hooks/useAssignContacts', () => ({
  useAssignContacts: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/demo/useIsDemo', () => ({ useIsDemo: () => false }))

// #4404.1 — recette 21/10 M.
const base = {
  id: 'c-1',
  account_id: 'acc-1',
  full_name: 'Alice Martin',
  title: 'DSI',
  entity: 'ACME',
  decision_role: 'technical',
  email: 'alice@acme.co',
  phone: null,
  linkedin_url: null,
} as unknown as Contact

function setCredits(n: number) {
  vi.mocked(useCredits).mockReturnValue({
    data: { enrichment_credits: n, credits_remaining: n },
    isLoading: false,
  } as unknown as ReturnType<typeof useCredits>)
}

async function group() {
  return screen.findByTestId('contact-primary-actions')
}

describe('ContactHeader — #4404.1 « Compléter » toujours à côté de « Contacter »', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    vi.mocked(useEnrichContact).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof useEnrichContact>)
    setCredits(5)
  })

  it('contact incomplet : « Compléter » est dans le même groupe que « Contacter »', async () => {
    renderWithRouter(<ContactHeader contact={base} onGenerateMessage={vi.fn()} />)
    expect(within(await group()).getByRole('button', { name: /Contacter/ })).toBeInTheDocument()
    expect(within(await group()).getByRole('button', { name: /Enrichir/ })).toBeEnabled()
  })

  it('sans crédit : le bouton reste, désactivé, et dit pourquoi (title + aria-description)', async () => {
    setCredits(0)
    renderWithRouter(<ContactHeader contact={base} onGenerateMessage={vi.fn()} />)
    const btn = within(await group()).getByRole('button', { name: /Enrichir/ })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('title', expect.stringMatching(/beaucoup utilisé/))
    expect(btn).toHaveAttribute('aria-description', expect.stringMatching(/beaucoup utilisé/))
  })

  it('contact déjà complet : le bouton reste, désactivé, « déjà complet »', async () => {
    const complete = { ...base, phone: '+33612345678', linkedin_url: 'https://www.linkedin.com/in/alice' } as Contact
    renderWithRouter(<ContactHeader contact={complete} onGenerateMessage={vi.fn()} />)
    const btn = within(await group()).getByRole('button', { name: /Enrichir/ })
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-description', expect.stringMatching(/déjà complet/i))
  })

  it('aucun canal joignable : le bouton occupe toujours le groupe', async () => {
    const none = { ...base, email: null } as Contact
    renderWithRouter(<ContactHeader contact={none} onGenerateMessage={vi.fn()} />)
    expect(within(await group()).getByRole('button', { name: /Compléter|Enrichir/ })).toBeInTheDocument()
  })

  it('le menu « Autres actions » ne répète plus Compléter (GA-26)', async () => {
    renderWithRouter(<ContactHeader contact={base} onGenerateMessage={vi.fn()} />)
    await group()
    expect(screen.getAllByRole('button', { name: /Enrichir/ })).toHaveLength(1)
  })
})
