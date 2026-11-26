import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BusinessFamilyField } from './BusinessFamilyField'

// #2163.14-24 — `business_families` était déclaré et testé côté contrat
// (`isScopeSelectionEmpty`) sans aucun appelant web.
describe('BusinessFamilyField (#2163.14-24)', () => {
  it('affiche les 11 familles métier', () => {
    render(<BusinessFamilyField value={[]} onChange={vi.fn()} />)
    for (const label of [
      'Cyber',
      'Data / IA',
      'Cloud',
      'Agilité',
      'Finance',
      'RH',
      // #4512.2 — « Achats » est déjà un niveau de contact : la famille s'affiche « Fonction achats ».
      'Fonction achats',
      'Industrie',
      'Supply',
      'Produit',
      'Autre',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('un clic ajoute la famille à la sélection', () => {
    const onChange = vi.fn()
    render(<BusinessFamilyField value={[]} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cyber' }))
    expect(onChange).toHaveBeenCalledWith(['Cyber'])
  })

  it('un clic sur une famille déjà choisie la retire', () => {
    const onChange = vi.fn()
    render(<BusinessFamilyField value={['Cyber', 'Cloud']} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cyber' }))
    expect(onChange).toHaveBeenCalledWith(['Cloud'])
  })

  it('#4512.2 — « Fonction achats » à l’écran, « Achats » dans la valeur envoyée (requête inchangée)', () => {
    const onChange = vi.fn()
    render(<BusinessFamilyField value={[]} onChange={onChange} />)
    expect(screen.queryByRole('button', { name: 'Achats' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fonction achats' }))
    expect(onChange).toHaveBeenCalledWith(['Achats'])
  })

  it('plusieurs familles restent sélectionnées sans ordre imposé', () => {
    render(<BusinessFamilyField value={['Cyber', 'Data / IA']} onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Cyber' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Data / IA' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Cloud' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('cadrage analyse (15/10) — chaque libellé affiché trie vraiment', () => {
  it('le libellé FR et le libellé EN de chaque famille sont reconnus par la table de termes du contrat', async () => {
    const { businessFamilyTerms } = await import('@bellum/contracts')
    const fr = (await import('@/i18n/locales/fr/search.json')).default.confirm.businessFamily.families
    const en = (await import('@/i18n/locales/en/search.json')).default.confirm.businessFamily.families
    for (const [key, label] of [...Object.entries(fr), ...Object.entries(en)]) {
      const terms = businessFamilyTerms([label])
      // « Autre » ne trie rien, à dessein ; toute autre famille rend SES termes, jamais son libellé brut.
      if (key === 'other') expect(terms).toEqual([])
      else expect(terms.length).toBeGreaterThan(1)
    }
  })
})
