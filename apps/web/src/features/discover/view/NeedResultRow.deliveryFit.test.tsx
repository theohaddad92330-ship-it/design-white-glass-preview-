import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DiscoverNeedRow } from '@/features/discover/lib/discover-result-rows'
import { NeedResultRow } from './NeedResultRow'

/**
 * #3237 — recette prod 02/10 : « démo /discover?type=needs, carte Aubrac
 * Aerostructures : 0 occurrence incompatible/delivery/axes, clic sans effet ».
 * La lecture « Besoins » reprojetait le signal SANS son delivery fit : le niveau
 * et les treize axes n'y arrivaient jamais.
 */
const ROW: DiscoverNeedRow = {
  key: '1:0',
  siren: '123456789',
  company: 'Aubrac Aerostructures (démo)',
  department: '31',
  accountId: null,
  portfolioState: 'new',
  nature: 'hiring',
  label: '9 offres ouvertes en calcul et simulation',
  date: '2026-08-22',
  evidenceUrl: null,
  detail: null,
  evidenceLevel: 'direct',
  unknown: [],
  deliveryFit: 'incompatible',
  deliveryFitAxes: { site_presence: 'incompatible', clearances: 'incompatible', travel: 'unknown' },
}

describe('NeedResultRow — le delivery fit est lisible sur la ligne (#3237)', () => {
  it('nomme le niveau composé', () => {
    render(<NeedResultRow row={ROW} onQualify={vi.fn()} />)
    expect(screen.getByText(/Delivery externe incompatible/i)).toBeInTheDocument()
  })

  it('un clic sur la ligne ouvre le détail des axes, jamais un axe omis', async () => {
    render(<NeedResultRow row={ROW} onQualify={vi.fn()} />)
    expect(screen.queryByRole('term')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('9 offres ouvertes en calcul et simulation'))
    expect(screen.getAllByRole('term').length).toBeGreaterThanOrEqual(13)
  })

  it('NON — sans delivery fit évalué, aucune ligne ni aucun détail', async () => {
    const { deliveryFit: _f, deliveryFitAxes: _a, ...bare } = ROW
    render(<NeedResultRow row={bare} onQualify={vi.fn()} />)
    await userEvent.click(screen.getByText('9 offres ouvertes en calcul et simulation'))
    expect(screen.queryByRole('term')).not.toBeInTheDocument()
    expect(screen.queryByText(/Delivery externe incompatible/i)).not.toBeInTheDocument()
  })
})

// #3238 (recette démo 05/10) — « Besoins et signaux » nomme aussi le site qui publie l'offre.
describe('NeedResultRow — le site qui publie (#3238)', () => {
  it('nomme la ville du site quand la ligne la porte, rien sinon', () => {
    const { rerender } = render(<NeedResultRow row={{ ...ROW, siteCity: 'Lorient' }} onQualify={vi.fn()} />)
    expect(screen.getByTestId('need-site-city').textContent).toBe('Site : Lorient')
    rerender(<NeedResultRow row={ROW} onQualify={vi.fn()} />)
    expect(screen.queryByTestId('need-site-city')).toBeNull()
  })
})

// #4182 (EX-12) — de l'offre RH à l'équipe demandeuse, avec preuve.
describe('NeedResultRow — qui demande ce profil (#4182)', () => {
  const SUPPORTED = {
    author: 'rh' as const,
    possibleManagerFunction: 'directeur technique',
    team: 'plateforme data',
    city: 'Lyon',
    status: 'etaye' as const,
    method: [],
  }
  const TO_IDENTIFY = {
    author: 'non_precise' as const,
    possibleManagerFunction: null,
    team: null,
    city: 'Lyon',
    status: 'a_identifier' as const,
    method: ['lire_offre', 'chercher_fonction_operationnelle', 'demander_au_premier_interlocuteur'] as const,
  }

  it('étayé : le demandeur probable, l’équipe et l’auteur de l’annonce — sur UNE ligne, sans nom de personne', () => {
    render(<NeedResultRow row={{ ...ROW, requester: SUPPORTED }} onQualify={vi.fn()} />)
    expect(screen.getByTestId('need-requester').textContent).toBe(
      'Demandeur probable : directeur technique · Équipe : plateforme data · Annonce publiée par les RH',
    )
  })

  it('à identifier : la méthode se déplie, avec le site de l’offre — jamais un faux nom', async () => {
    render(
      <NeedResultRow
        row={{ ...ROW, requester: { ...TO_IDENTIFY, method: [...TO_IDENTIFY.method] } }}
        onQualify={vi.fn()}
      />,
    )
    expect(screen.queryByTestId('need-requester')).toBeNull()
    await userEvent.click(screen.getByText(/Équipe demandeuse à identifier/))
    expect(screen.getByText(/sur le site de Lyon/)).toBeInTheDocument()
    expect(screen.getByText(/Qui porte ce besoin côté métier/)).toBeInTheDocument()
  })

  it('NON — sans dossier demandeur (signal non `hiring`), rien ne s’affiche', () => {
    render(<NeedResultRow row={ROW} onQualify={vi.fn()} />)
    expect(screen.queryByTestId('need-requester')).toBeNull()
    expect(screen.queryByTestId('need-requester-method')).toBeNull()
  })
})
