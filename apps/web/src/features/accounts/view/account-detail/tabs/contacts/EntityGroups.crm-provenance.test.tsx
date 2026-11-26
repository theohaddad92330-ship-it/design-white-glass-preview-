import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import type { AccountCrmProvenance, Contact } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountCrmProvenanceProvider } from '@/features/crm/hooks/useAccountCrmProvenance'
import { EntityGroups } from './EntityGroups'

// #4459.4 — la recette lisait « 1781 contacts au total » SANS le compteur « N dans ton CRM · M trouvés par
// l'analyse » : il ne vivait que dans la Synthèse, alors que les badges, eux, sont dans Personnes.
vi.mock('./CompactContactRow', () => ({
  CompactContactRow: ({ contact }: { contact: Contact }) => <div data-testid="contact-row">{contact.full_name}</div>,
}))
vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

const apiFetchMock = vi.mocked(apiFetch)

function serve(provenance: AccountCrmProvenance, accountId: string) {
  apiFetchMock.mockReset()
  apiFetchMock.mockImplementation(async (options: Parameters<typeof apiFetch>[0]): Promise<unknown> => {
    if (options.path === `/crm/push/accounts/${accountId}/provenance`) return provenance
    throw new Error(`appel inattendu : ${options.path}`)
  })
}

const groups = [
  {
    entity: 'ACME',
    contacts: [
      { id: 'c1', full_name: 'Ada' },
      { id: 'c2', full_name: 'Bob' },
    ] as Contact[],
  },
]

function renderGroups(accountId: string) {
  return renderWithRouter(
    <AccountCrmProvenanceProvider accountId={accountId}>
      <EntityGroups groups={groups} groupMode="entity" expandedEntities={new Set()} onToggleEntity={() => undefined} />
    </AccountCrmProvenanceProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('EntityGroups — compteur de provenance CRM (#4459.4)', () => {
  it('compte venu du CRM : le compteur est dans l’en-tête de Personnes, à côté du total', async () => {
    serve(
      {
        accountFromCrm: true,
        contacts: [
          { contactId: 'c1', origin: 'crm', pushed: false },
          { contactId: 'c2', origin: 'bellum', pushed: false },
        ],
      },
      'a-1',
    )
    renderGroups('a-1')
    expect(await screen.findByTestId('crm-provenance-summary')).toHaveTextContent(
      '1 dans ton CRM · 1 trouvé par l’analyse',
    )
    expect(screen.getByText(/2 contacts au total/)).toBeInTheDocument()
  })

  it('sait dire NON : un compte qui ne vient pas du CRM n’a aucun compteur', async () => {
    serve({ accountFromCrm: false, contacts: [{ contactId: 'c2', origin: 'bellum', pushed: false }] }, 'a-2')
    renderGroups('a-2')
    await vi.waitFor(() => expect(apiFetchMock).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(screen.queryByTestId('crm-provenance-summary')).not.toBeInTheDocument()
  })
})
