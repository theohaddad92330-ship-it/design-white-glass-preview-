import type { AccountIntelligenceContextView } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AttackAnglesSection } from './plan/AttackAnglesSection'
import type { AttackAngle } from './plan/planViewData'
import { IncumbentEsnCard } from './sections/IncumbentEsnCard'
import { OpeningStrategyCard } from './sections/OpeningStrategyCard'

/**
 * #4016.L4 — angle en HYPOTHÈSE, ESN PROBABLE, priors de la base de référence en HYPOTHÈSE : chaque valeur
 * estimée porte le badge « estimé » (une seule primitive) et sa base ; une valeur observée n'en porte pas.
 */
const useAccountIntelligenceContext = vi.hoisted(() => vi.fn())
vi.mock('@/features/accounts/hooks/useAccountIntelligenceContext', () => ({ useAccountIntelligenceContext }))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: undefined }),
}))
vi.mock('@/features/accounts/hooks/useGenerateAttackAngle', () => ({
  useGenerateAttackAngle: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('./plan/ReplanDialog', () => ({ ReplanDialog: () => null }))

function context(over: Partial<AccountIntelligenceContextView>): AccountIntelligenceContextView {
  return {
    accountId: 'acc-1',
    conflicts: [],
    companyName: { state: 'unknown' },
    sector: { state: 'unknown' },
    headquarters: { state: 'unknown' },
    marketMemory: {
      provenance: { source: 'market_memory', observedAt: null },
      read: { status: 'unavailable', reason: 'hors sujet de ce test' },
    },
    incumbentEsn: { state: 'unknown' },
    technologies: { state: 'unknown' },
    entryPaths: { state: 'unknown' },
    recommendations: [],
    ...over,
  }
}

const angle = (proofState: AttackAngle['proofState'], proof: string | null = null): AttackAngle => ({
  title: 'Reprise de la TMA paiement',
  description: '',
  entryPoint: '',
  offer: '',
  estimatedDealSize: '',
  recommended: false,
  proof,
  proofState,
})

describe('#4016.L4 — angle d’attaque en hypothèse', () => {
  it('un angle sans preuve mobilisable porte le badge « estimé » (nuance : hypothèse)', () => {
    render(<AttackAnglesSection angles={[angle('absent')]} accountId="a1" />)
    expect(screen.getByRole('note', { name: /estimé.*hypothèse/i })).toBeInTheDocument()
  })

  it('sait dire NON : un angle étayé par une preuve mobilisable n’est pas badgé', () => {
    render(<AttackAnglesSection angles={[angle('mobilisable', 'Référence TMA chez un pair')]} accountId="a1" />)
    expect(screen.queryByRole('note', { name: /estimé.*hypothèse/i })).not.toBeInTheDocument()
  })
})

describe('#4016.L4 — ESN probablement en place', () => {
  const incumbent = (source: 'inference' | 'public_sources') =>
    context({
      incumbentEsn: {
        state: 'known',
        value: [{ name: 'Sopra Steria', contractType: null, strengths: null, weaknesses: null }],
        provenance: { source, observedAt: null },
      },
    })

  it('déduite d’indices : « probable », avec sa base', async () => {
    useAccountIntelligenceContext.mockReturnValue({ data: incumbent('inference') })
    renderWithRouter(<IncumbentEsnCard accountId="acc-1" />)
    expect(await screen.findByRole('note', { name: /estimé.*probable.*indices/i })).toBeInTheDocument()
  })

  it('sait dire NON : lue dans une source publique, aucun badge', async () => {
    useAccountIntelligenceContext.mockReturnValue({ data: incumbent('public_sources') })
    renderWithRouter(<IncumbentEsnCard accountId="acc-1" />)
    await screen.findByText('Sopra Steria')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})

describe('#4016.L4 — les priors de la base de référence exposés comme hypothèses', () => {
  const opening = (source: 'dataforge' | 'current_data') =>
    context({
      entryPaths: {
        state: 'known',
        value: [{ label: 'Direction des achats IT', targetProfile: null, justification: null }],
        provenance: { source, observedAt: null },
      },
    } as Partial<AccountIntelligenceContextView>)

  it('une porte d’entrée tirée des priors : « hypothèse », avec sa base, sans nommer la base', async () => {
    useAccountIntelligenceContext.mockReturnValue({ data: opening('dataforge') })
    renderWithRouter(<OpeningStrategyCard accountId="acc-1" />)
    const badge = await screen.findByRole('note', { name: /estimé.*hypothèse/i })
    expect(badge.getAttribute('aria-label')).toMatch(/comptes comparables/)
    expect(badge.getAttribute('aria-label')).not.toMatch(/dataforge/i)
  })

  it('sait dire NON : une porte tirée des données du compte n’est pas badgée', async () => {
    useAccountIntelligenceContext.mockReturnValue({ data: opening('current_data') })
    renderWithRouter(<OpeningStrategyCard accountId="acc-1" />)
    await screen.findByText('Direction des achats IT')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
