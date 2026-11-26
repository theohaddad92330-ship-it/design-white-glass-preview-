import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Account, CommercialBrief, Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { AccountKnowledgeCounters } from './AccountKnowledgeCounters'

// Théo A comptes-fiche.R3 — les cinq compteurs de « Ce que je sais » ; l'Intérêt ouvre le score ET ses axes (A1).
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn().mockResolvedValue([]), ApiError: class extends Error {} }))
vi.mock('@/features/qualification-grid/view/AccountQualificationCard', () => ({
  AccountQualificationCard: () => null,
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: null }) }))
vi.mock('@/features/profile/hooks/useEsnProfile', () => ({ useHasOfferObjective: () => true }))

const brief = {
  entities: [{ name: 'SG SA' }, { name: 'Boursorama' }],
  prices: [{ label: 'a' }, { label: 'b' }, { label: 'c' }],
}

function account(raw: Record<string, unknown> = {}): Account {
  return { id: 'a1', company_name: 'Société Générale', raw_analysis: raw } as unknown as Account
}

function draw(props: {
  account: Account
  contacts?: Contact[]
  briefData?: typeof brief | null
  onTabChange?: () => void
}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AccountKnowledgeCounters
        account={props.account}
        contacts={props.contacts ?? []}
        brief={(props.briefData ?? null) as unknown as CommercialBrief | null}
        onTabChange={props.onTabChange ?? vi.fn()}
      />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('AccountKnowledgeCounters', () => {
  it('compte ce que le dossier porte : entités, relevés de TJM, contacts', () => {
    draw({
      account: account({
        entities_exhaustive: [
          { name: 'SG SA', type: 'filiale' },
          { name: 'Boursorama', type: 'filiale' },
        ],
      }),
      briefData: brief,
      contacts: [{ id: 'c1' }, { id: 'c2' }] as unknown as Contact[],
    })
    expect(screen.getByRole('button', { name: /2 entités documentées/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /3 relevés de TJM/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /2 contacts dans le dossier/ })).toBeInTheDocument()
  })

  // #4649 (GA-26) — « 5 entités » dans Sites contre « 4 entités documentées » dans le Brief : deux nombres pour la
  // même chose. La tuile lit LE prédicat de l'onglet Sites (`countListedEntities`), pas la liste du brief.
  it('#4649 — la tuile « entités » est le compteur de l’onglet Sites, pas la longueur du brief', () => {
    const entities = Array.from({ length: 5 }, (_, i) => ({ name: `Filiale ${i}`, type: 'filiale' }))
    draw({ account: account({ entities_exhaustive: entities }), briefData: brief })
    expect(screen.getByRole('button', { name: /^5 entités documentées/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^2 entités documentées/ })).not.toBeInTheDocument()
  })

  it('#4649 — sans entité listée, la tuile ne s’affiche pas (jamais « 0 », même si le brief en porte)', () => {
    draw({ account: account(), briefData: brief })
    expect(screen.queryByText(/entités documentées/)).not.toBeInTheDocument()
  })

  it('⚠️ une valeur absente n’est jamais « 0 » : sans brief, ni entités ni TJM ne s’affichent', () => {
    draw({ account: account() })
    expect(screen.queryByText(/entités documentées/)).not.toBeInTheDocument()
    expect(screen.queryByText(/relevés de TJM/)).not.toBeInTheDocument()
  })

  it('le clic mène à la section qui porte le chiffre', async () => {
    const onTabChange = vi.fn()
    draw({
      account: account({
        entities_exhaustive: [
          { name: 'SG SA', type: 'filiale' },
          { name: 'Boursorama', type: 'filiale' },
        ],
      }),
      briefData: brief,
      contacts: [{ id: 'c1' }] as unknown as Contact[],
      onTabChange,
    })
    await userEvent.click(screen.getByRole('button', { name: /1 contact dans le dossier/ }))
    expect(onTabChange).toHaveBeenCalledWith('contacts')
    await userEvent.click(screen.getByRole('button', { name: /2 entités documentées/ }))
    expect(onTabChange).toHaveBeenCalledWith('sites')
  })

  it('l’Intérêt commercial s’écrit EN MOTS (aucun score en points) et ouvre le score et ses axes', async () => {
    draw({
      account: account({
        evaluation: { score: 9, commercial_score: 91 },
        plan: { commercialScore: 91 },
      }),
    })
    const tile = screen.getByRole('button', { name: /^Fort · intérêt commercial/i })
    expect(screen.getByTestId('account-knowledge-counters').textContent).not.toMatch(/\/100/)
    await userEvent.click(tile)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Score du dossier/i)).toBeInTheDocument()
  })

  it('sait dire NON : un intérêt de 30 se lit « Faible », jamais « Fort »', () => {
    draw({ account: account({ plan: { commercialScore: 30 } }) })
    expect(screen.getByTestId('knowledge-interest')).toHaveTextContent(/^Faible/)
  })

  it('sans score : aucune tuile Intérêt (on n’affiche pas ce qu’on n’a pas)', () => {
    draw({ account: account() })
    expect(screen.queryByText(/intérêt commercial/i)).not.toBeInTheDocument()
  })
})
