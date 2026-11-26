import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectRow } from '@bellum/contracts'
import { ProjectStageControl } from './ProjectStageControl'

const updateStage = vi.fn().mockResolvedValue({})
vi.mock('../api', () => ({
  projectsApi: { updateStage: (...args: unknown[]) => updateStage(...args) },
  projectQueryKeys: { all: ['projects'] },
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

beforeEach(() => updateStage.mockClear())

function wrap(node: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

const opportunity: ProjectRow = {
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
  stage: 'detected',
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

describe('ProjectStageControl', () => {
  it('affiche l’étape courante avec son libellé FR', () => {
    wrap(<ProjectStageControl opportunity={opportunity} />)
    expect(screen.getByText('Détecté')).toBeInTheDocument()
  })

  it('déplace le projet quand une autre étape est choisie', async () => {
    const u = user()
    wrap(<ProjectStageControl opportunity={opportunity} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))
    await u.click(await screen.findByText('Cadrage'))
    // Depuis le §8.5, tout déplacement passe par le panneau d'effet : il dit ce
    // qui change avant que quoi que ce soit ne parte.
    await u.click(await screen.findByRole('button', { name: 'Déplacer' }))

    expect(updateStage).toHaveBeenCalledWith('op-1', 'qualified', null, expect.any(Array))
  })

  it('propose TOUTES les étapes, y compris un retour en arrière', async () => {
    // Un pipe qui interdit de reculer se fait contourner par des projets qu'on
    // n'ose plus toucher : la correction doit rester à un clic.
    const u = user()
    wrap(<ProjectStageControl opportunity={{ ...opportunity, stage: 'negotiation' }} />)

    await u.click(screen.getByRole('button', { name: 'Changer d’étape' }))

    expect(await screen.findByText('Cadrage')).toBeInTheDocument()
    expect(await screen.findByText('En sommeil')).toBeInTheDocument()
  })
})
