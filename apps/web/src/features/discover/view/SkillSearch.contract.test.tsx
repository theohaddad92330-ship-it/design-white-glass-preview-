import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DiscoverSkillEvidence } from '@bellum/contracts'
import { SkillEvidenceLine, SkillEvidenceOffers } from './SkillSearch'

/** #5000.2 — là où Découvrir cite une offre, le type de contrat (déclaré) apparaît avec le MÊME libellé que la fiche compte. */
const evidence = (over: Partial<DiscoverSkillEvidence['latestOffer']> = {}): DiscoverSkillEvidence => ({
  skill: 'Java',
  offerCount: 3,
  offers: [
    { title: 'Architecte Logiciel OGTR - F/H', city: 'Saint-Denis', date: '2026-10-29', contractType: 'CDI' },
    { title: 'Développeur Java', city: 'Lille', date: '2026-10-20', contractType: null },
  ],
  latestOffer: {
    title: 'Architecte Logiciel OGTR - F/H',
    city: 'Saint-Denis',
    date: '2026-10-29',
    url: null,
    source: null,
    contractType: 'CDI',
    ...over,
  },
})

describe('Découvrir — type de contrat de l’offre citée (#5000.2)', () => {
  it('« la plus récente » dit le contrat entre la ville et la date', () => {
    render(<SkillEvidenceLine evidence={evidence()} />)
    expect(screen.getByTestId('skill-evidence')).toHaveTextContent('(Saint-Denis, CDI, 29/10/2026)')
  })

  it('un contrat brut de la source est lu par le même helper (MIS → Intérim)', () => {
    render(<SkillEvidenceLine evidence={evidence({ contractType: 'MIS' })} />)
    expect(screen.getByTestId('skill-evidence')).toHaveTextContent('(Saint-Denis, Intérim, 29/10/2026)')
  })

  it('contrat non déclaré ⇒ omis, jamais deviné ni écrit « 0 »', () => {
    render(<SkillEvidenceLine evidence={evidence({ contractType: null, title: 'Architecte CDI' })} />)
    expect(screen.getByTestId('skill-evidence')).toHaveTextContent('(Saint-Denis, 29/10/2026)')
  })

  it('la liste des offres d’un résultat dit le contrat de chaque offre qui le déclare', () => {
    render(<SkillEvidenceOffers evidence={evidence()} />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('(Saint-Denis, CDI, 29/10/2026)')
    expect(items[1]).toHaveTextContent('(Lille, 20/10/2026)')
  })
})
