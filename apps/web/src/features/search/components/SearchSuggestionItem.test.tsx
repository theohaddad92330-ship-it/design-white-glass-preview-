import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { CompanySuggestion } from '@bellum/contracts'
import { SearchSuggestionItem } from './SearchSuggestionItem'

function suggestion(overrides: Partial<CompanySuggestion> = {}): CompanySuggestion {
  return {
    name: 'KICKLOX',
    siren: '812345678',
    city: 'Paris',
    sector: 'Programmation informatique',
    ...overrides,
  }
}

describe('SearchSuggestionItem', () => {
  it('shows the facts that let a user tell two namesakes apart', () => {
    render(<SearchSuggestionItem suggestion={suggestion()} onSelect={vi.fn()} />)

    expect(screen.getByText('KICKLOX')).toBeInTheDocument()
    expect(screen.getByText(/Paris/)).toBeInTheDocument()
    expect(screen.getByText(/Programmation informatique/)).toBeInTheDocument()
  })

  it('marks a suggestion whose registry sector contradicts an ESN', () => {
    // Le cas SCI / garage : sans marque visible, la ligne a exactement la même
    // apparence de légitimité qu'un vrai résultat.
    render(
      <SearchSuggestionItem
        suggestion={suggestion({
          name: 'SCI CARREFOUR DU CANNET',
          sector: 'Activités immobilières',
          is_esn_naf: false,
        })}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText('Ne semble pas être une ESN')).toBeInTheDocument()
  })

  it('never marks a suggestion outside the ESN lens', () => {
    // La recherche de comptes prospects n'envoie pas le drapeau : un prospect
    // n'est pas une ESN, l'y signaler n'aurait aucun sens.
    render(<SearchSuggestionItem suggestion={suggestion({ is_esn_naf: undefined })} onSelect={vi.fn()} />)
    expect(screen.queryByText('Ne semble pas être une ESN')).toBeNull()
  })

  it('stays silent when the registry sector is coherent or unknown', () => {
    const { rerender } = render(
      <SearchSuggestionItem suggestion={suggestion({ is_esn_naf: true })} onSelect={vi.fn()} />,
    )
    expect(screen.queryByText('Ne semble pas être une ESN')).toBeNull()

    rerender(<SearchSuggestionItem suggestion={suggestion({ is_esn_naf: null })} onSelect={vi.fn()} />)
    expect(screen.queryByText('Ne semble pas être une ESN')).toBeNull()
  })

  it('remains selectable even when flagged — we rank, we never remove', () => {
    // Une ESN peut porter un NAF atypique : supprimer un résultat correct est
    // pire que de le classer bas et de le marquer.
    const onSelect = vi.fn()
    const flagged = suggestion({ is_esn_naf: false })
    render(<SearchSuggestionItem suggestion={flagged} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: 'KICKLOX' }))

    expect(onSelect).toHaveBeenCalledWith(flagged)
  })

  /* ── #2150.42 (épopée #2781) — « Ajouter au portefeuille » depuis la
     recherche ───────────────────────────────────────────────────────────── */

  describe('onAddToPortfolio — porte #2150.42', () => {
    it('reste absent quand l’appelant ne fournit pas onAddToPortfolio (onboarding, partenaire…)', () => {
      render(<SearchSuggestionItem suggestion={suggestion()} onSelect={vi.fn()} />)
      expect(screen.queryByRole('button', { name: /portefeuille/i })).toBeNull()
    })

    it('appelle onAddToPortfolio avec la suggestion, sans déclencher onSelect', () => {
      const onSelect = vi.fn()
      const onAddToPortfolio = vi.fn()
      const target = suggestion()
      render(<SearchSuggestionItem suggestion={target} onSelect={onSelect} onAddToPortfolio={onAddToPortfolio} />)

      fireEvent.click(screen.getByRole('button', { name: /ajouter kicklox au portefeuille/i }))

      expect(onAddToPortfolio).toHaveBeenCalledWith(target)
      expect(onSelect).not.toHaveBeenCalled()
    })

    it('la ligne reste sélectionnable pour lancer une analyse même quand le bouton est présent', () => {
      const onSelect = vi.fn()
      const target = suggestion()
      render(<SearchSuggestionItem suggestion={target} onSelect={onSelect} onAddToPortfolio={vi.fn()} />)

      fireEvent.click(screen.getByRole('button', { name: 'KICKLOX' }))

      expect(onSelect).toHaveBeenCalledWith(target)
    })

    it('affiche l’état de chargement pendant l’ajout', () => {
      render(
        <SearchSuggestionItem
          suggestion={suggestion()}
          onSelect={vi.fn()}
          onAddToPortfolio={vi.fn()}
          isAddingToPortfolio
        />,
      )
      expect(screen.getByRole('button', { name: /ajouter kicklox au portefeuille/i })).toBeDisabled()
    })
  })

  /* ── #2162.9 — raison sociale, quand elle dit plus que le nom affiché ───── */

  describe('legal_name — raison sociale distincte du nom affiché', () => {
    it('affiche la raison sociale sous le nom quand elle diffère', () => {
      render(
        <SearchSuggestionItem
          suggestion={suggestion({ name: 'Kicklox', legal_name: 'LINNAEUS' })}
          onSelect={vi.fn()}
        />,
      )

      expect(screen.getByText('LINNAEUS')).toBeInTheDocument()
    })

    it('reste silencieuse quand la raison sociale est absente', () => {
      render(<SearchSuggestionItem suggestion={suggestion({ legal_name: null })} onSelect={vi.fn()} />)
      expect(screen.queryByTestId('suggestion-legal-name')).toBeNull()
    })

    it('ne répète pas le nom : une raison sociale identique ne s’affiche pas deux fois', () => {
      // Loi 4 : un fait redondant n'aide à rien distinguer. Le back-end garantit
      // déjà `legal_name = None` dans ce cas, mais l'écran ne doit PAS se fier
      // uniquement à ça — deux lignes identiques resteraient un défaut visible
      // si jamais le serveur envoyait la même valeur deux fois.
      render(
        <SearchSuggestionItem
          suggestion={suggestion({ name: 'Capgemini', legal_name: 'Capgemini' })}
          onSelect={vi.fn()}
        />,
      )
      expect(screen.queryByTestId('suggestion-legal-name')).toBeNull()
    })
  })

  /* ── #1586 — `marketPaths`, l'exception nommée de la désambiguïsation ───── */

  describe('marketPaths — départager deux homonymes', () => {
    it('affiche le nombre de parcours observés — en 3ᵉ position, avant le SIREN', () => {
      render(
        <SearchSuggestionItem
          suggestion={suggestion({ headcount_label: '500 à 999 salariés', size_class: 'ETI', marketPaths: 41 })}
          onSelect={vi.fn()}
        />,
      )

      const facts = screen.getByTestId('suggestion-facts').textContent ?? ''
      expect(facts).toContain('41 parcours observés')
      // 3ᵉ position : après effectif et catégorie, AVANT le SIREN.
      const order = [
        facts.indexOf('500 à 999 salariés'),
        facts.indexOf('41 parcours observés'),
        facts.indexOf('812345678'),
      ]
      expect(order).toEqual([...order].sort((a, b) => a - b))
    })

    // La contrainte non négociable de #1586 : « 0 » s'affiche VRAIMENT ici.
    it('affiche « aucun parcours observé » quand la mémoire est couverte mais à 0 — jamais silencieux', () => {
      render(<SearchSuggestionItem suggestion={suggestion({ marketPaths: 0 })} onSelect={vi.fn()} />)

      const facts = screen.getByTestId('suggestion-facts').textContent ?? ''
      expect(facts).toContain('Aucun parcours observé')
    })

    it('distingue deux homonymes par leurs parcours — « 41 » contre « aucun »', () => {
      const { unmount } = render(
        <SearchSuggestionItem suggestion={suggestion({ name: 'ROCHE', marketPaths: 41 })} onSelect={vi.fn()} />,
      )
      const laboratoire = screen.getByTestId('suggestion-facts').textContent ?? ''
      unmount()

      render(<SearchSuggestionItem suggestion={suggestion({ name: 'ROCHE', marketPaths: 0 })} onSelect={vi.fn()} />)
      const sci = screen.getByTestId('suggestion-facts').textContent ?? ''

      expect(laboratoire).not.toEqual(sci)
    })

    it('reste silencieux — jamais « 0 » ni un texte fantôme — quand la mémoire n’a rapproché aucune entreprise', () => {
      const { rerender } = render(
        <SearchSuggestionItem suggestion={suggestion({ marketPaths: null })} onSelect={vi.fn()} />,
      )
      expect(screen.getByTestId('suggestion-facts').textContent ?? '').not.toMatch(/parcours/)

      rerender(<SearchSuggestionItem suggestion={suggestion({ marketPaths: undefined })} onSelect={vi.fn()} />)
      expect(screen.getByTestId('suggestion-facts').textContent ?? '').not.toMatch(/parcours/)
    })
  })

  /* ── #2162.14 — statut administratif (actif / cessé) ─────────────────── */

  describe('is_active — statut administratif', () => {
    it('marque une entité cessée', () => {
      render(<SearchSuggestionItem suggestion={suggestion({ is_active: false })} onSelect={vi.fn()} />)
      expect(screen.getByText('Entreprise cessée')).toBeInTheDocument()
    })

    it('reste silencieuse quand l’entité est active', () => {
      render(<SearchSuggestionItem suggestion={suggestion({ is_active: true })} onSelect={vi.fn()} />)
      expect(screen.queryByText('Entreprise cessée')).toBeNull()
    })

    it('reste silencieuse quand le statut est inconnu (jamais deviné)', () => {
      const { rerender } = render(
        <SearchSuggestionItem suggestion={suggestion({ is_active: null })} onSelect={vi.fn()} />,
      )
      expect(screen.queryByText('Entreprise cessée')).toBeNull()

      rerender(<SearchSuggestionItem suggestion={suggestion({ is_active: undefined })} onSelect={vi.fn()} />)
      expect(screen.queryByText('Entreprise cessée')).toBeNull()
    })
  })

  /* ── #2265.14 — badge « intermédiaire », jamais gated sur `lens=esn` ──── */

  describe('is_intermediary — cabinet de recrutement ou plateforme', () => {
    it('marque une suggestion classée intermédiaire', () => {
      render(<SearchSuggestionItem suggestion={suggestion({ is_intermediary: true })} onSelect={vi.fn()} />)
      expect(screen.getByText('Intermédiaire, pas client final')).toBeInTheDocument()
    })

    it('reste silencieuse quand rien ne classe la suggestion intermédiaire', () => {
      const { rerender } = render(
        <SearchSuggestionItem suggestion={suggestion({ is_intermediary: false })} onSelect={vi.fn()} />,
      )
      expect(screen.queryByText('Intermédiaire, pas client final')).toBeNull()

      rerender(<SearchSuggestionItem suggestion={suggestion({ is_intermediary: undefined })} onSelect={vi.fn()} />)
      expect(screen.queryByText('Intermédiaire, pas client final')).toBeNull()
    })
  })

  /* ── #2162.10 — le pays ciblé par la recherche, sur chaque résultat ──── */

  describe('country — le marché ciblé par la recherche', () => {
    it('affiche le pays ciblé sur la ligne', () => {
      render(<SearchSuggestionItem suggestion={suggestion()} country="FR" onSelect={vi.fn()} />)
      expect(screen.getByText(/France/)).toBeInTheDocument()
    })

    it('reste silencieuse quand aucun pays n’est fourni', () => {
      render(<SearchSuggestionItem suggestion={suggestion()} onSelect={vi.fn()} />)
      expect(screen.queryByText(/France/)).toBeNull()
    })
  })
})
