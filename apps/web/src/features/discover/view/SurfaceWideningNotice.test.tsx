import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SurfaceWideningNotice, WideningBanner } from './WideningNotice'

// #4433.9 — le bandeau « élargi » de Découvrir sert aussi Mes cibles, la veille et l'analyse : un seul composant.
const watch = { minResults: 10, steps: [{ tier: 'watch_intent' as const, added: 11 }] }

describe('SurfaceWideningNotice (#4433.9)', () => {
  it('sans palier ni geste strict : rien', () => {
    const { container } = render(<SurfaceWideningNotice widening={null} strict={false} onStrictChange={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dit le palier atteint, sans question, avec le geste de retour au strict', async () => {
    const onStrictChange = vi.fn()
    render(<SurfaceWideningNotice widening={watch} strict={false} onStrictChange={onStrictChange} />)
    expect(screen.getByText(/Moins de 10 résultats exacts/)).toBeInTheDocument()
    expect(screen.getByText(/Élargi aux comptes déjà traités : 11 résultats/)).toBeInTheDocument()
    expect(screen.queryByText(/veux-tu|voulez-vous|\?/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Revenir au strict/ }))
    expect(onStrictChange).toHaveBeenCalledWith(true)
  })

  it('dit le palier de l’analyse en mots simples, sans geste quand l’élargissement a déjà eu lieu', () => {
    render(
      <SurfaceWideningNotice
        widening={{ minResults: 10, steps: [{ tier: 'contacts_neighbour_roles', added: 1 }] }}
        strict={false}
      />,
    )
    expect(screen.getByText(/Élargi aux postes voisins : 1 résultat$/)).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('vit dans le bandeau commun, à côté de la zone et des critères', () => {
    render(
      <WideningBanner
        criteria={null}
        strict={false}
        onStrictChange={() => {}}
        zone={undefined}
        onZoneRevert={() => {}}
        surface={watch}
        surfaceStrict={false}
        onSurfaceStrictChange={() => {}}
      />,
    )
    expect(screen.getByTestId('widening-banner')).toBeInTheDocument()
    expect(screen.getByTestId('surface-widening-notice')).toBeInTheDocument()
  })
})
