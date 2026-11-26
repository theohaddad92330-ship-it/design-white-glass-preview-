import type { Account } from '@bellum/contracts'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

let landscape: Record<string, unknown> = {}
let partnerRelations: unknown[] = []
let accountContacts: unknown[] = []

vi.mock('@/lib/api', () => ({
  apiFetch: ({ path }: { path: string }) => {
    if (path === '/partners') return Promise.resolve(partnerRelations)
    if (path.startsWith('/contacts/account/')) return Promise.resolve(accountContacts)
    return Promise.resolve(landscape)
  },
}))

let seq = 0
const nextAccount = () => ({ id: `a-dm-${++seq}`, company_name: 'SNCF' }) as Account
const partner = {
  id: 'p-1',
  account_id: 'a-1',
  entity_id: null,
  name: 'Lorvane Conseil',
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
  partner_relation_id: 'rel-1',
}
const relation = {
  id: 'rel-1',
  siren: null,
  name: 'Lorvane Conseil',
  stage: 'identifie',
  roles: ['fournisseur'],
  contactName: 'Claire Dupuis',
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
  governanceReadiness: {
    framed: [],
    missing: ['entry_door'],
    risk: 'blocking',
    accountsConcerned: [],
    profilesConcerned: [],
    nextValidation: 'entry_door',
  },
  governanceStatus: 'observed',
  pausedAt: null,
  pausedReason: null,
  blockedAt: null,
  blockedReason: null,
}

beforeEach(() => {
  cleanup()
  landscape = { partners: [partner], recommendations: [], observed: [] }
  partnerRelations = [relation]
  accountContacts = []
})

/** #4292.2 (recette 23/10) — le badge « Décideur » suit le contact PARTOUT où il est nommé. */
describe('TabPartners — la pastille Décideur (#4292.2)', () => {
  it('la pose sur le contact nommé dans la modale quand il est décideur du compte', async () => {
    accountContacts = [{ id: 'c1', full_name: 'Claire Dupuis', decision_role: 'economic' }]
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await user.click(await screen.findByRole('button', { name: /Voir le détail de Lorvane Conseil/i }))
    const dialogue = await screen.findByRole('dialog')
    expect(await within(dialogue).findByText('Décideur')).toBeInTheDocument()
  })

  it('ne dit rien pour un contact non décideur', async () => {
    accountContacts = [{ id: 'c1', full_name: 'Claire Dupuis', decision_role: 'user' }]
    const user = userEvent.setup()
    renderWithRouter(<TabPartners account={nextAccount()} />)
    await user.click(await screen.findByRole('button', { name: /Voir le détail de Lorvane Conseil/i }))
    const dialogue = await screen.findByRole('dialog')
    await within(dialogue).findByText(/Claire Dupuis/)
    expect(within(dialogue).queryByText('Décideur')).not.toBeInTheDocument()
  })
})
