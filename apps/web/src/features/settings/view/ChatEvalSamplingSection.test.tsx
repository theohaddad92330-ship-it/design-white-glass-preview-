import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const { ChatEvalSamplingSection } = await import('./ChatEvalSamplingSection')

function renderView(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
})

describe('#2899 — ChatEvalSamplingSection (opt-in par espace)', () => {
  it('affiche le réglage éteint par défaut et dit ce qui n’est JAMAIS versé', async () => {
    apiFetch.mockResolvedValue({ enabled: false, canEdit: true })
    renderView(<ChatEvalSamplingSection />)
    const toggle = await screen.findByRole('switch', { name: /évaluations/i })
    expect(toggle).not.toBeChecked()
    expect(screen.getByText(/Jamais versé/)).toBeInTheDocument()
    expect(apiFetch).toHaveBeenCalledWith({ path: '/workspaces/chat-eval-sampling' })
  })

  it('#4173 — le libellé dit « Activé par défaut », jamais « Désactivé par défaut » (texte périmé)', async () => {
    apiFetch.mockResolvedValue({ enabled: true, canEdit: true })
    renderView(<ChatEvalSamplingSection />)
    await screen.findByRole('switch', { name: /évaluations/i })
    expect(screen.getByText(/Activé par défaut/)).toBeInTheDocument()
    expect(screen.queryByText(/Désactivé par défaut/)).toBeNull()
  })

  it('l’administrateur coche : la route reçoit enabled: true', async () => {
    apiFetch.mockImplementation((args: { method?: string }) =>
      Promise.resolve(args.method === 'PATCH' ? { enabled: true, canEdit: true } : { enabled: false, canEdit: true }),
    )
    renderView(<ChatEvalSamplingSection />)
    await userEvent.click(await screen.findByRole('switch', { name: /évaluations/i }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({
        path: '/workspaces/chat-eval-sampling',
        method: 'PATCH',
        body: { enabled: true },
      }),
    )
  })

  it('NON : un membre non administrateur LIT l’état mais n’a aucun interrupteur', async () => {
    apiFetch.mockResolvedValue({ enabled: true, canEdit: false })
    renderView(<ChatEvalSamplingSection />)
    expect(await screen.findByText('Activé')).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('lecture en échec ou forme illisible : rien n’est affiché, jamais un « désactivé » inventé', async () => {
    apiFetch.mockRejectedValue(new Error('down'))
    const { container } = renderView(<ChatEvalSamplingSection />)
    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})
