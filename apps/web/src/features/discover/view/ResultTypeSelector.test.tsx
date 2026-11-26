import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { ResultTypeSelector } = await import('./ResultTypeSelector')

/**
 * #2165.7 à #2165.10 / #2165.61 — LE TYPE DE RÉSULTAT, au-dessus de la liste.
 *
 * Trois choses se jouent ici, et la troisième est la plus facile à perdre :
 * les quatre types sont NOMMÉS, le type actif est LISIBLE (#2165.61), et la
 * sélection est EXCLUSIVE (#2165.10) — un groupe de boutons `aria-pressed`
 * laisserait croire le contraire à un lecteur d'écran, qui les annoncerait
 * comme quatre bascules indépendantes.
 */

describe('ResultTypeSelector', () => {
  it('rend les cinq onglets dans l’ordre du brief, « Comptes » une seule fois, et un seul est coché', () => {
    // Lot U — « Partenaires » est fusionné dans « Autres acteurs ».
    render(<ResultTypeSelector value="needs" onChange={vi.fn()} />)
    expect(screen.getAllByRole('radio').map(option => option.textContent?.trim())).toEqual([
      'Comptes',
      'Autres acteurs',
      'Contacts',
      'Besoins et signaux',
      "Liste d'appels",
    ])
    expect(screen.queryByRole('radio', { name: /Partenaires/ })).toBeNull()
    expect(screen.queryByTestId('result-type-hint')).toBeNull()
    expect(screen.getByRole('radiogroup')).toBeInTheDocument()
    const options = screen.getAllByRole('radio')
    expect(options).toHaveLength(5)
    expect(options.filter(option => option.getAttribute('aria-checked') === 'true')).toHaveLength(1)
    expect(options[3]).toHaveAttribute('aria-checked', 'true')
  })

  it('#2165.10 — changer de type REMPLACE le précédent, il ne s’y ajoute pas', async () => {
    const onChange = vi.fn()
    render(<ResultTypeSelector value="accounts" onChange={onChange} />)
    await userEvent.click(screen.getAllByRole('radio')[3] as HTMLElement)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('needs')
  })

  it('ne renvoie rien quand on reclique le type DÉJÀ actif — pas de recherche pour rien', async () => {
    const onChange = vi.fn()
    render(<ResultTypeSelector value="accounts" onChange={onChange} />)
    await userEvent.click(screen.getAllByRole('radio')[0] as HTMLElement)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('chaque option porte son libellé, jamais une icône muette (GA-32)', () => {
    render(<ResultTypeSelector value="accounts" onChange={vi.fn()} />)
    for (const option of screen.getAllByRole('radio')) {
      expect(option.textContent?.trim().length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('ResultTypeSelector — une seule barre (lot U)', () => {
  // Théo A decouvrir.R4 — onglets AVEC comptage : un nombre mesuré se dit, une absence ne fait jamais « 0 ».
  it('affiche le comptage des types dont le nombre est connu et positif', () => {
    render(<ResultTypeSelector value="accounts" onChange={vi.fn()} counts={{ accounts: 31, contacts: 66, needs: 0 }} />)
    expect(screen.getByRole('radio', { name: /Comptes\s*31/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Contacts\s*66/ })).toBeInTheDocument()
  })

  it('« Autres acteurs » : son compteur n’apparaît qu’une fois mesuré, jamais « 0 »', () => {
    const { rerender } = render(<ResultTypeSelector value="accounts" onChange={vi.fn()} />)
    expect(screen.getByRole('radio', { name: 'Autres acteurs' })).toBeInTheDocument()
    rerender(<ResultTypeSelector value="others" onChange={vi.fn()} othersCount={0} />)
    expect(screen.getByRole('radio', { name: 'Autres acteurs' })).toHaveAttribute('aria-checked', 'true')
    rerender(<ResultTypeSelector value="others" onChange={vi.fn()} othersCount={33} />)
    expect(screen.getByRole('radio', { name: /Autres acteurs\s*33/ })).toBeInTheDocument()
  })

  it('SAIT DIRE NON : type sans comptage ou à zéro → aucun chiffre, jamais « 0 »', () => {
    render(<ResultTypeSelector value="accounts" onChange={vi.fn()} counts={{ accounts: 31, needs: 0 }} />)
    for (const radio of screen.getAllByRole('radio').slice(1)) expect(radio.textContent).not.toMatch(/\d/)
  })

  // #5001 — « 23 contacts sur 11 comptes » : l'onglet dit ce qu'il compte ; sans nombre de comptes, il ne l'invente pas.
  it('#5001 — l’onglet Contacts dit « N contacts sur M comptes »', () => {
    render(<ResultTypeSelector value="accounts" onChange={vi.fn()} counts={{ contacts: 23 }} contactAccounts={11} />)
    expect(screen.getByTestId('result-type-count-contacts')).toHaveTextContent('23 contacts sur 11 comptes')
  })

  it('#5001 — nombre de comptes inconnu ou nul : le seul nombre de contacts, jamais « 0 compte »', () => {
    render(<ResultTypeSelector value="accounts" onChange={vi.fn()} counts={{ contacts: 23 }} contactAccounts={0} />)
    expect(screen.getByTestId('result-type-count-contacts')).toHaveTextContent(/^23$/)
  })
})
