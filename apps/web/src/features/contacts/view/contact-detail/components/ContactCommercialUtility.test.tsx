import type { AccountStrategy5P, Contact } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ContactCommercialUtility } from './ContactCommercialUtility'

function contactWith(extra: Partial<Contact>): Contact {
  return { id: 'c1', account_id: 'a1', full_name: 'Amina Benali', decision_role: null, ...extra } as Contact
}

function strategyWithMissingRoles(roles: string[] | null, status: 'missing' | 'not_applicable' = 'missing') {
  return { people: { missing_roles: { value: roles, status } } } as unknown as AccountStrategy5P
}

/**
 * #3401 (retour bêta #3401, « pour chaque contact recommandé, expliquer son
 * utilité commerciale réelle ») — la carte qui réunit le rôle EXPLIQUÉ,
 * pourquoi le contacter maintenant, ce qu'il peut confirmer/faire avancer/
 * probablement pas décider, et ses sources.
 */
describe('ContactCommercialUtility', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('sans rôle : dit "rôle non établi", ne devine aucune capacité', () => {
    render(<ContactCommercialUtility contact={contactWith({})} />)
    expect(
      screen.getByText("Rôle non établi — l'utilité commerciale ne peut pas encore être déduite."),
    ).toBeInTheDocument()
    expect(screen.queryByText('Peut confirmer le terrain')).not.toBeInTheDocument()
  })

  it('un rôle "technical" : label, description réemployée de roleDescriptions, capacités MEDDIC', () => {
    render(<ContactCommercialUtility contact={contactWith({ decision_role: 'technical' })} />)
    expect(screen.getByText('Référent technique')).toBeInTheDocument()
    expect(screen.getByText('Valide la faisabilité, la sécurité et l’intégration.')).toBeInTheDocument()
    expect(screen.getByText('Peut confirmer le terrain')).toBeInTheDocument()
    expect(screen.getByText('Ne fait probablement pas avancer le sujet en interne')).toBeInTheDocument()
    expect(
      screen.getByText('Ne décide probablement pas seul — le budget reste à confirmer ailleurs'),
    ).toBeInTheDocument()
  })

  it('un rôle "economic" : seul rôle qui décide probablement seul', () => {
    render(<ContactCommercialUtility contact={contactWith({ decision_role: 'economic' })} />)
    expect(screen.getByText('Peut probablement décider seul')).toBeInTheDocument()
  })

  it('#3692 — le motif de contact et la question à poser vivent dans le bloc de Laura, pas ici (aucun doublon)', () => {
    render(
      <ContactCommercialUtility
        contact={contactWith({ decision_role: 'economic', why_contact: 'Pilote le budget data pour 2027.' })}
      />,
    )
    expect(screen.queryByText('Pilote le budget data pour 2027.')).not.toBeInTheDocument()
    expect(screen.queryByText('Question à lui poser')).not.toBeInTheDocument()
    expect(screen.queryByText('Pourquoi le contacter maintenant')).not.toBeInTheDocument()
  })

  it('source connue : le libellé CLIENT (jamais le nom du fournisseur brut)', () => {
    render(<ContactCommercialUtility contact={contactWith({ source: 'apollo', created_at: '2026-09-01T00:00:00Z' })} />)
    expect(screen.getByText('Sources')).toBeInTheDocument()
  })

  it('sans source : la section Sources ne pose aucune ligne', () => {
    render(<ContactCommercialUtility contact={contactWith({ source: null })} />)
    expect(screen.queryByText('Sources')).not.toBeInTheDocument()
  })

  // #3401.8 (recette 30/09) — « le prochain interlocuteur à obtenir » : le
  // rôle MEDDIC encore absent du compte, jamais un nom inventé.
  it('#3401.8 — rôle manquant au compte : affiché, jamais un nom deviné', () => {
    render(
      <ContactCommercialUtility
        contact={contactWith({ decision_role: 'technical' })}
        strategy={strategyWithMissingRoles(['economic'])}
      />,
    )
    expect(screen.getByText('Rôle encore à obtenir dans le circuit de décision')).toBeInTheDocument()
    expect(screen.getByText('Décideur économique')).toBeInTheDocument()
  })

  it('#3401.8 — sans stratégie de compte : aucune ligne (jamais un manque inventé)', () => {
    render(<ContactCommercialUtility contact={contactWith({ decision_role: 'technical' })} />)
    expect(screen.queryByText('Rôle encore à obtenir dans le circuit de décision')).not.toBeInTheDocument()
  })

  it('#3401.8 — people.missing_roles "not_applicable" : aucune ligne', () => {
    render(
      <ContactCommercialUtility
        contact={contactWith({ decision_role: 'technical' })}
        strategy={strategyWithMissingRoles(['economic'], 'not_applicable')}
      />,
    )
    expect(screen.queryByText('Rôle encore à obtenir dans le circuit de décision')).not.toBeInTheDocument()
  })

  it('#3401.8 — le rôle manquant est déjà celui de CE contact : aucune ligne (il n’est plus manquant)', () => {
    render(
      <ContactCommercialUtility
        contact={contactWith({ decision_role: 'economic' })}
        strategy={strategyWithMissingRoles(['economic'])}
      />,
    )
    expect(screen.queryByText('Rôle encore à obtenir dans le circuit de décision')).not.toBeInTheDocument()
  })
})
