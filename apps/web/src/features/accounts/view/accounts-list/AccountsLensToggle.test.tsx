import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountsLensToggle } from './AccountsLensToggle'

/**
 * #2097.62 — RECETTE IPHONE DU 25/09 : LES PASTILLES « SOUS L'ANGLE … »
 * SE COUPAIENT SOUS 768PX.
 *
 * Les deux pastilles (`FilterChips`, `flex-wrap`) n'avaient aucun défilement
 * propre : sur une ligne d'entête déjà occupée par le bandeau de compteurs,
 * rien ne les faisait tenir ni défiler proprement. Sous 768px seulement
 * (`useIsMobile`), la rangée devient une bande qui défile DANS son
 * conteneur (jamais le corps de la page, D81) — même mécanique que `TabNav`
 * (`useHorizontalOverflow`, GA-119, GA-26 : un seul patron de défilement
 * horizontal dans le dépôt). Desktop garde `flex-wrap`, inchangé.
 *
 * Même faux `matchMedia` que `SidebarCollapse.test.tsx` — jsdom ne
 * l'implémente pas.
 */
function stubMatchMedia(narrow: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: narrow && query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
}

describe('AccountsLensToggle', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rend les deux angles et remonte le choix', async () => {
    stubMatchMedia(false)
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<AccountsLensToggle deliveryLens={false} onChange={onChange} />)

    // #4496 — libellés courts, sans « Regarder ce portefeuille » visible.
    expect(screen.getByText('Commercial')).toBeInTheDocument()
    expect(screen.getByText('Facturation')).toBeInTheDocument()
    expect(screen.queryByText('Regarder ce portefeuille')).not.toBeInTheDocument()

    await user.click(screen.getByText('Facturation'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  describe('#2097.62 — sous 768px, la rangée défile plutôt que de se replier à l’aveugle', () => {
    it('la rangée des pastilles défile dans SON conteneur sur mobile', () => {
      stubMatchMedia(true)
      const { container } = render(<AccountsLensToggle deliveryLens={false} onChange={vi.fn()} />)

      const row = container.querySelector('[data-testid="lens-toggle-row"]')
      expect(row).not.toBeNull()
      expect(row!.className).toContain('overflow-x-auto')
      expect(row!.className).not.toContain('flex-wrap')
    })

    it('le bureau garde la rangée qui se replie — non-régression', () => {
      stubMatchMedia(false)
      const { container } = render(<AccountsLensToggle deliveryLens={false} onChange={vi.fn()} />)

      const row = container.querySelector('[data-testid="lens-toggle-row"]')
      expect(row).not.toBeNull()
      expect(row!.className).toContain('flex-wrap')
      expect(row!.className).not.toContain('overflow-x-auto')
    })
  })
})
