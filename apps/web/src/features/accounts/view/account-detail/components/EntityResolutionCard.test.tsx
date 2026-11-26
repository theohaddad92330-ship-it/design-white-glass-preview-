import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { EntityResolution, EntityResolutionCorrection } from '@bellum/contracts'
import { EntityResolutionCard } from './EntityResolutionCard'

/**
 * #2284 — le verdict de l'Entity Resolver se VOIT sur le dossier.
 *
 * Ce que ces tests protègent : l'état et le type de l'entité (maison mère,
 * filiale…), les sources nommées par CATÉGORIE (jamais un fournisseur), une
 * filiale jamais lue comme le groupe (#2284.70), une ambiguïté posée en
 * question (#2284.65), et « non mesuré » ≠ 0 (pas de confiance inventée).
 */

const RESOLVED: EntityResolution = {
  state: 'resolved',
  kind: 'parent_company',
  canonical_id: 'FR-SIREN-552120222',
  commercial_name: 'Société Générale',
  legal_name: 'SOCIETE GENERALE',
  country: 'FR',
  identifiers: { siren: '552120222' },
  domain: 'societegenerale.com',
  naf_code: '64.19Z',
  naf_label: 'Autres intermédiations monétaires',
  location: 'Paris',
  parent_names: [],
  children_count: 4,
  sources: [
    'normalized_name',
    'official_domain',
    'legal_identifier',
    'registry_country',
    'public_company_profile',
    'group_graph',
  ],
  confidence: 86,
  reasons: [],
  question: null,
  resolved_at: '2026-09-24T10:00:00Z',
}

