import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StructuralPotentialBadge } from './StructuralPotentialBadge'

/**
 * #1573.4 — LE BADGE « POTENTIEL STRUCTUREL FORT ».
 *
 * Trois refus, et c'est tout l'intérêt du composant :
 *  1. **Aucune date.** Le badge ne porte que ce qui est observé, jamais quand.
 *  2. **« Bellum a observé… », jamais « cette entreprise travaille avec… ».**
 *     Le détail décrit une OBSERVATION, jamais un fait présent — #1573.4
 *     l'écrit en toutes lettres.
 *  3. **Fermé par défaut.** Le détail n'apparaît qu'au clic, jamais au repos —
 *     c'est un badge SECONDAIRE, pas une alerte.
 */

afterEach(cleanup)

describe('StructuralPotentialBadge', () => {
  it('affiche le libellé du badge, et rien du détail tant qu’il n’est pas ouvert', () => {
    render(<StructuralPotentialBadge companyName="Thales" count={41} />)

    expect(screen.getByRole('button', { name: /potentiel structurel fort/i })).toBeInTheDocument()
    expect(screen.queryByText(/a observé/i)).not.toBeInTheDocument()
  })

  it('est un VRAI bouton, tabulable — ce qui se clique se tabule (GA-35)', () => {
    render(<StructuralPotentialBadge companyName="Thales" count={41} />)

    const bouton = screen.getByRole('button', { name: /potentiel structurel fort/i })
    expect(bouton.tagName).toBe('BUTTON')
    expect(bouton.getAttribute('type')).toBe('button')
  })

  it('au clic, dit ce qui est OBSERVÉ — « Bellum a observé… »', () => {
    render(<StructuralPotentialBadge companyName="Thales" count={41} />)

    fireEvent.click(screen.getByRole('button', { name: /potentiel structurel fort/i }))

    expect(screen.getByText(/Bellum a observé/i)).toBeInTheDocument()
    expect(screen.getByText(/41/)).toBeInTheDocument()
  })

  it('ne dit JAMAIS que l’entreprise travaille actuellement avec un prestataire', () => {
    render(<StructuralPotentialBadge companyName="Thales" count={41} />)

    fireEvent.click(screen.getByRole('button', { name: /potentiel structurel fort/i }))

    const texte = document.body.textContent ?? ''
    expect(texte).not.toMatch(/travaille (actuellement |aujourd'hui )?avec/i)
  })

  it('n’affiche AUCUNE date, dans aucun état', () => {
    render(<StructuralPotentialBadge companyName="Thales" count={41} />)

    fireEvent.click(screen.getByRole('button', { name: /potentiel structurel fort/i }))

    const texte = document.body.textContent ?? ''
    expect(texte).not.toMatch(/\d{4}/)
    expect(texte).not.toMatch(/il y a |depuis |202\d/)
  })
})
