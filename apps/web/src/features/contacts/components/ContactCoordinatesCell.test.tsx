import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ContactCoordinatesCell, ContactEnrichAction } from './ContactCoordinatesCell'

// Théo A comptes-fiche.N-coordonnées — par champ : connu · disponible · jamais cherché · introuvable.
const base = {
  id: 'c1',
  email: null,
  phone: null,
  email_availability: null,
  phone_availability: null,
  enrichment_coordinates: null,
} as unknown as Contact

describe('ContactCoordinatesCell', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('connu : e-mail et téléphone en clair, jamais masqués', () => {
    render(
      <ContactCoordinatesCell
        contact={{ ...base, email: 'amina@exemple.fr', phone: '+33 6 12 34 56 78' } as unknown as Contact}
        onEnrich={vi.fn()}
      />,
    )
    expect(screen.getByTitle('amina@exemple.fr')).toHaveTextContent(/^amina@exemple\.fr$/)
    expect(screen.getByRole('link', { name: '+33 6 12 34 56 78' })).toHaveAttribute('href', 'tel:+33612345678')
  })

  // Lot 760 (Louis 31/10) — la nature du numéro se lit dans la liste ; inconnue ou sans numéro : aucune étiquette.
  it.each([
    ['professional_declared', 'Professionnel déclaré'],
    ['personal', 'Personnel'],
  ])('nature %s : étiquette « %s » à côté du numéro', (nature, label) => {
    render(
      <ContactCoordinatesCell
        contact={{ ...base, phone: '+33 6 12 34 56 78', phone_nature: nature } as unknown as Contact}
        onEnrich={vi.fn()}
      />,
    )
    expect(screen.getByTestId('phone-nature')).toHaveTextContent(label)
  })

  it('nature inconnue, absente, ou numéro absent : aucune étiquette', () => {
    const { rerender } = render(
      <ContactCoordinatesCell
        contact={{ ...base, phone: '+33 6 12 34 56 78', phone_nature: 'unknown' } as unknown as Contact}
        onEnrich={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('phone-nature')).not.toBeInTheDocument()
    rerender(
      <ContactCoordinatesCell
        contact={{ ...base, phone: '+33 6 12 34 56 78' } as unknown as Contact}
        onEnrich={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('phone-nature')).not.toBeInTheDocument()
    rerender(
      <ContactCoordinatesCell
        contact={{ ...base, phone_nature: 'personal' } as unknown as Contact}
        onEnrich={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('phone-nature')).not.toBeInTheDocument()
  })

  it('absent mais annoncé : « E-mail disponible », le clic enrichit CE champ seulement', () => {
    const onEnrich = vi.fn()
    render(
      <ContactCoordinatesCell
        contact={{ ...base, email_availability: 'available' } as unknown as Contact}
        onEnrich={onEnrich}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /E-mail disponible/ }))
    expect(onEnrich).toHaveBeenCalledWith('email')
  })

  it('absent, jamais cherché : « Chercher l’e-mail » / « Chercher le tél. »', () => {
    const onEnrich = vi.fn()
    render(<ContactCoordinatesCell contact={base} onEnrich={onEnrich} />)
    fireEvent.click(screen.getByRole('button', { name: /Chercher le tél\./ }))
    expect(onEnrich).toHaveBeenCalledWith('phone')
    expect(screen.getByRole('button', { name: /Chercher l’e-mail/ })).toBeInTheDocument()
  })

  it('cherché sans résultat : « Introuvable · <date> », pas un bouton', () => {
    render(
      <ContactCoordinatesCell
        contact={
          {
            ...base,
            enrichment_coordinates: {
              email: { state: 'not_found', sources_queried: 2, at: '2026-10-12T10:00:00.000Z' },
            },
          } as unknown as Contact
        }
        onEnrich={vi.fn()}
      />,
    )
    expect(screen.getByText(/Introuvable · /)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Chercher l’e-mail/ })).not.toBeInTheDocument()
  })

  it('le clic ne remonte pas à la ligne (qui ouvre la fiche)', () => {
    const onRow = vi.fn()
    render(
      <div onClick={onRow}>
        <ContactCoordinatesCell contact={base} onEnrich={vi.fn()} />
      </div>,
    )
    fireEvent.click(screen.getByRole('button', { name: /Chercher l’e-mail/ }))
    expect(onRow).not.toHaveBeenCalled()
  })

  it('cibles ≥ 44 px (min-h-11) sur chaque geste', () => {
    render(<ContactCoordinatesCell contact={base} onEnrich={vi.fn()} />)
    for (const button of screen.getAllByRole('button')) expect(button.className).toContain('min-h-11')
  })
})

describe('ContactEnrichAction — « Contacter » devient « Enrichir »', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('sans e-mail ni téléphone : le bouton « Enrichir » enrichit le contact (les deux champs)', () => {
    const onEnrich = vi.fn()
    render(<ContactEnrichAction contact={base} onEnrich={onEnrich} />)
    fireEvent.click(screen.getByRole('button', { name: 'Enrichir' }))
    expect(onEnrich).toHaveBeenCalledWith(undefined)
  })

  it('avec une coordonnée : rien (le geste reste « Contacter »)', () => {
    const { container } = render(
      <ContactEnrichAction contact={{ ...base, email: 'a@b.fr' } as unknown as Contact} onEnrich={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
