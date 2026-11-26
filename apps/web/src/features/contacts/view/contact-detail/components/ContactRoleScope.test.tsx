import type { Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ContactRoleScope } from './ContactRoleScope'

function contactWith(extra: Partial<Contact>): Contact {
  return { id: 'c1', account_id: 'a1', full_name: 'Amina Benali', ...extra } as Contact
}

describe('ContactRoleScope', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('translates an Apollo seniority level like the Apollo profile card does', () => {
    render(<ContactRoleScope contact={contactWith({ seniority: 'c_suite' })} />)
    expect(screen.getByText('Direction générale')).toBeInTheDocument()
  })

  it('leaves a seniority the dictionary does not know exactly as stored', () => {
    render(<ContactRoleScope contact={contactWith({ seniority: 'Comité exécutif groupe' })} />)
    expect(screen.getByText('Comité exécutif groupe')).toBeInTheDocument()
  })

  it('renders scope and budget authority untouched (free text)', () => {
    render(<ContactRoleScope contact={contactWith({ scope: 'France & Benelux', budget_authority: 'Prescripteur' })} />)
    expect(screen.getByText('France & Benelux')).toBeInTheDocument()
    expect(screen.getByText('Prescripteur')).toBeInTheDocument()
  })

  it('translates in EN too (i18n parity)', async () => {
    await i18n.changeLanguage('en')
    render(<ContactRoleScope contact={contactWith({ seniority: 'c_suite' })} />)
    expect(screen.getByText('C-suite')).toBeInTheDocument()
    await i18n.changeLanguage('fr')
  })

  // #4016 L2 / #4036.D14 (Louis 15/10) — profil enrichi avec l'existant ; le manque est nommé.
  it('déduit la séniorité du titre, et le dit', () => {
    render(<ContactRoleScope contact={contactWith({ title: 'Directeur des systèmes d’information' })} />)
    expect(screen.getByText(/déduit du titre/)).toBeInTheDocument()
  })

  it('nomme « Non disponible » pour la séniorité et le secteur quand rien ne les établit', () => {
    render(<ContactRoleScope contact={contactWith({ title: null })} />)
    expect(screen.getAllByText('Non disponible')).toHaveLength(2)
  })

  it('lit le secteur du compte, étiqueté comme tel', () => {
    render(<ContactRoleScope contact={contactWith({})} accountSector="Banque" />)
    expect(screen.getByText('Banque (secteur du compte)')).toBeInTheDocument()
  })
})
