import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const { BrandingView } = await import('./BrandingView')

function renderView(ui: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const BRAND = { name: 'Altaïs Conseil', copilotName: 'Laura', logoUrl: null, accent: '#1f4e79', isCustom: true }

function serve(documents: { signature: string | null; footer: string | null }) {
  apiFetch.mockImplementation(async (args: { path: string; method?: string }) => {
    if (args.path === '/workspaces/brand/documents') return documents
    return BRAND
  })
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  apiFetch.mockReset()
})

/**
 * Théo D settings-espace.R5 / N5 / A4 — Marque & documents : la signature proposée et le pied de document de
 * l'espace se règlent ici et se PRÉVISUALISENT ; « Nom du copilote » a disparu (Laura partout, D82).
 */
describe('Réglages › Marque & documents', () => {
  it('relit la signature et le pied posés, et les montre dans l’aperçu du dossier', async () => {
    serve({
      signature: 'L’équipe Altaïs Conseil\n04 78 92 15 60',
      footer: 'Altaïs Conseil SAS · Document confidentiel',
    })
    renderView(<BrandingView />)

    expect(await screen.findByLabelText('Signature proposée')).toHaveValue('L’équipe Altaïs Conseil\n04 78 92 15 60')
    expect(screen.getByLabelText('Pied de document')).toHaveValue('Altaïs Conseil SAS · Document confidentiel')
    const preview = screen.getByRole('img', { name: /Aperçu d’un dossier de compétences/ })
    expect(preview).toHaveTextContent('04 78 92 15 60')
    expect(preview).toHaveTextContent('Document confidentiel')
  })

  it('NON : rien de posé = aucune ligne dans l’aperçu (ni signature ni pied inventés)', async () => {
    serve({ signature: null, footer: null })
    renderView(<BrandingView />)

    expect(await screen.findByLabelText('Signature proposée')).toHaveValue('')
    const preview = screen.getByRole('img', { name: /Aperçu d’un dossier de compétences/ })
    expect(preview).toHaveTextContent('Dossier de compétences')
    expect(preview.querySelectorAll('p, span, div').length).toBeLessThan(8)
    expect(preview).not.toHaveTextContent('confidentiel')
  })

  it('enregistre la signature et le pied avec la marque — un enregistrement ne les efface pas', async () => {
    serve({ signature: 'Ancienne signature', footer: 'Ancien pied' })
    renderView(<BrandingView />)

    const signature = await screen.findByLabelText('Signature proposée')
    await userEvent.clear(signature)
    await userEvent.type(signature, 'Nouvelle signature')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/workspaces/brand',
          method: 'PATCH',
          body: expect.objectContaining({ documentSignature: 'Nouvelle signature', documentFooter: 'Ancien pied' }),
        }),
      ),
    )
  })

  it('NON : le nom du copilote n’est plus un réglage — Laura s’appelle Laura partout', async () => {
    serve({ signature: null, footer: null })
    renderView(<BrandingView />)
    await screen.findByLabelText('Signature proposée')

    expect(screen.queryByLabelText(/Nom du copilote/i)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(expect.objectContaining({ method: 'PATCH' })))
    const patch = apiFetch.mock.calls.find(call => (call[0] as { method?: string }).method === 'PATCH')?.[0] as {
      body: Record<string, unknown>
    }
    expect(patch.body).not.toHaveProperty('copilotName')
  })

  it('refonte Théo — deux blocs dans l’ordre de la maquette, puis l’état d’enregistrement', async () => {
    serve({ signature: null, footer: null })
    renderView(<BrandingView />)

    await screen.findByLabelText('Signature proposée')
    const titles = screen.getAllByRole('heading', { level: 2 }).map(heading => heading.textContent)
    expect(titles).toEqual(['Identité des documents', 'Domaine'])
    expect(screen.getByRole('group', { name: 'Aperçu' })).toBeInTheDocument()
    expect(screen.getByText('Aucune modification en attente')).toBeInTheDocument()
  })
})
