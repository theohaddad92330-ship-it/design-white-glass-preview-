import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { ContactContent } from './ContactContent'

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: (_target: unknown, prop: string) =>
        typeof prop === 'string'
          ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ({ children, ...props }: any) => {
              const Component = prop as 'div'
              return <Component {...props}>{children}</Component>
            }
          : undefined,
    },
  ),
  useInView: () => true,
  useReducedMotion: () => false,
}))

// #4503.4 — la liste « ne pas contacter » de l'espace : `c2` y figure (contact), `c3` par le domaine de son adresse.
vi.mock('@/features/team-guardrails/hooks', () => ({
  useDoNotContactList: () => ({
    data: { items: [] },
  }),
}))

vi.mock('@/features/accounts/view/account-detail/components/contact-engagement/ContactEngagementContext', () => ({
  useContactEngagement: () => ({ openEngagement: vi.fn() }),
  useOptionalContactEngagement: () => ({ openEngagement: vi.fn() }),
}))

function contact(index: number): GlobalContact {
  return {
    id: `c${index}`,
    account_id: 'a1',
    full_name: `Personne ${index}`,
    title: 'DSI',
    entity: null,
    decision_role: null,
    priority: 5,
    email: null,
    phone: null,
    linkedin_url: null,
    why_contact: null,
    user_status: 'new',
    source: 'apollo',
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:00.000Z',
    company_name: 'Corp',
  }
}

const baseProps = {
  lifecycleTally: undefined,
  stateFilter: undefined,
  onLifecycleFilterChange: () => {},
  viewFilter: 'all' as const,
  loading: false,
  query: '',
  onQueryChange: () => {},
  activeFilters: [],
  onFiltersChange: () => {},
  onAddFilter: () => {},
  unassignedFilter: undefined,
  onScopeChange: () => {},
  onClearFilters: () => {},
  isFilterActive: false,
  contacts: Array.from({ length: 25 }, (_, i) => contact(i + 1)),
  totalContacts: 60,
  hasNextPage: true,
  onLoadMore: () => {},
}

const TALLY = { withEmail: 41, withPhone: 17, unattached: 6, monCrm: 9 }

// #4527.1/.3/.6 — les tuiles lisent le SERVEUR ; jamais un compte des 25 lignes chargées sur 60.
describe('ContactContent — chiffres des tuiles et puce Mon CRM (#4527, #4526.4)', () => {
  it('#4527.6 : chiffres présents quand hasNextPage est vrai (les 25 lignes chargées n’ont aucun e-mail)', async () => {
    renderWithRouter(<ContactContent {...baseProps} channelTally={TALLY} />)
    const overview = await screen.findByTestId('contacts-network-overview')
    expect(within(overview).getByRole('button', { name: /Avec e-mail/ })).toHaveTextContent('41')
    expect(within(overview).getByRole('button', { name: /Avec téléphone/ })).toHaveTextContent('17')
    expect(within(overview).getByRole('button', { name: /À rattacher/ })).toHaveTextContent('6')
  })

  it('#4527.3 sait dire NON : sans tally (chargement/échec) aucune tuile ne porte de chiffre, jamais « 0 »', async () => {
    renderWithRouter(<ContactContent {...baseProps} channelTally={undefined} />)
    const overview = await screen.findByTestId('contacts-network-overview')
    for (const name of [/Avec e-mail/, /Avec téléphone/, /À rattacher/]) {
      expect(within(overview).getByRole('button', { name })).not.toHaveTextContent(/\d/)
    }
  })

  it('#4526.4 : la puce « Mon CRM » porte son compteur exact et pose le filtre source', async () => {
    const onAddFilter = vi.fn()
    renderWithRouter(<ContactContent {...baseProps} channelTally={TALLY} onAddFilter={onAddFilter} />)
    const chips = await screen.findByTestId('contacts-quick-chips')
    const chip = within(chips).getByRole('button', { name: /Mon CRM/ })
    expect(chip).toHaveTextContent('9')
    await userEvent.click(chip)
    expect(onAddFilter).toHaveBeenCalledWith('source', 'mon_crm')
  })

  it('#4526.4 sait dire NON : zéro contact CRM ⇒ la puce est ABSENTE', async () => {
    renderWithRouter(<ContactContent {...baseProps} channelTally={{ ...TALLY, monCrm: 0 }} />)
    const chips = await screen.findByTestId('contacts-quick-chips')
    expect(within(chips).queryByRole('button', { name: /Mon CRM/ })).not.toBeInTheDocument()
  })

  it('#4526.4 : active, la puce se relâche et retire le filtre source', async () => {
    const onFiltersChange = vi.fn()
    renderWithRouter(
      <ContactContent
        {...baseProps}
        channelTally={TALLY}
        isFilterActive
        activeFilters={[{ id: 'source', value: 'mon_crm' }]}
        onFiltersChange={onFiltersChange}
      />,
    )
    const chips = await screen.findByTestId('contacts-quick-chips')
    const chip = within(chips).getByRole('button', { name: /Mon CRM/ })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip)
    expect(onFiltersChange).toHaveBeenCalledWith([])
  })
})
