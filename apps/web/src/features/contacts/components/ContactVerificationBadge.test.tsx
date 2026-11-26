import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { contactSourceLabel } from '@/features/contacts/lib/contactProvenance'
import { ContactVerificationBadge } from './ContactVerificationBadge'

/**
 * #2632.2 — LE BADGE DATE + SOURCE + VÉRIFICATION, extrait de `ContactTableRow`
 * (/contacts) pour ne pas se recopier dans `CompactContactRow` (le dossier
 * d'un compte). Un seul rendu, deux appelants (GA-26).
 */
function contact(
  overrides: Partial<{ created_at: string | null; updated_at: string | null; source: string | null }> = {},
) {
  return {
    created_at: '2026-07-01T10:00:00.000Z',
    updated_at: '2026-07-10T10:00:00.000Z',
    source: 'apollo',
    ...overrides,
  }
}

beforeEach(async () => {
  await i18n.changeLanguage('fr')
})

describe('ContactVerificationBadge', () => {
  it('affiche la date de mise à jour, avec la date de collecte en tooltip', () => {
    render(<ContactVerificationBadge contact={contact()} />)
    expect(screen.getByText('10/07/2026')).toHaveAttribute('title', 'Collecté le 01/07/2026 · mis à jour le 10/07/2026')
  })

  it('retombe sur la date de collecte quand la mise à jour est absente', () => {
    render(<ContactVerificationBadge contact={contact({ updated_at: null })} />)
    expect(screen.getByText('01/07/2026')).toBeInTheDocument()
  })

  it('nomme la CATÉGORIE de la source, pas seulement son nom', () => {
    render(<ContactVerificationBadge contact={contact({ source: 'apollo' })} />)
    expect(screen.getByText(/lu dans un outil connecté/)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(contactSourceLabel('apollo')))).toBeInTheDocument()
  })

  it('ne devine aucune catégorie pour une source non classée', () => {
    render(<ContactVerificationBadge contact={contact({ source: 'demo' })} />)
    expect(screen.getByText(contactSourceLabel('demo'))).toBeInTheDocument()
    expect(screen.queryByText(/source publique/)).not.toBeInTheDocument()
  })

  it('une date absente se NOMME, jamais inventée', () => {
    render(<ContactVerificationBadge contact={contact({ created_at: null, updated_at: null })} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  // Recette 13/10/2026 — « 12/10/2026 » sous chaque nom, sans dire ce que c'est : jamais une date nue hors tableau.
  it('labelled : la date dit ce qu’elle est (« Mis à jour le », « Ajouté le »)', () => {
    const { rerender } = render(<ContactVerificationBadge labelled contact={contact()} />)
    expect(screen.getByText('Mis à jour le 10/07/2026')).toBeInTheDocument()
    rerender(<ContactVerificationBadge labelled contact={contact({ updated_at: null })} />)
    expect(screen.getByText('Ajouté le 01/07/2026')).toBeInTheDocument()
  })

  it('labelled : une date absente ne fait aucune ligne (ni « — » ni date inventée)', () => {
    render(<ContactVerificationBadge labelled contact={contact({ created_at: null, updated_at: null })} />)
    expect(screen.queryByText('—')).not.toBeInTheDocument()
  })

  it('suit la langue (EN)', async () => {
    await i18n.changeLanguage('en')
    render(<ContactVerificationBadge contact={contact()} />)
    expect(screen.getByText(/read from a connected tool/)).toBeInTheDocument()
    await i18n.changeLanguage('fr')
  })

  it('sait dire NON : une source non classée ne reçoit pas la catégorie « outil connecté »', () => {
    render(<ContactVerificationBadge contact={contact({ source: 'demo' })} />)
    expect(screen.queryByText(/lu dans un outil connecté/)).not.toBeInTheDocument()
  })

  // #3713 — recette prod 08/10 : « 08 oct. 20… » et « lu dans un o… » — la date
  // ET la provenance se lisaient tronquées dans la colonne « Suivi », la plus
  // étroite du tableau (`contactsTableColumns.ts`, rank 5). Une date doctrine
  // « dates lisibles entières » : jamais une ellipse CSS sur une date.
  it('#3713 — la date ne porte jamais de classe qui la couperait (text-ellipsis)', () => {
    render(<ContactVerificationBadge contact={contact()} />)
    const date = screen.getByText('10/07/2026')
    expect(date.className).not.toMatch(/text-ellipsis/)
  })

  // #3713.1 — recette prod 08/10 (U 22edd95fe1) : l'ellipse retirée (tour
  // précédent), la date passait sur DEUX lignes (span 79×40 dans la cellule
  // 193 px) faute de `whitespace-nowrap` — un format court qui wrap quand même
  // hausse la rangée tout autant qu'un format long tronqué la rognait.
  it('#3713.1 — la date ne passe jamais à la ligne (whitespace-nowrap, sans ellipse)', () => {
    render(<ContactVerificationBadge contact={contact()} />)
    const date = screen.getByText('10/07/2026')
    expect(date.className).toMatch(/\bwhitespace-nowrap\b/)
    expect(date.className).not.toMatch(/overflow-hidden/)
  })

  it('#3713 — la provenance (source + date) ne porte jamais de classe qui la couperait (truncate)', () => {
    render(<ContactVerificationBadge contact={contact()} />)
    const provenanceParagraph = screen.getByText(/lu dans un outil connecté/)
    const wrapper = provenanceParagraph.closest('div')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.className ?? '').not.toMatch(/truncate/)
  })

  // #3713.2 — recette prod 09/10 : « colonne Suivi sur 4 lignes (lignes de 100 px) »
  // — sans borne, « lu dans un outil connecté · Enrichissement » passait sur 2-3
  // lignes dans la colonne la plus étroite (193 px), et la rangée entière montait
  // avec. `line-clamp-1` borne la hauteur (GA-385 — un texte libre dans une ligne
  // dense porte une borne de lignes) ; le texte complet reste au survol (`title`).
  it('#3713.2 — la provenance est bornée à une ligne, avec le texte complet au survol', () => {
    render(<ContactVerificationBadge contact={contact()} />)
    const provenanceParagraph = screen.getByText(/lu dans un outil connecté/)
    expect(provenanceParagraph.className).toMatch(/\bline-clamp-1\b/)
    const wrapper = provenanceParagraph.closest('div')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.getAttribute('title')).toBe(`lu dans un outil connecté · ${contactSourceLabel('apollo')}`)
  })
})
