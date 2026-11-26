import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

/**
 * #2170.43 — LES SEUILS D'ÉTAPE : lecture pour tous, modification par le
 * propriétaire ou l'administrateur (arbitrage Louis 31/10/2026). L'écran lit
 * `canEdit` sur la réponse de l'API — il ne recalcule pas le rôle (GA-26).
 *
 * ⚠️ Ce test SAIT DIRE NON : un écran qui ignore `canEdit` laisse le champ et le
 * bouton actifs pour un membre, qui se ferait refuser son clic par un 403.
 */
let canEdit: boolean | undefined = false
vi.mock('@/features/settings/lib/stage-sla-api', () => ({
  stageSlaApi: {
    list: () =>
      Promise.resolve({
        items: [
          { stage: 'negotiation', slaDays: 21, isDefault: true },
          { stage: 'won', slaDays: null, isDefault: true },
        ],
        canEdit,
      }),
    set: vi.fn(),
  },
}))

const { PipelineSlaView } = await import('./PipelineSlaView')

function renderView() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <PipelineSlaView />
    </QueryClientProvider>,
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('Règles › Pipe — les seuils d’étape', () => {
  it('un membre LIT les seuils sans pouvoir les modifier, et l’écran dit qui le peut', async () => {
    canEdit = false
    renderView()
    const input = await screen.findByLabelText(/Durée cible de l'étape/)
    expect(input).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    expect(screen.getByText(/propriétaire ou un administrateur/)).toBeInTheDocument()
  })

  it('un administrateur peut modifier', async () => {
    canEdit = true
    renderView()
    const input = await screen.findByLabelText(/Durée cible de l'étape/)
    expect(input).not.toBeDisabled()
    expect(screen.queryByText(/propriétaire ou un administrateur/)).not.toBeInTheDocument()
  })

  it('dit que la durée règle aussi l’alerte de stagnation de la carte du pipe', async () => {
    canEdit = true
    renderView()
    expect(await screen.findByText(/au double/)).toBeInTheDocument()
  })
})
