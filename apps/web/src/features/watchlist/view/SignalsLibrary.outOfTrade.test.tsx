import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AccountSignalItem } from '@bellum/contracts'

/** #4403.1 — la carte d'un signal hors du métier de l'ESN se DIT « hors de ton métier » ; celle du métier se tait. */
const profileState = vi.hoisted(() => ({
  profile: { placedRoles: ['Cybersécurité'], noGoSectors: [] } as
    | { placedRoles: string[]; noGoSectors: string[] }
    | undefined,
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/x">{children}</a>,
  useNavigate: () => vi.fn(),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/features/discover/hooks/useHiringDomainProfile', () => ({
  useHiringDomainProfile: () => profileState.profile,
}))
vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('../actions/useSignalAction', () => ({ useCreateSignalAction: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('./AddSignalDialog', () => ({ AddSignalDialog: () => null }))

const today = new Date().toISOString().slice(0, 10)
const signal = (over: Partial<AccountSignalItem>): AccountSignalItem => ({
  id: 's',
  account_id: '11111111-1111-4111-8111-111111111111',
  account_created_at: today,
  account_score: 8,
  company_name: 'Nordia',
  date: today,
  label: 'x',
  sector: 'Services',
  source: 'Offre',
  type: 'Recrutement',
  ...over,
})
const signals = vi.hoisted(() => ({ data: [] as AccountSignalItem[] }))
vi.mock('@/features/accounts/hooks/useAccountSignals', () => ({
  useAccountSignals: () => ({ data: signals.data, isLoading: false, isError: false }),
}))

const { SignalsLibrary } = await import('./SignalsLibrary')

const MARK = 'hors de ton métier'
const render4403 = () => render(<SignalsLibrary view="list" onViewChange={() => {}} byAccount={null} />)
const positions = (labels: string[]) => {
  const cards = screen.getAllByTestId('signal-card')
  return labels.map(label => cards.findIndex(card => card.textContent?.includes(label)))
}

describe('Signaux — hors métier (#4403.1)', () => {
  it('marque et range en dernier l’offre hors métier, sans la retirer', () => {
    signals.data = [
      signal({ id: 'off', label: 'Chef d’équipe' }),
      signal({ id: 'in', label: 'Analyste SOC N2', date: '2026-01-01' }),
    ]
    render4403()
    const cards = screen.getAllByTestId('signal-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]).toHaveTextContent('Analyste SOC N2')
    expect(cards[0]).not.toHaveTextContent(MARK)
    expect(cards[1]).toHaveTextContent('Chef d’équipe')
    expect(cards[1]).toHaveTextContent(MARK)
  })

  it('les offres non-IT vues en prod (Carrefour Banque) portent la marque ET passent après celle du métier', () => {
    const banque = [
      'Conseiller Banque et Assurance',
      'Conseiller en gestion de patrimoine',
      'Gestionnaire sinistres matériel',
    ]
    signals.data = [
      ...banque.map((label, n) => signal({ id: `b${n}`, company_name: 'Carrefour Banque', label, date: today })),
      signal({ id: 'soc', label: 'Analyste SOC N2', date: '2026-01-01' }),
    ]
    render4403()
    const [soc, ...rangs] = positions(['Analyste SOC N2', ...banque])
    expect(Math.max(soc)).toBeLessThan(Math.min(...rangs))
    expect(screen.getAllByText(MARK)).toHaveLength(banque.length)
  })

  it('métier INCONNU (profil pas lu) : une offre du métier n’est ni marquée à tort ni écartée', () => {
    profileState.profile = undefined
    signals.data = [signal({ id: 'in', label: 'Analyste SOC N2' })]
    render4403()
    expect(screen.getAllByTestId('signal-card')).toHaveLength(1)
    expect(screen.queryByText(MARK)).toBeNull()
    profileState.profile = { placedRoles: ['Cybersécurité'], noGoSectors: [] }
  })
})
