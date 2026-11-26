import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account, AccountCrmProvenance } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountCrmProvenanceProvider } from '@/features/crm/hooks/useAccountCrmProvenance'
import { CompleteCrmAccountButton } from './CompleteCrmAccountButton'

// #4459.1 / #4459.3 — « Compléter le compte » : analysé ET venu du CRM, jamais l'un sans l'autre.
const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

let seq = 0
function renderButton(status: Account['status'], provenance: AccountCrmProvenance) {
  seq += 1
  const id = `acc-btn-${seq}`
  apiFetchMock.mockReset()
  apiFetchMock.mockImplementation(async (options: Parameters<typeof apiFetch>[0]): Promise<unknown> => {
    if (options.path === `/crm/push/accounts/${id}/provenance`) return provenance
    throw new Error(`appel inattendu : ${options.path}`)
  })
  return renderWithRouter(
    <AccountCrmProvenanceProvider accountId={id}>
      <CompleteCrmAccountButton
        account={{ id, status } as Account}
        contacts={[{ id: 'c-new', full_name: 'Bruno Petit', title: null }]}
      />
    </AccountCrmProvenanceProvider>,
  )
}

const FROM_CRM: AccountCrmProvenance = {
  accountFromCrm: true,
  contacts: [{ contactId: 'c-new', origin: 'bellum', pushed: false }],
}

describe('CompleteCrmAccountButton', () => {
  it('compte venu du CRM et analysé : le bouton ouvre l’aperçu', async () => {
    renderButton('completed', FROM_CRM)
    await userEvent.click(await screen.findByRole('button', { name: /Compléter le compte/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Bruno Petit/ })).toBeChecked()
  })

  it('SAIT DIRE NON : pas encore analysé → aucun bouton', async () => {
    renderButton('imported', FROM_CRM)
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(screen.queryByRole('button', { name: /Compléter le compte/ })).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON : tout est déjà dans le CRM ou déjà poussé → aucun bouton', async () => {
    renderButton('completed', {
      accountFromCrm: true,
      contacts: [
        { contactId: 'c-crm', origin: 'crm', pushed: false },
        { contactId: 'c-new', origin: 'bellum', pushed: true },
      ],
    })
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(screen.queryByRole('button', { name: /Compléter le compte/ })).not.toBeInTheDocument()
  })

  it('SAIT DIRE NON : compte analysé qui ne vient pas du CRM → aucun bouton', async () => {
    renderButton('completed', { accountFromCrm: false, contacts: [] })
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(screen.queryByRole('button', { name: /Compléter le compte/ })).not.toBeInTheDocument()
  })
})
