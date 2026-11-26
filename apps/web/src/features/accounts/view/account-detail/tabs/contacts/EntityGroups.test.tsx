import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { EntityGroups, GROUP_PAGE_SIZE } from './EntityGroups'

// La ligne a ses propres tests (actions, menus, réseau) : ici on compte les lignes.
vi.mock('./CompactContactRow', () => ({
  CompactContactRow: ({ contact }: { contact: Contact }) => <div data-testid="contact-row">{contact.full_name}</div>,
}))

function contacts(count: number): Contact[] {
  return Array.from({ length: count }, (_, i) => ({ id: `c${i}`, full_name: `Personne ${i}` }) as Contact)
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('EntityGroups — #4324.1 le total ne compte pas les contacts archivés', () => {
  it('« N contacts au total » = les contacts retenus ; les écartés sont nommés à part', () => {
    const rows = [...contacts(3), { id: 'x1', full_name: 'Homonyme', excluded_at: '2026-10-22T07:00:00Z' } as Contact]
    render(
      <EntityGroups
        groups={[{ entity: 'ACME', contacts: rows }]}
        groupMode="entity"
        expandedEntities={new Set(['ACME'])}
        onToggleEntity={() => undefined}
      />,
    )
    expect(screen.getByText(/3 contacts au total/)).toBeInTheDocument()
    expect(screen.getByText(/1 écarté/)).toBeInTheDocument()
  })
})

describe('EntityGroups — #2120.14 pagination de « tous les contacts »', () => {
  it('un groupe ouvert montre cinquante lignes, dit ce qui reste, et en ajoute cinquante au clic', () => {
    render(
      <EntityGroups
        groups={[{ entity: 'ACME', contacts: contacts(120) }]}
        groupMode="entity"
        expandedEntities={new Set(['ACME'])}
        onToggleEntity={() => undefined}
      />,
    )
    expect(screen.getAllByTestId('contact-row')).toHaveLength(GROUP_PAGE_SIZE)
    /**
     * R15-9 (recette du 15/09/2026, prod `5ca597d5a`) — LE COMPTE QUI SE LIT
     * DIT CE QU'IL MONTRE.
     *
     * Mesuré à l'écran, dossier THALES : l'en-tête d'un groupe annonçait
     * « Entité non renseignée — 1961 contacts » et le groupe ouvert en rendait
     * une fraction. Le nombre que l'œil rencontre est celui de l'EN-TÊTE : il
     * était vrai comme total et faux comme promesse d'affichage, et le
     * « N affichés sur M » vivait tout en bas, après cinquante lignes.
     *
     * Il remonte donc DANS l'en-tête, là où le nombre se lit — et il n'y est
     * pas écrit deux fois (loi 4 du tome 7) : le bas ne garde que le geste.
     */
    const header = screen.getByRole('button', { name: /ACME/ })
    expect(header).toHaveTextContent('50 affichés sur 120')

    fireEvent.click(screen.getByRole('button', { name: 'Afficher 50 de plus' }))
    expect(screen.getAllByTestId('contact-row')).toHaveLength(100)

    fireEvent.click(screen.getByRole('button', { name: 'Afficher 20 de plus' }))
    expect(screen.getAllByTestId('contact-row')).toHaveLength(120)
    // Plus rien n'est retenu : l'en-tête redit le compte tout court.
    expect(screen.queryByText(/affichés sur/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ACME/ })).toHaveTextContent('120 contacts')
  })

  it('un groupe REPLIÉ annonce son total, jamais un nombre d’affichage', () => {
    render(
      <EntityGroups
        groups={[{ entity: 'ACME', contacts: contacts(120) }]}
        groupMode="entity"
        expandedEntities={new Set()}
        onToggleEntity={() => undefined}
      />,
    )
    expect(screen.queryByTestId('contact-row')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ACME/ })).toHaveTextContent('120 contacts')
    expect(screen.queryByText(/affichés sur/)).not.toBeInTheDocument()
  })

  it('un petit groupe ne porte aucun bouton de pagination', () => {
    render(
      <EntityGroups
        groups={[{ entity: 'ACME', contacts: contacts(3) }]}
        groupMode="entity"
        expandedEntities={new Set(['ACME'])}
        onToggleEntity={() => undefined}
      />,
    )
    expect(screen.getAllByTestId('contact-row')).toHaveLength(3)
    expect(screen.queryByRole('button', { name: /Afficher/ })).not.toBeInTheDocument()
  })
})
