import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ContactCareerDetail } from './ContactCareerDetail'

function contactWith(extra: Partial<Contact>): Contact {
  return { id: 'c1', account_id: 'a1', full_name: 'Amina Benali', ...extra } as Contact
}

const CAREER = {
  employment_history: [
    { organization_name: 'Veolia', title: 'CIO', start_date: '2021-03-01', current: true },
    { organization_name: 'Capgemini', title: 'IT Director', start_date: '2015-06-01', end_date: '2021-02-01' },
  ],
}

describe('ContactCareerDetail — #3716', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('range parcours ET colonnes importées dans UN détail, intitulé d’origine conservé', () => {
    render(
      <ContactCareerDetail
        contact={contactWith({
          apollo_enrichment: CAREER,
          extra: { 'Code interne': 'CRM-4821', 'TJM achat': '650' },
        })}
      />,
    )
    expect(screen.getAllByText('Parcours et informations complémentaires')).toHaveLength(1)
    // Rien n'est perdu : parcours et colonnes sont dans le document…
    expect(screen.getByText('IT Director')).toBeInTheDocument()
    expect(screen.getByText('Code interne')).toBeInTheDocument()
    expect(screen.getByText('CRM-4821')).toBeInTheDocument()
    // …mais rien n'est ouvert par défaut : la lecture principale ne les porte pas.
    expect(document.querySelector('details')).not.toHaveAttribute('open')
    expect(document.querySelector('details > summary')).not.toBeNull()
  })

  it('sans parcours ni colonne importée (ou colonnes vides) : aucune ligne', () => {
    const { container } = render(
      <ContactCareerDetail contact={contactWith({ apollo_enrichment: null, extra: { Vide: '  ' } })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('colonnes importées seules : le détail existe, sans carte de parcours', () => {
    render(<ContactCareerDetail contact={contactWith({ extra: { 'Code interne': 'CRM-1' } })} />)
    expect(screen.getByText('colonnes importées')).toBeInTheDocument()
    expect(screen.queryByText('Parcours', { selector: 'h3' })).not.toBeInTheDocument()
  })
})
