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
const nextAccount = () => ({ id: `a-gov-${++seq}`, company_name: 'SNCF' }) as Account
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
 * #3270.6 (SURFACES) — LE CADRE DE GOUVERNANCE RANG 2, SUR LA FICHE COMPTE.
 *
 * `account_partners` (cette ESN chez ce compte) et `partner_relations` (MA
 * relation avec elle, où vit le cadre #3270) restent deux objets distincts —
 * le rapprochement de la modale se fait par NOM, en lecture seule, jamais par
 * une jointure SQL (règle 4 de #3249).
 */
describe('TabPartners — le cadre de gouvernance rang 2 (#3270.6)', () => {
  it('affiche le statut de gouvernance quand cette ESN a une relation partenaire du même nom', async () => {
    landscape = { partners: [partner()], recommendations: [], observed: [] }
    partnerRelations = [relationView({ governanceStatus: 'rules_missing' })]
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de Lorvane Conseil \(exemple\)/i }))
    const dialogue = await screen.findByRole('dialog')

    expect(within(dialogue).getByText('Cadre partenaire (rang 2)')).toBeInTheDocument()
    expect(within(dialogue).getByText('Règles manquantes')).toBeInTheDocument()
    const link = within(dialogue).getByRole('link', { name: /cadre partenaire de Lorvane Conseil \(exemple\)/i })
    expect(link).toHaveAttribute('href', '/accounts/partners')
  })

  it('le rapprochement est insensible à la casse et aux espaces', async () => {
    landscape = { partners: [partner({ name: '  lorvane conseil (exemple)  ' })], recommendations: [], observed: [] }
    partnerRelations = [relationView({ governanceStatus: 'active' })]
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de lorvane conseil/i }))
    const dialogue = await screen.findByRole('dialog')

    expect(within(dialogue).getByText('Actif')).toBeInTheDocument()
  })

  it('ne dit rien quand aucune relation partenaire ne porte ce nom — jamais devinée (GA-18/GA-19)', async () => {
    landscape = { partners: [partner({ name: 'ESN sans relation' })], recommendations: [], observed: [] }
    partnerRelations = [relationView({ name: 'Une autre ESN' })]
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)

    await user.click(await screen.findByRole('button', { name: /Voir le détail de ESN sans relation/i }))
    const dialogue = await screen.findByRole('dialog')

    expect(within(dialogue).queryByText('Cadre partenaire (rang 2)')).not.toBeInTheDocument()
  })
})