describe('EntityResolutionCard', () => {
  it('muette sans verdict (dossier antérieur à #2284)', () => {
    const { container } = render(<EntityResolutionCard resolution={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('dit l’état, le type, l’identifiant et les sources par catégorie', () => {
    render(<EntityResolutionCard resolution={RESOLVED} />)
    expect(screen.getByText('Entité résolue')).toBeInTheDocument()
    expect(screen.getByText('Maison mère')).toBeInTheDocument()
    expect(screen.getByText(/SOCIETE GENERALE/)).toBeInTheDocument()
    expect(screen.getByText(/552120222/)).toBeInTheDocument()
    expect(screen.getByText(/Identifiant légal/)).toBeInTheDocument()
    expect(screen.getByText(/Graphe du groupe/)).toBeInTheDocument()
    expect(screen.getByText(/4 filiales connues/)).toBeInTheDocument()
    expect(screen.getByText(/86\/100/)).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/pappers|insee|sirene|recherche-entreprises/i)
  })

  it('#2284.58 — une dénomination antérieure se voit, jamais un fournisseur', () => {
    render(<EntityResolutionCard resolution={{ ...RESOLVED, former_legal_names: ['SOGENAL'] }} />)
    expect(screen.getByText(/Anciennement : SOGENAL/)).toBeInTheDocument()
  })

  it('#2284.58 — sans dénomination antérieure, aucune ligne « anciennement »', () => {
    render(<EntityResolutionCard resolution={RESOLVED} />)
    expect(screen.queryByText(/Anciennement/)).not.toBeInTheDocument()
  })

  it('#2284.33 — l’état historique se nomme comme les autres états', () => {
    render(<EntityResolutionCard resolution={{ ...RESOLVED, state: 'historical' }} />)
    expect(screen.getByText('Entité historique')).toBeInTheDocument()
  })

  it('#2284.70 — une filiale n’est jamais lue comme le groupe sans avertissement', () => {
    render(<EntityResolutionCard resolution={{ ...RESOLVED, kind: 'subsidiary', parent_names: ['EDF GROUPE'] }} />)
    expect(screen.getByText('Filiale')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent(/EDF GROUPE/)
    expect(screen.getByRole('note')).toHaveTextContent(/pas celles du groupe/)
  })

  it('#3917 — plusieurs détenteurs : aucune « Filiale de X » devinée', () => {
    render(
      <EntityResolutionCard
        resolution={{ ...RESOLVED, kind: 'subsidiary', parent_names: ['ETG', 'AUTRE ACTIONNAIRE'] }}
      />,
    )
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('#2284.65 — une ambiguïté est posée en question nommée, sans confiance inventée', () => {
    render(
      <EntityResolutionCard
        resolution={{
          ...RESOLVED,
          state: 'ambiguous',
          kind: null,
          canonical_id: null,
          legal_name: null,
          identifiers: {},
          confidence: null,
          children_count: null,
          question: {
            candidates: [
              { name: 'THALES', siren: '552059024', city: 'Paris' },
              { name: 'THALES', siren: '000000001', city: 'Saint-Étienne-du-Vauvray' },
            ],
          },
        }}
      />,
    )
    expect(screen.getByText('Entité ambiguë')).toBeInTheDocument()
    expect(screen.getByText(/Plusieurs entreprises portent ce nom/)).toBeInTheDocument()
    expect(screen.getByText(/Saint-Étienne-du-Vauvray/)).toBeInTheDocument()
    expect(screen.queryByText(/\/100/)).not.toBeInTheDocument()
    expect(screen.queryByText(/filiales connues/)).not.toBeInTheDocument()
    // Kineis — « Résolue par : Domaine officiel » sous « Entité ambiguë » se contredisait : un seul état.
    expect(screen.queryByText(/Résolue par/)).not.toBeInTheDocument()
  })

  it('une entité ancrée dit par quoi elle a été résolue', () => {
    render(<EntityResolutionCard resolution={RESOLVED} />)
    expect(screen.getByText(/Résolue par/)).toBeInTheDocument()
  })

  it('non résolue : rien d’ancré n’est affiché comme un fait', () => {
    render(
      <EntityResolutionCard
        resolution={{
          ...RESOLVED,
          state: 'unresolved',
          kind: null,
          canonical_id: null,
          legal_name: null,
          identifiers: {},
          confidence: null,
          children_count: null,
          sources: ['normalized_name'],
          reasons: ['Effectif registre incohérent avec la taille web'],
        }}
      />,
    )
    expect(screen.getByText('Entité non résolue')).toBeInTheDocument()
    expect(screen.getByText(/Effectif registre incohérent/)).toBeInTheDocument()
    expect(screen.queryByText(/SIREN/)).not.toBeInTheDocument()
  })

  describe('#2284.65 / .67-.69 — le geste qui répond à la question', () => {
    const AMBIGUOUS: EntityResolution = {
      ...RESOLVED,
      state: 'ambiguous',
      kind: null,
      canonical_id: null,
      legal_name: null,
      identifiers: {},
      confidence: null,
      children_count: null,
      sources: ['normalized_name'],
      question: {
        candidates: [
          { name: 'THALES', siren: '552059024', city: 'Paris' },
          { name: 'THALES SERVICES', siren: '000000001', city: 'Vélizy' },
          { name: 'THALES ALENIA', siren: '000000002', city: 'Cannes' },
        ],
      },
    }

    it('chaque candidat porte « c’est bien celle-ci » et « ce n’est pas celle-ci », nommés', () => {
      const onCorrect = vi.fn()
      render(<EntityResolutionCard resolution={AMBIGUOUS} onCorrect={onCorrect} />)
      fireEvent.click(screen.getByRole('button', { name: 'C’est bien THALES SERVICES' }))
      expect(onCorrect).toHaveBeenCalledWith({
        decision: 'confirmed',
        target_name: 'THALES SERVICES',
        target_siren: '000000001',
      })
      fireEvent.click(screen.getByRole('button', { name: 'Ce n’est pas THALES ALENIA' }))
      expect(onCorrect).toHaveBeenLastCalledWith({
        decision: 'rejected',
        target_name: 'THALES ALENIA',
        target_siren: '000000002',
      })
    })

    it('une entité résolue se confirme ou se rejette elle-même', () => {
      const onCorrect = vi.fn()
      render(<EntityResolutionCard resolution={RESOLVED} onCorrect={onCorrect} />)
      fireEvent.click(screen.getByRole('button', { name: 'Ce n’est pas SOCIETE GENERALE' }))
      expect(onCorrect).toHaveBeenCalledWith({
        decision: 'rejected',
        target_name: 'SOCIETE GENERALE',
        target_siren: '552120222',
      })
    })

    it('sans porte d’écriture, aucun bouton (lecture seule)', () => {
      render(<EntityResolutionCard resolution={AMBIGUOUS} />)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('#2284.67 — la correction de l’espace GAGNE sur un calcul plus récent, et le dit avec sa version', () => {
      const corrections: EntityResolutionCorrection[] = [
        {
          version: 2,
          decision: 'confirmed',
          target_name: 'THALES SERVICES',
          target_siren: '000000001',
          note: null,
          decided_at: '2026-09-01T09:00:00Z',
        },
      ]
      render(<EntityResolutionCard resolution={AMBIGUOUS} corrections={corrections} onCorrect={vi.fn()} />)
      expect(screen.getByText('Entité choisie par ton espace')).toBeInTheDocument()
      expect(screen.getByText(/Tranché par ton espace — version 2/)).toBeInTheDocument()
      expect(screen.getByText(/SIREN 000000001/)).toBeInTheDocument()
      expect(screen.queryByText(/Plusieurs entreprises portent ce nom/)).not.toBeInTheDocument()
    })

    it('un rejet retire le candidat de la question', () => {
      const corrections: EntityResolutionCorrection[] = [
        {
          version: 1,
          decision: 'rejected',
          target_name: 'THALES ALENIA',
          target_siren: '000000002',
          note: null,
          decided_at: '2026-09-01T09:00:00Z',
        },
      ]
      render(<EntityResolutionCard resolution={AMBIGUOUS} corrections={corrections} />)
      expect(screen.queryByText(/Cannes/)).not.toBeInTheDocument()
      expect(screen.getByText(/Vélizy/)).toBeInTheDocument()
    })

    it('pendant l’envoi, les boutons se désactivent (pas de double geste)', () => {
      render(<EntityResolutionCard resolution={AMBIGUOUS} onCorrect={vi.fn()} pending />)
      for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    })
  })
})
