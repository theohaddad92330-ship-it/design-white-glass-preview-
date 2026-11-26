import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import type { AccountCrmProvenance } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountCrmProvenanceProvider } from '../hooks/useAccountCrmProvenance'
import { ContactCrmOriginBadge, CrmProvenanceSummary } from './CrmProvenance'

// #4459.2 — « Déjà dans ton CRM » / « Apporté par Bellum » par contact, et le compteur en tête de synthèse.
const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

const ACCOUNT = 'a-1'

// Le client de requêtes de `renderWithRouter` est partagé entre les tests : un compte par cas, jamais un cache hérité.
function serve(provenance: AccountCrmProvenance, accountId = ACCOUNT) {
  apiFetchMock.mockReset()
  apiFetchMock.mockImplementation(async (options: Parameters<typeof apiFetch>[0]): Promise<unknown> => {
    if (options.path === `/crm/push/accounts/${accountId}/provenance`) return provenance
    throw new Error(`appel inattendu : ${options.path}`)
  })
}

describe('provenance CRM sur la fiche compte', () => {
  beforeEach(() => {
    serve({
      accountFromCrm: true,
      contacts: [
        { contactId: 'c-crm', origin: 'crm', pushed: false },
        { contactId: 'c-new', origin: 'bellum', pushed: false },
        { contactId: 'c-new2', origin: 'bellum', pushed: true },
      ],
    })
  })

  it('un contact venu du CRM porte « Déjà dans ton CRM »', async () => {
    renderWithRouter(
      <AccountCrmProvenanceProvider accountId={ACCOUNT}>
        <ContactCrmOriginBadge contact={{ id: 'c-crm' }} />
      </AccountCrmProvenanceProvider>,
    )
    expect(await screen.findByText('Déjà dans ton CRM')).toBeInTheDocument()
  })

  it('un contact trouvé par l’analyse porte « Apporté par Bellum »', async () => {
    renderWithRouter(
      <AccountCrmProvenanceProvider accountId={ACCOUNT}>
        <ContactCrmOriginBadge contact={{ id: 'c-new' }} />
      </AccountCrmProvenanceProvider>,
    )
    expect(await screen.findByText('Apporté par Bellum')).toBeInTheDocument()
  })

  it('le compteur nomme les deux parts', async () => {
    renderWithRouter(
      <AccountCrmProvenanceProvider accountId={ACCOUNT}>
        <CrmProvenanceSummary />
      </AccountCrmProvenanceProvider>,
    )
    expect(await screen.findByText('1 dans ton CRM · 2 trouvés par l’analyse')).toBeInTheDocument()
  })

  it('une part absente ne fait pas de « 0 » (GA-18/19)', async () => {
    serve({ accountFromCrm: true, contacts: [{ contactId: 'c-new', origin: 'bellum', pushed: false }] }, 'a-2')
    renderWithRouter(
      <AccountCrmProvenanceProvider accountId="a-2">
        <CrmProvenanceSummary />
      </AccountCrmProvenanceProvider>,
    )
    expect(await screen.findByText('1 trouvé par l’analyse')).toBeInTheDocument()
    expect(screen.queryByText(/0 dans ton CRM/)).not.toBeInTheDocument()
  })

  it('hors de la fiche (aucun fournisseur de provenance) : rien, et aucun appel', () => {
    apiFetchMock.mockClear()
    const { container } = renderWithRouter(<ContactCrmOriginBadge contact={{ id: 'c-crm' }} />)
    expect(container.textContent ?? '').toBe('')
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('un compte qui ne vient pas du CRM ne porte ni badge ni compteur', async () => {
    serve({ accountFromCrm: false, contacts: [{ contactId: 'c-new', origin: 'bellum', pushed: false }] }, 'a-3')
    const { container } = renderWithRouter(
      <AccountCrmProvenanceProvider accountId="a-3">
        <CrmProvenanceSummary />
        <ContactCrmOriginBadge contact={{ id: 'c-new' }} />
      </AccountCrmProvenanceProvider>,
    )
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(container.textContent ?? '').not.toMatch(/Apporté par Bellum|trouvé/)
  })
})
