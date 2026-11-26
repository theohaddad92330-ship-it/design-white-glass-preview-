import { deriveAccountInterestPenetrability } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { AccountInterestPenetrabilityCard } from './AccountInterestPenetrabilityCard'

const EMPTY_5P_SLICE = {
  perimeter: {
    group: { value: null, status: 'missing' as const },
    parent_company: { value: null, status: 'missing' as const },
    subsidiary: { value: null, status: 'missing' as const },
    business_unit: { value: null, status: 'missing' as const },
    direction: { value: null, status: 'missing' as const },
    site: { value: null, status: 'missing' as const },
    team: { value: null, status: 'missing' as const },
    program: { value: null, status: 'missing' as const },
    project: { value: null, status: 'missing' as const },
    selected_scope: { value: null, status: 'missing' as const },
    excluded_scopes: { value: null, status: 'missing' as const },
    budget_scope: { value: null, status: 'missing' as const },
    confidence: 'low' as const,
  },
  people: {
    users: { value: null, status: 'missing' as const },
    operational_relays: { value: null, status: 'missing' as const },
    champions: { value: null, status: 'missing' as const },
    technical_references: { value: null, status: 'missing' as const },
    sponsors: { value: null, status: 'missing' as const },
    economic_deciders: { value: null, status: 'missing' as const },
    procurement: { value: null, status: 'missing' as const },
    blockers: { value: null, status: 'missing' as const },
    hr: { value: null, status: 'missing' as const },
    known_relationships: { value: null, status: 'missing' as const },
    missing_roles: { value: null, status: 'missing' as const },
  },
  passage: {
    current_consultant: { value: null, status: 'missing' as const },
    former_consultant: { value: null, status: 'missing' as const },
    former_colleague: { value: null, status: 'missing' as const },
    common_relationship: { value: null, status: 'missing' as const },
    existing_client: { value: null, status: 'missing' as const },
    partner: { value: null, status: 'missing' as const },
    rank_2: { value: null, status: 'missing' as const },
    referenced_esn: { value: null, status: 'missing' as const },
    former_manager: { value: null, status: 'missing' as const },
    alumni: { value: null, status: 'missing' as const },
    event: { value: null, status: 'missing' as const },
    direct_recommendation: { value: null, status: 'missing' as const },
    no_path: { value: null, status: 'missing' as const },
    confidence: 'low' as const,
  },
  proof: {
    relevant_consultant: { value: null, status: 'missing' as const },
    comparable_reference: { value: null, status: 'missing' as const },
    mission_rex: { value: null, status: 'missing' as const },
    client_case: { value: null, status: 'missing' as const },
    artifact: { value: null, status: 'missing' as const },
    benchmark: { value: null, status: 'missing' as const },
    sector_knowledge: { value: null, status: 'missing' as const },
    relationship_proof: { value: null, status: 'missing' as const },
    risks: { value: null, status: 'missing' as const },
    missing_proof: { value: null, status: 'missing' as const },
    confidence: 'low' as const,
  },
}

