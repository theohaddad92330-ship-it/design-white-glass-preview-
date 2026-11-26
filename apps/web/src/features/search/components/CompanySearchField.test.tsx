import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CompanySuggestion } from '@bellum/contracts'
import { CompanySearchField } from './CompanySearchField'

function suggestion(overrides: Partial<CompanySuggestion> = {}): CompanySuggestion {
  return {
    name: 'KICKLOX',
    siren: '812345678',
    city: 'Paris',
    sector: 'Programmation informatique',
    ...overrides,
  }
}

function renderField(overrides: Partial<React.ComponentProps<typeof CompanySearchField>> = {}) {
  return render(
    <CompanySearchField
      onQueryChange={vi.fn()}
      onSelectSuggestion={vi.fn()}
      onShowDropdown={vi.fn()}
      onSubmit={vi.fn()}
      query="kick"
      showDropdown
      suggestions={[suggestion()]}
      suggestionsLoading={false}
      country="FR"
      onCountryChange={vi.fn()}
      {...overrides}
    />,
  )
}

describe('CompanySearchField', () => {
  /* ── #2162.10 — le pays sélectionné atteint chaque ligne de résultat ──── */
  it('affiche le pays ciblé sur chaque résultat (#2162.10)', () => {
    renderField()
    expect(screen.getByText(/France/)).toBeInTheDocument()
  })

  it('affiche le pays du marché sélectionné, pas un autre', () => {
    renderField({ country: 'CH' })
    expect(screen.getByText(/Suisse/)).toBeInTheDocument()
  })

  /* ── #2150.42 (épopée #2781) — porte le bouton jusqu'à la ligne ───────── */
  describe('onAddToPortfolio — traverse jusqu’à la ligne', () => {
    it('ne rend aucun bouton portefeuille quand l’appelant ne le fournit pas', () => {
      renderField()
      expect(screen.queryByRole('button', { name: /portefeuille/i })).toBeNull()
    })

    it('rend le bouton portefeuille sur chaque ligne quand l’appelant le fournit', () => {
      const onAddToPortfolio = vi.fn()
      renderField({ onAddToPortfolio })

      const button = screen.getByRole('button', { name: /ajouter kicklox au portefeuille/i })
      button.click()

      expect(onAddToPortfolio).toHaveBeenCalledWith(suggestion())
    })
  })

  /* ── #2149.17 — CIBLE ADMISSIBLE : un fichier déposé, jamais un contenu deviné ── */
  describe('cible fichier (#2149.17)', () => {
    it('extrait un nom cherchable du FICHIER déposé — jamais son extension, jamais son contenu', () => {
      const onQueryChange = vi.fn()
      const onShowDropdown = vi.fn()
      renderField({ onQueryChange, onShowDropdown, query: '' })

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      const file = new File(['contenu ignoré'], 'Cahier des charges - Renault.pdf', { type: 'application/pdf' })
      fireEvent.change(input, { target: { files: [file] } })

      expect(onQueryChange).toHaveBeenCalledWith('Cahier des charges Renault')
      expect(onShowDropdown).toHaveBeenCalledWith(true)
    })

    it('ne fait rien sans fichier sélectionné', () => {
      const onQueryChange = vi.fn()
      renderField({ onQueryChange })

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      fireEvent.change(input, { target: { files: [] } })

      expect(onQueryChange).not.toHaveBeenCalled()
    })

    it('#3623 — avec onAttachFiles, le trombone remonte les fichiers (multiples) et ne touche plus la requête', () => {
      const onQueryChange = vi.fn()
      const onAttachFiles = vi.fn()
      renderField({ onQueryChange, onAttachFiles, query: '' })

      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      expect(input.multiple).toBe(true)
      expect(input.accept).toContain('.zip')
      const files = [new File(['a'], 'a.csv'), new File(['b'], 'b.zip')]
      fireEvent.change(input, { target: { files } })

      expect(onAttachFiles).toHaveBeenCalledWith(files)
      expect(onQueryChange).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /joindre des documents/i })).toBeInTheDocument()
    })

    it('porte un bouton NOMMÉ pour l’ouvrir — accessible au clavier et au lecteur d’écran', () => {
      renderField()
      expect(screen.getByRole('button', { name: /fichier/i })).toBeInTheDocument()
    })
  })
})
