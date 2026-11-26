import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TargetSectorFilterNotice } from './TargetSectorFilterNotice'

/**
 * #2489.3/D1 (décision Louis, 18/09/2026 après-midi) — le compteur n'est PAS
 * décoratif, et sait dire NON : un espace SANS cible déclarée n'affiche rien
 * du tout (ni compteur, ni bouton), distinct des deux états où une cible EST
 * déclarée (filtre actif, ou explicitement désactivé par le bouton).
 */
describe('TargetSectorFilterNotice', () => {
  it('sans cible déclarée (`filter` absent), ne rend RIEN — pas un compteur à zéro', () => {
    const { container } = render(<TargetSectorFilterNotice filter={undefined} onToggle={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('filtre actif, résultats écartés : nomme le compte ET les secteurs écartés', () => {
    render(
      <TargetSectorFilterNotice
        filter={{
          applied: true,
          excludedCount: 17,
          excludedSectors: ['Restauration traditionnelle', 'Restauration rapide'],
        }}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByText(/17 résultats hors cible écartés/)).toBeInTheDocument()
    expect(screen.getByText(/Restauration traditionnelle, Restauration rapide/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /chercher hors de ma cible/i })).toBeInTheDocument()
  })

  it('filtre actif, 0 écarté : lecture DIFFÉRENTE de « aucun filtre » — « cible respectée »', () => {
    render(
      <TargetSectorFilterNotice
        filter={{ applied: true, excludedCount: 0, excludedSectors: [] }}
        onToggle={() => {}}
      />,
    )

    expect(screen.getByText(/cible respectée/i)).toBeInTheDocument()
    // La phrase COMPTÉE (« N résultats hors cible écartés ») ne s'affiche pas :
    // « 0 écarté » a sa PROPRE phrase, jamais « 0 résultats hors cible écartés ».
    expect(screen.queryByText(/résultats? hors cible écartés?/i)).not.toBeInTheDocument()
  })

  it('le clic sur « chercher hors de ma cible » bascule vers true', async () => {
    const onToggle = vi.fn()
    render(
      <TargetSectorFilterNotice
        filter={{ applied: true, excludedCount: 2, excludedSectors: ['Boulangerie'] }}
        onToggle={onToggle}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /chercher hors de ma cible/i }))
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('filtre désactivé (bouton actionné) : état VISIBLE, distinct de « 0 écarté »', () => {
    render(
      <TargetSectorFilterNotice
        filter={{ applied: false, excludedCount: 0, excludedSectors: [] }}
        onToggle={() => {}}
      />,
    )

    expect(screen.getByText(/filtre cible désactivé/i)).toBeInTheDocument()
    expect(screen.queryByText(/cible respectée/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /revenir à ma cible/i })).toBeInTheDocument()
  })

  it('le clic sur « revenir à ma cible » bascule vers false', async () => {
    const onToggle = vi.fn()
    render(
      <TargetSectorFilterNotice
        filter={{ applied: false, excludedCount: 0, excludedSectors: [] }}
        onToggle={onToggle}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /revenir à ma cible/i }))
    expect(onToggle).toHaveBeenCalledWith(false)
  })
})
