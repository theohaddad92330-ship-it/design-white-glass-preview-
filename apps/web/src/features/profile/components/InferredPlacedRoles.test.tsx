import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Métiers placés DÉDUITS (décision Louis 11/10/2026) — dans « Mon profil »,
 * chaque métier déduit porte le badge « déduit » et ses indices, avec un geste
 * pour le confirmer (il devient déclaré) ou le retirer. Rien de déductible :
 * on POSE LA QUESTION.
 */

const getInferenceMock = vi.fn()
const dismissMock = vi.fn()
vi.mock('@/features/profile/api', () => ({
  esnProfileKeys: { placedRolesInference: ['esn-profile', 'placed-roles-inference'] },
  esnProfileApi: {
    getPlacedRolesInference: () => getInferenceMock(),
    dismissInferredPlacedRole: (role: string) => dismissMock(role),
  },
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'me' }, loading: false }) }))

const { InferredPlacedRoles } = await import('./InferredPlacedRoles')

const CYBER = {
  role: 'Consultant cybersécurité',
  evidence: [
    { source: 'onboarding', field: 'positioning', excerpt: 'ESN cybersécurité : SOC et pentest' },
    { source: 'talent_pool', excerpt: 'Analyste SOC N2' },
  ],
  evidenceCount: 2,
}

function renderIt(props: Partial<{ locked: boolean; onConfirm: (role: string) => void }> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <InferredPlacedRoles locked={props.locked ?? false} onConfirm={props.onConfirm ?? (() => undefined)} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  getInferenceMock.mockReset()
  dismissMock.mockReset()
})

describe('InferredPlacedRoles (11/10)', () => {
  it('montre le métier déduit, le badge « déduit » et ses indices', async () => {
    getInferenceMock.mockResolvedValue({ roles: [CYBER], declared: false, needsQuestion: false, computedAt: null })
    renderIt()
    expect(await screen.findByText('Consultant cybersécurité')).toBeInTheDocument()
    expect(screen.getByText('déduit')).toBeInTheDocument()
    expect(screen.getByText(/ESN cybersécurité : SOC et pentest/)).toBeInTheDocument()
    expect(screen.getByText(/Analyste SOC N2/)).toBeInTheDocument()
  })

  it('« Confirmer » en fait un métier DÉCLARÉ', async () => {
    getInferenceMock.mockResolvedValue({ roles: [CYBER], declared: false, needsQuestion: false, computedAt: null })
    const onConfirm = vi.fn()
    renderIt({ onConfirm })
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmer Consultant cybersécurité' }))
    expect(onConfirm).toHaveBeenCalledWith('Consultant cybersécurité')
  })

  it('« Retirer » envoie la correction humaine', async () => {
    getInferenceMock.mockResolvedValue({ roles: [CYBER], declared: false, needsQuestion: false, computedAt: null })
    dismissMock.mockResolvedValue({ roles: [], declared: false, needsQuestion: true, computedAt: null })
    renderIt()
    await userEvent.click(await screen.findByRole('button', { name: 'Retirer Consultant cybersécurité' }))
    expect(dismissMock).toHaveBeenCalledWith('Consultant cybersécurité')
  })

  it('rien de déductible : on POSE LA QUESTION, sans deviner', async () => {
    getInferenceMock.mockResolvedValue({ roles: [], declared: false, needsQuestion: true, computedAt: null })
    renderIt()
    expect(await screen.findByText('Quels métiers places-tu ?')).toBeInTheDocument()
    expect(screen.queryByText('déduit')).not.toBeInTheDocument()
  })

  it('verrouillé (membre sans droit) : les indices restent visibles, aucun geste', async () => {
    getInferenceMock.mockResolvedValue({ roles: [CYBER], declared: false, needsQuestion: false, computedAt: null })
    renderIt({ locked: true })
    expect(await screen.findByText('Consultant cybersécurité')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Retirer/ })).not.toBeInTheDocument()
  })
})
