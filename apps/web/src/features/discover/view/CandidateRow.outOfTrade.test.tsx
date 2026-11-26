/**
 * #4284.1 / #4284.4 / #4284.26 (recette prod 25/10) — la ligne repliée d'une carte Découvrir : le SUJET (« pourquoi
 * ce compte ») ne peut pas être une offre hors du métier de l'ESN tant qu'une offre du métier existe, et une offre
 * hors métier qui reste sujet se DIT « hors de ton métier » — jamais cachée, jamais écartée.
 * Les quatre intitulés relevés en prod sont les cas : Amaris, Datadog, Interway, Equasens.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { SalesProfileForRelevance } from '@bellum/contracts'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

vi.mock('@/components/ui/CompanyAvatar', () => ({ CompanyAvatar: () => null }))
vi.mock('./CandidateNotes', () => ({ CandidateNotes: () => null }))
vi.mock('@/features/profile/hooks/usePackVocabulary', () => ({ usePackVocabulary: () => ({ context: undefined }) }))
vi.mock('./CandidateWrongCompanyAction', () => ({ CandidateWrongCompanyAction: () => null }))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))

import { CandidateRow } from './CandidateRow'

const cyber: SalesProfileForRelevance = { placedRoles: ['Cybersécurité'], noGoSectors: [] }

const dayAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)

function candidate(signals: { label: string; ago: number }[]): DiscoverCandidate {
  return {
    name: 'ACME',
    siren: '552100554',
    nafCode: null,
    sector: null,
    city: null,
    department: null,
    headcountRange: null,
    creationDate: null,
    establishmentCount: null,
    score: 70,
    scoreMax: 100,
    scoreUnmeasured: [],
    dataConfidence: null,
    scoreFactors: [],
    signals: signals.map(s => ({ type: 'hiring' as const, label: s.label, date: dayAgo(s.ago) })),
    angle: null,
    suggestedRoles: [],
    portfolioState: 'new',
    accountId: null,
    sources: [],
  }
}

function renderRow(c: DiscoverCandidate, relevanceProfile?: SalesProfileForRelevance) {
  render(
    <CandidateRow
      candidate={c}
      relevanceProfile={relevanceProfile}
      isFollowed={false}
      onToggleFollow={() => {}}
      onDismiss={() => {}}
      onAnalyze={() => {}}
    />,
  )
}

const PROD_CASES = [
  'Chargé d’études économie de la santé',
  'Customer Success Manager - Denver',
  'Technicien maintenance PRINT',
  'Chef d’équipe',
]

describe('#4284.1 — le sujet de la carte repliée', () => {
  it.each(PROD_CASES)('« %s », plus récente, ne passe pas devant une offre du métier', label => {
    renderRow(
      candidate([
        { label, ago: 1 },
        { label: 'Analyste SOC', ago: 6 },
      ]),
      cyber,
    )
    expect(screen.getByTestId('candidate-subject')).toHaveTextContent('Analyste SOC')
    expect(screen.queryByTestId('candidate-subject-out-of-trade')).toBeNull()
  })

  it.each(PROD_CASES)('« %s » seule : elle reste sujet (rien n’est écarté) et se DIT hors de ton métier', label => {
    renderRow(candidate([{ label, ago: 1 }]), cyber)
    expect(screen.getByTestId('candidate-subject')).toHaveTextContent(label)
    expect(screen.getByTestId('candidate-subject-out-of-trade')).toHaveTextContent('hors de ton métier')
  })

  it('sans profil lu : ni réordonnancement ni marque devinés', () => {
    renderRow(
      candidate([
        { label: 'Chef d’équipe', ago: 1 },
        { label: 'Analyste SOC', ago: 6 },
      ]),
      undefined,
    )
    expect(screen.getByTestId('candidate-subject')).toHaveTextContent('Chef d’équipe')
    expect(screen.queryByTestId('candidate-subject-out-of-trade')).toBeNull()
  })

  it('une offre du métier ne porte aucune marque', () => {
    renderRow(candidate([{ label: 'Analyste SOC', ago: 1 }]), cyber)
    expect(screen.getByTestId('candidate-subject')).toHaveTextContent('Analyste SOC')
    expect(screen.queryByTestId('candidate-subject-out-of-trade')).toBeNull()
  })
})
