import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiscoverNeedRow } from '@/features/discover/lib/discover-result-rows'
import { NeedResultRow } from './NeedResultRow'

// #3922.5 — /discover?signals=hiring : aucune ligne ne portait de lien vers sa source.
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
}

describe('NeedResultRow — la preuve cliquable, ou rien (#3922.5, #4045.3)', () => {
  it('rend le lien de preuve quand la source en publie un', () => {
    render(<NeedResultRow row={{ ...ROW, evidenceUrl: 'https://jobs.example/offre-1' }} onQualify={vi.fn()} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://jobs.example/offre-1')
    expect(screen.queryByText('Sans lien vérifiable')).not.toBeInTheDocument()
  })

  it('sait dire NON : sans preuve, aucune ligne et aucun lien fabriqué', () => {
    render(<NeedResultRow row={ROW} onQualify={vi.fn()} />)
    expect(screen.queryByText('Sans lien vérifiable')).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('NeedResultRow — aucune source nommée (lot M, recette 01/11)', () => {
  it('sait dire NON : le nom du site d’annonces servi en détail n’est pas affiché', () => {
    render(<NeedResultRow row={{ ...ROW, detail: 'Jobintree' }} onQualify={vi.fn()} />)
    expect(screen.queryByText(/jobintree/i)).not.toBeInTheDocument()
  })
})

describe('NeedResultRow — le site de publication d’une offre se nomme (#5010.3, recette prod 03/11)', () => {
  it('une offre LinkedIn dit « Voir l’annonce · LinkedIn »', () => {
    render(<NeedResultRow row={{ ...ROW, evidenceUrl: 'https://fr.linkedin.com/jobs/view/123' }} onQualify={vi.fn()} />)
    expect(screen.getByRole('link')).toHaveTextContent("Voir l'annonce · LinkedIn")
  })

  it('sait dire NON : un agrégateur ou un site inconnu garde le libellé générique, aucun nom deviné', () => {
    render(<NeedResultRow row={{ ...ROW, evidenceUrl: 'https://www.adzuna.fr/details/42' }} onQualify={vi.fn()} />)
    expect(screen.getByRole('link')).toHaveTextContent('Voir la source')
    expect(screen.queryByText(/adzuna/i)).not.toBeInTheDocument()
  })
})
