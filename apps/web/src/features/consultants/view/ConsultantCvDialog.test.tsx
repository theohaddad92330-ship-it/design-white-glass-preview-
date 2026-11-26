import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConsultantCvDialog } from './ConsultantCvDialog'

/**
 * #2440.34 (épopée #2975) — l'aperçu à 5 infos manquait les « crédits
 * disponibles » pour cv_rewrite (seul le coût unitaire était annoncé, voir
 * commentaire #2440.38 ci-dessous). Même solde que `TabContacts`/
 * `ContactsSelectionBar` (`credits.enrichment_credits`, GA-26 : une seule
 * dérivation) — `cv_rewrite` débite ce même compteur
 * (`consultants.controller.ts:721`, `reason: 'cv_rewrite'`).
 */
const mockUseCredits = vi.fn()
vi.mock('@/features/credits/hooks/useCredits', () => ({
  useCredits: () => mockUseCredits(),
}))

/**
 * #2440.38 (épopée #2975) — la réécriture de CV est une action PAYANTE
 * (`ConsultantsController.rewriteCv`, `consultants.controller.ts:643`) et
 * l'aperçu avant clic n'annonçait que le coût, jamais ce qui se passe si le
 * modèle échoue. Le serveur débite APRÈS un CV réellement produit
 * (`consultants.controller.ts:637-641`) : un échec IA ne coûte rien. Cette
 * politique d'échec doit être LUE avant le clic, comme pour l'analyse
 * (`LaunchCostNote.tsx`), pas seulement vraie côté serveur.
 */
function renderDialog() {
  const queryClient = new QueryClient()
  render(
    <QueryClientProvider client={queryClient}>
      <ConsultantCvDialog
        open
        consultantId="a0000000-0000-4000-8000-000000000001"
        consultantName="Nadia Fournier"
        opportunityId="b0000000-0000-4000-8000-000000000001"
        rewrite={null}
        onClose={() => {}}
        onGenerated={() => {}}
      />
    </QueryClientProvider>,
  )
}

describe('ConsultantCvDialog — #2440.38 → #4463 (plus aucun crédit à l’écran)', () => {
  afterEach(() => {
    cleanup()
    mockUseCredits.mockReset()
  })

  it("ne parle d'aucun crédit AVANT le clic : ni politique d'échec, ni coût (renverse #2440.38)", () => {
    mockUseCredits.mockReturnValue({ data: undefined })
    renderDialog()
    expect(screen.queryByText(/échec.*crédit/i)).toBeNull()
    expect(screen.queryByText(/Coût\s*:/i)).toBeNull()
    expect(document.body).not.toHaveTextContent(/crédit/i)
  })

  it('le dialogue reste utilisable : le bouton de génération est toujours là', () => {
    mockUseCredits.mockReturnValue({ data: undefined })
    renderDialog()
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })
})

describe('ConsultantCvDialog — #2440.34 → #4463, solde', () => {
  afterEach(() => {
    cleanup()
    mockUseCredits.mockReset()
  })

  it('n’annonce AUCUN solde, même résolu', () => {
    mockUseCredits.mockReturnValue({ data: { enrichment_credits: 12 } })
    renderDialog()
    expect(screen.queryByText(/12/)).toBeNull()
    expect(screen.queryByText(/crédits? d.{1,2}enrichissement disponibles?/i)).toBeNull()
  })

  it('n’annonce pas non plus de solde tant qu’il n’est pas résolu', () => {
    mockUseCredits.mockReturnValue({ data: undefined })
    renderDialog()
    expect(screen.queryByText(/crédits? d.{1,2}enrichissement disponibles?/i)).toBeNull()
  })
})