describe('AccountInterestPenetrabilityCard', () => {
  it('rend `null` — jamais « rien de connu » — quand la façade n’a pas répondu', () => {
    const { container } = renderWithRouter(<AccountInterestPenetrabilityCard matrix={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche les deux bandes et dit pourquoi le quadrant est indisponible sans donnée', async () => {
    const matrix = deriveAccountInterestPenetrability({
      accountId: 'acc-1',
      analysis: {},
      strategy5P: EMPTY_5P_SLICE,
      contacts: [],
      partners: [],
    })

    renderWithRouter(<AccountInterestPenetrabilityCard matrix={matrix} />)

    expect(await screen.findByText('Intérêt × pénétrabilité du compte')).toBeInTheDocument()
    expect(screen.getAllByText('Non déterminé').length).toBeGreaterThan(0)
  })

  it('liste un facteur déterminant favorable et masque les facteurs sans signal connu', async () => {
    const matrix = deriveAccountInterestPenetrability({
      accountId: 'acc-1',
      analysis: { it_challenges: [{ title: 'Legacy ERP', description: null, severity: null, timeframe: null }] },
      strategy5P: EMPTY_5P_SLICE,
      contacts: [],
      partners: [{ relationship: 'partner', placements: 2, dismissed_at: null }],
    })

    renderWithRouter(<AccountInterestPenetrabilityCard matrix={matrix} />)

    expect(await screen.findByText(/Potentiel de besoin/)).toBeInTheDocument()
    expect(screen.getByText(/Partenaire en place/)).toBeInTheDocument()
    // "Valeur économique" (economic_value) n'a jamais de source aujourd'hui —
    // signal null ⇒ aucune ligne (doctrine « on n'affiche pas ce qu'on n'a pas »).
    expect(screen.queryByText(/Valeur économique/)).not.toBeInTheDocument()
  })

  it('#3277 — un consultant déjà nommé par « Voie d’accès » (carte 5P) n’est pas nommé une seconde fois ici', async () => {
    const matrix = deriveAccountInterestPenetrability({
      accountId: 'acc-1',
      analysis: {},
      strategy5P: {
        ...EMPTY_5P_SLICE,
        passage: {
          ...EMPTY_5P_SLICE.passage,
          former_consultant: { value: 'Léa Fontaine, Camille Roussel', status: 'observed' as const },
        },
      },
      contacts: [],
      partners: [],
    })

    renderWithRouter(<AccountInterestPenetrabilityCard matrix={matrix} />)

    // Le facteur reste (une ligne, son libellé) ; les NOMS ne vivent qu'à un endroit (GA-26).
    expect(await screen.findByText(/Ancien consultant/)).toBeInTheDocument()
    expect(screen.queryByText(/Léa Fontaine/)).not.toBeInTheDocument()
  })

  describe('#3258.16/.17/.18 (épopée #3362) — les trois leviers de simulation', () => {
    const matrix = deriveAccountInterestPenetrability({
      accountId: 'acc-1',
      analysis: {},
      strategy5P: EMPTY_5P_SLICE,
      contacts: [],
      partners: [],
    })

    it('« Avec un partenaire » force `partner_in_place` favorable et marque le résultat « Simulation »', async () => {
      renderWithRouter(<AccountInterestPenetrabilityCard matrix={matrix} />)
      const user = userEvent.setup()
      const lever = await screen.findByRole('switch', { name: 'Avec un partenaire' })

      expect(screen.queryByText('Simulation — non enregistrée')).not.toBeInTheDocument()

      await user.click(lever)

      expect(await screen.findByText('Simulation — non enregistrée')).toBeInTheDocument()
      expect(screen.getByText(/Partenaire en place/)).toBeInTheDocument()
    })

    it('ne touche à AUCUNE donnée persistée — un second montage repart du vrai calcul, jamais de la simulation', async () => {
      const { unmount } = renderWithRouter(<AccountInterestPenetrabilityCard matrix={matrix} />)
      const user = userEvent.setup()
      const lever = await screen.findByRole('switch', { name: 'Avec un partenaire' })
      await user.click(lever)
      expect(await screen.findByText('Simulation — non enregistrée')).toBeInTheDocument()
      unmount()

      renderWithRouter(<AccountInterestPenetrabilityCard matrix={matrix} />)
      await screen.findByRole('switch', { name: 'Avec un partenaire' })
      expect(screen.queryByText('Simulation — non enregistrée')).not.toBeInTheDocument()
    })

    it('désactiver le levier revient au calcul réel — la simulation ne colle pas', async () => {
      renderWithRouter(<AccountInterestPenetrabilityCard matrix={matrix} />)
      const user = userEvent.setup()
      const lever = await screen.findByRole('switch', { name: 'Sur une filiale plutôt que le groupe' })

      await user.click(lever)
      expect(await screen.findByText('Simulation — non enregistrée')).toBeInTheDocument()

      await user.click(lever)
      expect(screen.queryByText('Simulation — non enregistrée')).not.toBeInTheDocument()
    })
  })
})
