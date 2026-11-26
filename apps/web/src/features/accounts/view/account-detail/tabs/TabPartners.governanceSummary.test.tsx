import type { Account, PartnerGovernanceReadiness } from '@bellum/contracts'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

let landscape: Record<string, unknown> = {}
let partnerRelations: unknown[] = []

vi.mock('@/lib/api', () => ({
  apiFetch: ({ path }: { path: string }) => {
    if (path === '/partners') return Promise.resolve(partnerRelations)
    return Promise.resolve(landscape)
  },
}))

let seq = 0
const nextAccount = () => ({ id: `a-govsum-${++seq}`, company_name: 'SNCF' }) as Account
const partner = (over: Record<string, unknown> = {}) => ({
  id: 'p-1',
  account_id: 'a-1',
  entity_id: null,
  name: 'Lorvane Conseil (exemple)',
  rank: 'rank2',
  relationship: 'partner',
  note: null,
  source: 'declared',
  placements: 0,
  certainty: null,
  scope: null,
  detected_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  score: 10,
  ...over,
})

const emptyReadiness: PartnerGovernanceReadiness = {
  framed: [],
  missing: ['entry_door', 'accounts_accessible', 'margin_floor', 'non_circumvention'],
  risk: 'blocking',
  accountsConcerned: [],
  profilesConcerned: [],
  nextValidation: 'accounts_accessible',
}

const relationView = (over: Record<string, unknown> = {}) => ({
  id: 'rel-1',
  siren: null,
  name: 'Lorvane Conseil (exemple)',
  stage: 'identifie',
  roles: ['fournisseur'],
  contactName: null,
  notes: null,
  needsReceived90d: 0,
  needsGiven90d: 0,
  placementsActive: 0,
  placementsTotal: 0,
  lastActivityAt: null,
  nonSolicitation: null,
  score: { total: 0, max: 0, axes: [], unmeasured: [] },
  notCollected: [],
  governance: {},
  governanceReadiness: emptyReadiness,
  governanceStatus: 'observed',
  pausedAt: null,
  pausedReason: null,
  blockedAt: null,
  blockedReason: null,
  ...over,
})

beforeEach(() => {
  cleanup()
  landscape = { partners: [], recommendations: [], observed: [] }
  partnerRelations = []
})

/**
 * #3404 (recette 30/09 : « preuve et confiance non affichées dans la modale ») —
 * LE RÉSUMÉ DE GOUVERNANCE NOMME LA PREUVE DU RÉFÉRENCEMENT ET LA CONFIANCE.
 */
describe('TabPartners — preuve et confiance dans le cadre de la relation (#3404.14/.15)', () => {
  async function openModal(relation: Record<string, unknown>, certainty: string | null) {
    landscape = {
      partners: [partner({ partner_relation_id: 'rel-1', certainty })],
      recommendations: [],
      observed: [],
    }
    partnerRelations = [relationView(relation)]
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await user.click(await screen.findByRole('button', { name: /Voir le détail de Lorvane Conseil \(exemple\)/i }))
    return within(await screen.findByRole('dialog'))
  }

  it('nomme la preuve du référencement et la confiance quand elles existent', async () => {
    const dialogue = await openModal({ governance: { referencingProof: 'Cadre signé le 03/04/2026' } }, 'moyenne')
    const summary = dialogue.getByTestId('partner-governance-summary')
    expect(within(summary).getByText(/Preuve du référencement : Cadre signé le 03\/04\/2026/)).toBeInTheDocument()
    expect(within(summary).getByText('Confiance : indices probables')).toBeInTheDocument()
  })

  it('sans preuve ni confiance, aucune des deux lignes — une absence ne fait pas de ligne', async () => {
    const dialogue = await openModal({ governance: {} }, null)
    const summary = dialogue.getByTestId('partner-governance-summary')
    expect(within(summary).queryByText(/Preuve du référencement/)).not.toBeInTheDocument()
    expect(within(summary).queryByText(/Confiance :/)).not.toBeInTheDocument()
  })
})
