import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectRow } from '@bellum/contracts'
import { ProjectOwnerControl } from './ProjectOwnerControl'

const updateOwner = vi.fn().mockResolvedValue({})
vi.mock('../api', () => ({
  projectsApi: { updateOwner: (...args: unknown[]) => updateOwner(...args) },
  projectQueryKeys: { all: ['projects'] },
}))

const useProjectOwnersMock = vi.fn()
vi.mock('../hooks/useProjectOwners', () => ({
  useProjectOwners: () => useProjectOwnersMock(),
}))

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

beforeEach(() => {
  updateOwner.mockClear()
  useProjectOwnersMock.mockReturnValue({
    selfId: 'u-1',
    ownerName: (id: string | null) => (id === 'u-1' ? 'Alice Martin' : id === 'u-2' ? 'Bruno Petit' : null),
    members: [
      { id: 'u-1', name: 'Alice Martin' },
      { id: 'u-2', name: 'Bruno Petit' },
    ],
  })
})

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

/**
 * #2170.26 — « Attribuer » (changer l'owner) depuis le dossier de l'affaire.
 * `PATCH /projects/:id/owner` existait déjà côté serveur, sans appelant web
 * (registre du 16/09 : « lecture seule de l'owner trouvée, aucun contrôle
 * d'écriture identifié »).
 */
describe('ProjectOwnerControl', () => {
  it('affiche « Non attribué » quand aucun owner n’est posé', () => {
    wrap(<ProjectOwnerControl opportunity={opportunity} />)
    expect(screen.getByText('Non attribué')).toBeInTheDocument()
  })

  it('affiche le nom du porteur courant, jamais son identifiant', () => {
    wrap(<ProjectOwnerControl opportunity={{ ...opportunity, owner_id: 'u-1' }} />)
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    expect(screen.queryByText('u-1')).not.toBeInTheDocument()
  })

  it('attribue le projet au membre choisi dans la liste', async () => {
    const u = user()
    wrap(<ProjectOwnerControl opportunity={opportunity} />)

    await u.click(screen.getByRole('button', { name: 'Changer de responsable' }))
    await u.click(await screen.findByText('Bruno Petit'))

    expect(updateOwner).toHaveBeenCalledWith('op-1', 'u-2')
  })

  it('retire l’attribution en choisissant « Non attribué » — jamais un porteur fabriqué', async () => {
    const u = user()
    wrap(<ProjectOwnerControl opportunity={{ ...opportunity, owner_id: 'u-1' }} />)

    await u.click(screen.getByRole('button', { name: 'Changer de responsable' }))
    // Deux occurrences : le bouton fermé montre déjà le nom courant, le menu
    // ouvre son propre choix « Non attribué » — c'est CELUI du menu qu'on vise.
    await u.click(await screen.findByText('Non attribué'))

    expect(updateOwner).toHaveBeenCalledWith('op-1', null)
  })
})
