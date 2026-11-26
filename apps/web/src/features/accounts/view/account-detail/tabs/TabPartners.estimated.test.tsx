import type { Account, PartnerEvidenceOrigin } from '@bellum/contracts'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

let landscape: Record<string, unknown> = {}
const calls: { path: string; method?: string; body?: unknown }[] = []

vi.mock('@/lib/api', () => ({
  apiFetch: (args: { path: string; method?: string; body?: unknown }) => {
    calls.push(args)
    if (args.method) return Promise.resolve({})
    return Promise.resolve(landscape)
  },
}))

// ⚠️ Un identifiant DIFFÉRENT par test : `renderWithRouter` partage un
// `QueryClient` de niveau module (voir `TabPartners.evidence.test.tsx`).
let seq = 0
const nextAccount = () => ({ id: `a-observed-${++seq}`, company_name: 'SNCF' }) as Account

/**
 * La ligne canonique par DÉFAUT : détectée par le pipeline et observée par le
 * corpus. `rank`/`relationship` à « unknown », parce que `seedDetectedPartners`
 * écrit littéralement ces deux valeurs pour toute ligne qu'il pose.
 */
const partner = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  account_id: 'a-1',
  entity_id: null,
  name: 'ALTEN',
  rank: 'unknown',
  relationship: 'unknown',
  note: null,
  source: 'analysis',
  placements: 0,
  certainty: null,
  scope: null,
  detected_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  score: 10,
  evidence_origins: ['market_observation', 'current_inference'],
  market_observation_count: 9,
  ...over,
})

beforeEach(() => {
  cleanup()
  calls.length = 0
  landscape = { partners: [], recommendations: [], observed: [] }
})

/**
 * #4295.21 — recette prod du 25/10 : THALES `?tab=partners`, 0 badge « estimé » alors que les partenaires sont
 * déduits. Règle de l'issue : une relation DÉDUITE (aucune déclaration de l'espace, aucune qualification humaine)
 * porte « estimé » ; une relation confirmée (déclarée ou qualifiée) n'en porte pas. `EstimatedBadge` est la seule
 * primitive (GA-26).
 */
describe('TabPartners — « estimé » sur une relation déduite (#4295.21)', () => {
  it('une ligne détectée/observée, jamais confirmée, porte « estimé »', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    const ligne = await screen.findByTestId('partner-row-p-1')
    expect(within(ligne).getByText('estimé')).toBeInTheDocument()
  })

  it('une ligne détectée seule (inférence du produit) porte « estimé »', async () => {
    landscape = {
      partners: [partner({ evidence_origins: ['current_inference'], market_observation_count: null })],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    expect(within(await screen.findByTestId('partner-row-p-1')).getByText('estimé')).toBeInTheDocument()
  })

  it('une ligne déclarée par l’espace n’en porte pas', async () => {
    landscape = {
      partners: [partner({ source: 'declared', evidence_origins: ['workspace_declared', 'market_observation'] })],
      recommendations: [],
      observed: [],
    }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    expect(within(await screen.findByTestId('partner-row-p-1')).queryByText('estimé')).not.toBeInTheDocument()
  })

  it('une ligne qualifiée par une personne n’en porte pas', async () => {
    landscape = { partners: [partner({ rank: 'rank2' })], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    expect(within(await screen.findByTestId('partner-row-p-1')).queryByText('estimé')).not.toBeInTheDocument()
  })

  it('sans origines connues (API antérieure) : aucun badge, on ne requalifie pas', async () => {
    landscape = { partners: [partner({ evidence_origins: undefined })], recommendations: [], observed: [] }
    renderWithRouter(<TabPartners account={nextAccount()} />)
    expect(within(await screen.findByTestId('partner-row-p-1')).queryByText('estimé')).not.toBeInTheDocument()
  })
})
