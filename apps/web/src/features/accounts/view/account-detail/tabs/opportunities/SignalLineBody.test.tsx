import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AccountSignalLine } from '@bellum/contracts'
import { SignalLineBody } from './SignalLineBody'

/**
 * Lot 771 — la ligne riche dit sa SOURCE générique (jamais son type, déjà dit par la pastille), ouvre l'offre,
 * montre les compétences et le TJM quand la ligne les porte — et rien quand elle ne les porte pas.
 */
const line = (over: Partial<AccountSignalLine> = {}): AccountSignalLine => ({
  id: 'l1',
  date: '2026-05-12',
  date_precision: 'day',
  period: 'past',
  type: 'recrutement',
  title: 'Architecte cloud AWS',
  detail: null,
  url: null,
  people_hints: { names: [], roles: [], location: null },
  ...over,
})

describe('SignalLineBody — source, offre, compétences, TJM', () => {
  it('la ligne méta dit « <source> · <date> », jamais le type', () => {
    render(<SignalLineBody line={line({ origin_kind: 'offre' })} />)
    const meta = screen.getByTestId('signal-meta').textContent ?? ''
    expect(meta).toMatch(/^Offre d’emploi · /)
    expect(meta).not.toMatch(/Recrutement/)
  })

  it('un fait d’identité ou un projet sans origine se lit « Analyse », pas « Projet »', () => {
    render(<SignalLineBody line={line({ type: 'projet', title: 'Refonte du SI' })} />)
    expect(screen.getByTestId('signal-meta').textContent).toMatch(/^Analyse · /)
  })

  it('« Voir l’offre » : nouvel onglet, noopener, cible de 44 px ; ni domaine ni fournisseur écrits', () => {
    render(<SignalLineBody line={line({ url: 'https://offres.example.com/p/1?x=1' })} />)
    const link = screen.getByRole('link', { name: /Voir l’offre/ })
    expect(link).toHaveAttribute('href', 'https://offres.example.com/p/1?x=1')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toMatch(/noopener/)
    expect(link.className).toMatch(/min-h-11/)
    expect(document.body.textContent).not.toMatch(/offres\.example\.com/)
  })

  it('sans URL : aucun lien, jamais un lien vide', () => {
    render(<SignalLineBody line={line()} />)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('compétences en puces et « TJM ≈ N € » — Actuel comme Historique ; absents = rien d’écrit', () => {
    const { rerender } = render(
      <SignalLineBody line={line({ period: 'now', technologies: ['AWS', 'Terraform'], tjm_eur: 650 })} />,
    )
    expect(screen.getByText('AWS')).toBeInTheDocument()
    expect(screen.getByText('Terraform')).toBeInTheDocument()
    expect(screen.getByText(/TJM ≈ 650 €/)).toBeInTheDocument()
    rerender(<SignalLineBody line={line()} />)
    expect(screen.queryByText(/TJM/)).toBeNull()
    expect(screen.queryByTestId('signal-skills')).toBeNull()
  })
})
