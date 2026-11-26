import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AccountCrmProvenance, CrmPushResult } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { readImpersonationState } from '@/features/impersonation/impersonation-state'
import { AccountCrmProvenanceProvider } from '../hooks/useAccountCrmProvenance'
import { CompleteCrmAccountDialog } from './CompleteCrmAccountDialog'

// #4459.3 — « Compléter le compte » : l'aperçu des contacts apportés, puis UN geste par la porte d'écriture.
const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))
vi.mock('@/features/impersonation/impersonation-state', () => ({ readImpersonationState: vi.fn(() => null) }))

const CONTACTS = [
  { id: 'c-crm', full_name: 'Alice Martin', title: 'DSI' },
  { id: 'c-new', full_name: 'Bruno Petit', title: 'Directeur des achats' },
  { id: 'c-new2', full_name: 'Chloé Durand', title: 'Responsable infra' },
  { id: 'c-sent', full_name: 'David Roux', title: 'CTO' },
]

const RESULT: CrmPushResult = {
  provider: 'hubspot',
  destination: 'exteam.fr',
  batchId: 'b-1',
  items: [
    {
      entity: 'contact',
      id: 'c-new2',
      label: 'Chloé Durand',
      outcome: 'created',
      reason: null,
      crmRecordId: 'p-1',
      recordUrl: null,
    },
  ],
}

let accountSeq = 0
function setup(provenance: AccountCrmProvenance) {
  accountSeq += 1
  const accountId = `acc-${accountSeq}`
  apiFetchMock.mockReset()
  apiFetchMock.mockImplementation(async (options: Parameters<typeof apiFetch>[0]): Promise<unknown> => {
    if (options.path === `/crm/push/accounts/${accountId}/provenance`) return provenance
    if (options.path === '/crm/push') return RESULT
    throw new Error(`appel inattendu : ${options.path}`)
  })
  renderWithRouter(
    <AccountCrmProvenanceProvider accountId={accountId}>
      <CompleteCrmAccountDialog open onOpenChange={() => {}} contacts={CONTACTS} />
    </AccountCrmProvenanceProvider>,
  )
}

const PROVENANCE: AccountCrmProvenance = {
  accountFromCrm: true,
  contacts: [
    { contactId: 'c-crm', origin: 'crm', pushed: false },
    { contactId: 'c-new', origin: 'bellum', pushed: false },
    { contactId: 'c-new2', origin: 'bellum', pushed: false },
    { contactId: 'c-sent', origin: 'bellum', pushed: true },
  ],
}

describe('Compléter le compte — aperçu puis envoi', () => {
  beforeEach(() => {
    vi.mocked(readImpersonationState).mockReturnValue(null)
  })

  it('propose les contacts apportés, cochés d’office ; jamais un contact du CRM ni un contact déjà poussé', async () => {
    setup(PROVENANCE)
    const bruno = await screen.findByRole('checkbox', { name: /Bruno Petit/ })
    expect(bruno).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /Chloé Durand/ })).toBeChecked()
    expect(screen.queryByText(/Alice Martin/)).not.toBeInTheDocument()
    expect(screen.queryByText(/David Roux/)).not.toBeInTheDocument()
    // Rien n'est écrit à l'ouverture : l'aperçu ne touche pas la porte.
    expect(apiFetchMock).not.toHaveBeenCalledWith(expect.objectContaining({ path: '/crm/push' }))
  })

  it('un seul geste pousse la sélection par la porte d’écriture, décochés exclus', async () => {
    setup(PROVENANCE)
    await userEvent.click(await screen.findByRole('checkbox', { name: /Bruno Petit/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter 1 contact à ton CRM' }))
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/crm/push',
          method: 'POST',
          body: { accountIds: [], contactIds: ['c-new2'], withAccountContacts: false },
        }),
      ),
    )
    expect(await screen.findByText('Chloé Durand')).toBeInTheDocument()
  })

  it('en incarnation, l’écriture reste bloquée — et c’est DIT', async () => {
    vi.mocked(readImpersonationState).mockReturnValue({ email: 'client@exemple.fr', by: 'admin', exp: 0 })
    setup(PROVENANCE)
    expect(await screen.findByText(/En incarnation, rien ne part vers le CRM/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ajouter 2 contacts à ton CRM/ })).toBeDisabled()
  })

  it('tout est déjà dans le CRM : le dialogue le dit, aucun bouton d’envoi', async () => {
    setup({ accountFromCrm: true, contacts: [{ contactId: 'c-sent', origin: 'bellum', pushed: true }] })
    expect(await screen.findByText(/Rien à ajouter/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ajouter/ })).not.toBeInTheDocument()
  })
})
