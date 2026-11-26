import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectRow } from '@bellum/contracts'
import { ProjectStageControl } from './ProjectStageControl'

const updateStage = vi.fn().mockResolvedValue({})
const listLossReasons = vi.fn().mockResolvedValue({ items: [] })
vi.mock('../api', () => ({
  projectsApi: {
    updateStage: (...args: unknown[]) => updateStage(...args),
    listLossReasons: () => listLossReasons(),
  },
  projectQueryKeys: { all: ['projects'], lossReasons: ['projects', 'loss-reasons'] },
}))

const createLostDealRex = vi.fn().mockResolvedValue({ id: 'ldr-1' })
vi.mock('../lost-deal-rex-api', () => ({
  lostDealRexApi: { create: (...args: unknown[]) => createLostDealRex(...args) },
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

beforeEach(() => {
  updateStage.mockClear()
  listLossReasons.mockClear()
  createLostDealRex.mockClear()
  listLossReasons.mockResolvedValue({ items: [] })
})

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const project: ProjectRow = {
  id: 'op-1',
  account_id: 'acc-1',
  company_name: 'ACME',
  sector: null,
  logo_url: null,
  website: null,
  kind: 'pain',
  label: 'Migration Cloud',
  detail: null,
  offer: null,
  source: 'pain',
  confidence: 'high',
  urgency: null,
  stage: 'negotiation',
  stage_entered_at: '2026-07-01T00:00:00.000Z',
  owner_id: null,
  expected_close_on: null,
  closed_at: null,
  outcome: null,
  loss_reason: null,
  first_detected_at: '2026-07-21T10:00:00.000Z',
  updated_at: '2026-07-21T10:00:00.000Z',
}

const user = () => userEvent.setup({ pointerEventsCheck: 0 })

/**
 * BEL-SC-243 (#3272.1) — la tranche visible : une fois la perte CONFIRMÉE
 * (jamais avant), l'écran propose de documenter un REX de perte.
 */
describe('ProjectStageControl — l’offre de REX de perte', () => {
  it('propose le REX de perte APRÈS une perte confirmée', async () => {
    const u = user()
    wrap(<ProjectStageControl opportunity={project} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))
    await u.click(await screen.findByText('Perdue'))
    // #3989.9 — le motif fermé est obligatoire, la précision libre facultative.
    await u.click(await screen.findByRole('combobox', { name: 'Motif de la perte' }))
    await u.click(await screen.findByRole('option', { name: 'Pas de budget' }))
    await u.type(await screen.findByRole('textbox'), 'Budget gelé côté client')
    await u.click(screen.getByRole('button', { name: 'Déplacer' }))

    expect(updateStage).toHaveBeenCalledWith(
      'op-1',
      'lost',
      'Budget gelé côté client',
      expect.any(Array),
      expect.objectContaining({ loss_reason_code: 'no_budget' }),
    )
    expect(await screen.findByText('REX de perte')).toBeInTheDocument()
  })

  it('ne propose AUCUN REX quand la destination n’est pas « Perdu »', async () => {
    const u = user()
    wrap(<ProjectStageControl opportunity={project} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))
    await u.click(await screen.findByText('En sommeil'))
    await u.click(await screen.findByRole('button', { name: 'Déplacer' }))

    expect(updateStage).toHaveBeenCalledWith('op-1', 'dormant', null, expect.any(Array))
    expect(screen.queryByText('REX de perte')).not.toBeInTheDocument()
  })

  it('enregistre le REX rattaché au projet et au compte', async () => {
    const u = user()
    wrap(<ProjectStageControl opportunity={project} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))
    await u.click(await screen.findByText('Perdue'))
    // #3989.9 — le motif fermé est obligatoire, la précision libre facultative.
    await u.click(await screen.findByRole('combobox', { name: 'Motif de la perte' }))
    await u.click(await screen.findByRole('option', { name: 'Pas de budget' }))
    await u.type(await screen.findByRole('textbox'), 'Budget gelé côté client')
    await u.click(screen.getByRole('button', { name: 'Déplacer' }))

    await u.click(await screen.findByRole('button', { name: 'Enregistrer le REX' }))

    expect(createLostDealRex.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ project_id: 'op-1', account_id: 'acc-1' }),
    )
  })
})
