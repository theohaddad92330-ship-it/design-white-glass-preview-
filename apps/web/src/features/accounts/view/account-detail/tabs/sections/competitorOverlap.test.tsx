import type { AccountIntelligenceContextView, CompetitiveStrategy } from '@bellum/contracts'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { answerForIncumbent, competitorsBeyondIncumbents } from './competitorOverlap'
import { CompetitivePositioningCard } from './CompetitivePositioningCard'
import { IncumbentEsnCard } from './IncumbentEsnCard'

/**
 * #4323.3 — sans brief, « ESN déjà en place » et « Positionnement » doublonnaient : la même société, deux fois.
 * Une société ne s'écrit qu'une fois ; l'angle de réponse se rattache à sa ligne du constat.
 */
const CONTEXT: AccountIntelligenceContextView = {
  accountId: 'acc-1',
  conflicts: [],
  companyName: { state: 'unknown' },
  sector: { state: 'unknown' },
  headquarters: { state: 'unknown' },
  marketMemory: {
    provenance: { source: 'market_memory', observedAt: null },
    read: { status: 'unavailable', reason: 'hors sujet de ce test' },
  },
  incumbentEsn: {
    state: 'known',
    value: [{ name: 'Capgemini', contractType: null, strengths: null, weaknesses: null }],
    provenance: { source: 'public_sources', observedAt: '2026-09-01T00:00:00.000Z' },
  },
  technologies: { state: 'unknown' },
  entryPaths: { state: 'unknown' },
  recommendations: [],
}

vi.mock('@/features/accounts/hooks/useAccountIntelligenceContext', () => ({
  useAccountIntelligenceContext: () => ({ data: CONTEXT }),
}))
vi.mock('@/features/accounts/hooks/useAccountMarketContext', () => ({
  useAccountMarketContext: () => ({ data: undefined }),
}))

const competitor = (name: string) => ({
  competitor: name,
  talking_point: `angle ${name}`,
  differentiator: `diff ${name}`,
})
const strategy = (names: string[], statement: string | null = null) =>
  ({ positioning_statement: statement, vs_competitors: names.map(competitor) }) as CompetitiveStrategy

describe('competitorOverlap (#4323.3)', () => {
  it('rapproche par nom (casse, accents, espaces), jamais par un mot partagé', () => {
    const all = [competitor('capgemini '), competitor('Groupe SII'), competitor('Alten')]
    expect(competitorsBeyondIncumbents(all, ['Capgemini', 'SII']).map(c => c.competitor)).toEqual([
      'Groupe SII',
      'Alten',
    ])
    expect(answerForIncumbent('Capgemini', all)?.talking_point).toBe('angle capgemini ')
    expect(answerForIncumbent('SII', all)).toBeNull()
  })

  it('sait dire NON : une société sans angle ni différenciation ne porte aucune réponse', () => {
    expect(answerForIncumbent('Alten', [{ competitor: 'Alten' }])).toBeNull()
    expect(answerForIncumbent('', [competitor('Alten')])).toBeNull()
  })
})

describe('« ESN déjà en place » + « Positionnement » sans brief (#4323.3)', () => {
  it('une société déjà en place ne se relit pas sous « Positionnement » : son angle vit sur sa ligne', async () => {
    const vs = strategy(['Capgemini', 'Alten'], 'Entrer par la run')
    renderWithRouter(
      <>
        <IncumbentEsnCard accountId="acc-1" answers={vs.vs_competitors} />
        <CompetitivePositioningCard strategy={vs} excludeCompetitors={['Capgemini']} />
      </>,
    )
    expect(await screen.findByText('Capgemini')).toBeInTheDocument()
    expect(screen.getAllByText('Capgemini')).toHaveLength(1)
    expect(screen.getByText('angle Capgemini')).toBeInTheDocument()
    expect(screen.getByTestId('positioning-count')).toHaveTextContent('1 concurrent analysé pour notre angle')
    expect(screen.getByText('Alten')).toBeInTheDocument()
    expect(screen.queryByText('angle Alten')).toBeNull() // l'aperçu montre la différenciation
  })

  it('tous déjà en place : « Positionnement » garde l’angle recommandé, sans « 0 concurrent » ni liste vide', async () => {
    renderWithRouter(
      <CompetitivePositioningCard
        strategy={strategy(['Capgemini'], 'Entrer par la run')}
        excludeCompetitors={['Capgemini']}
      />,
    )
    expect(await screen.findByText('Entrer par la run')).toBeInTheDocument()
    expect(screen.queryByText(/0 concurrent/)).toBeNull()
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  })

  it('sait dire NON : sans exclusion, la carte rend tout comme avant', async () => {
    renderWithRouter(<CompetitivePositioningCard strategy={strategy(['Capgemini', 'Alten'])} />)
    const rows = await screen.findAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]!).getByText('Capgemini')).toBeInTheDocument()
  })
})
