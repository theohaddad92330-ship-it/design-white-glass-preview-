import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountStrategy5P, Contact } from '@bellum/contracts'
import { ContactEngagementProvider } from '../components/contact-engagement/ContactEngagementProvider'
import { TabContacts } from './TabContacts'

/**
 * #3277.2 — « la liste des `missing_roles` calculés devrait pointer vers
 * l'écran Contacts pour combler le rôle manquant ». Le bandeau vit SUR
 * l'onglet Contacts (où se comble le trou), lit la MÊME projection que la
 * fiche Compte (`useAccountStrategy5P`) et nomme les rôles — jamais un compte.
 */

const strategy = vi.fn()

vi.mock('@/features/accounts/hooks/useAccountStrategy5P', () => ({
  useAccountStrategy5P: () => ({ data: strategy() }),
}))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: null }),
}))
vi.mock('@/features/accounts/api', async importOriginal => {
  const actual = await importOriginal<typeof import('@/features/accounts/api')>()
  return {
    ...actual,
    accountsApi: {
      ...actual.accountsApi,
      hygiene: () =>
        Promise.resolve({
          withoutNextAction: { ids: [], truncated: false },
          contactsWithoutEmail: { byAccount: {}, truncated: false },
        }),
    },
  }
})
vi.mock('@/features/accounts/hooks/useEnrichAccount', () => ({
  useEnrichContacts: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/contacts/hooks/useEnrichContact', () => ({
  useEnrichContact: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => ({ data: { enrichment_credits: 0 } }),
}))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({
  useEsnProfile: () => ({ data: undefined }),
}))

function withMissing(value: string[] | null): AccountStrategy5P {
  return {
    people: { missing_roles: { value, status: value === null ? 'missing' : 'observed' } },
  } as unknown as AccountStrategy5P
}

function draw() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={client}>
      <ContactEngagementProvider>
        <TabContacts
          onCreateContact={() => {}}
          onImportCsv={() => {}}
          accountId="acc-1"
          contacts={[
            {
              id: 'c1',
              priority: 1,
              entity: null,
              decision_role: 'champion',
              full_name: 'Marie Dupont',
            } as unknown as Contact,
          ]}
          accountCompanyName="TF1"
          rawAnalysis={{}}
        />
      </ContactEngagementProvider>
    </QueryClientProvider>,
  )
}

/**
 * #3630 retire `AccountMissingRolesNotice` (« Rôle d'achat à couvrir ») de la
 * fiche compte, délibérément (Louis 05/10). Ce test affirmait sa présence
 * (#3277.2) ; il prouve désormais son ABSENCE, même quand la stratégie 5P
 * nomme des rôles manquants. Les rôles manquants restent lisibles dans
 * Personnes › « Qui nous manque ».
 */
describe('TabContacts — #3630 : plus de bandeau des rôles d’achat manquants', () => {
  beforeEach(() => strategy.mockReset())

  it('ne pose plus le bandeau, même quand des rôles manquent', async () => {
    strategy.mockReturnValue(withMissing(['economic', 'technical']))
    draw()
    expect((await screen.findAllByText('Marie Dupont')).length).toBeGreaterThan(0)
    expect(screen.queryByTestId('missing-roles-notice')).toBeNull()
    expect(screen.queryByText(/rôles d’achat à couvrir/i)).toBeNull()
  })
})
