import { render, screen } from '@testing-library/react'
import { TabNav } from '@bellum/ui'
import { describe, expect, it } from 'vitest'

// #4576.7 — recette prod 30/10 : les onglets de la fiche consultant mesuraient 32 px à 390 px. Une cible ≥ 44 px sous
// 768 px (borne mobile du produit, GA-28/29/30) : l'onglet porte `max-md:min-h-11`, pas seulement `pointer-coarse`
// (une fenêtre réduite à la souris, ou un navigateur qui ne se déclare pas tactile, n'en est pas un).
describe('TabNav — cible tactile ≥ 44 px sous 768 px (#4576.7)', () => {
  const tabs = [
    { key: 'profile', label: 'Profil' },
    { key: 'rates', label: 'Tarifs' },
  ]

  it.each(['underline', 'pill'] as const)('la variante %s porte min-h-11 sous 768 px', variant => {
    render(<TabNav tabs={tabs} activeTab="profile" onTabChange={() => {}} size="sm" variant={variant} />)
    for (const label of ['Profil', 'Tarifs']) {
      const button = screen.getByText(label).closest('button')
      expect(button?.className).toContain('max-md:min-h-11')
    }
  })
})
