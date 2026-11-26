import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EmailWithBreaks } from './EmailWithBreaks'

describe('EmailWithBreaks — recette 21/10 A.5', () => {
  it('garde l’adresse exacte et ne propose une coupure qu’après « @ » et « . »', () => {
    const { container } = render(<EmailWithBreaks email="prenom.nom@grand-groupe.example.com" />)
    expect(container.textContent).toBe('prenom.nom@grand-groupe.example.com')
    expect(container.querySelectorAll('wbr')).toHaveLength(4)
    expect(container.innerHTML.replace(/<\/?span[^>]*>/g, '')).toBe(
      'prenom.<wbr>nom<wbr>@grand-groupe.<wbr>example.<wbr>com',
    )
  })
  it('dit NON : une adresse sans séparateur n’a aucun point de rupture', () => {
    const { container } = render(<EmailWithBreaks email="contact" />)
    expect(container.querySelectorAll('wbr')).toHaveLength(0)
  })
})

/**
 * #4503 — recette prod 25/10 : « carrefour. / com », l'adresse coupée au milieu du DOMAINE alors qu'elle tenait en
 * deux morceaux lisibles de part et d'autre de « @ ». Un navigateur remplit la ligne jusqu'à la DERNIÈRE coupure
 * possible : tant que « @ » et « . » sont des coupures égales, c'est le point du domaine qui gagne. La partie locale et
 * le domaine deviennent deux blocs insécables (`inline-block`) : la ligne se coupe d'abord à « @ », et un morceau ne se
 * recoupe à ses points que s'il ne tient pas seul dans la colonne.
 */
describe('EmailWithBreaks — #4503, la coupure passe d’abord par « @ »', () => {
  it('rend la partie locale et « @domaine » comme deux blocs, chacun borné à la largeur de sa colonne', () => {
    const { container } = render(<EmailWithBreaks email="jean.dupont@carrefour.com" />)
    const blocks = Array.from(container.querySelectorAll(':scope > span'))
    expect(blocks.map(block => block.textContent)).toEqual(['jean.dupont', '@carrefour.com'])
    for (const block of blocks)
      expect(block.className).toMatch(/\binline-block\b.*\bmax-w-full\b|\bmax-w-full\b.*\binline-block\b/)
    expect(container.textContent).toBe('jean.dupont@carrefour.com')
  })
})
