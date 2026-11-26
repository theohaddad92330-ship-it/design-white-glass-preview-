import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EstimatedBadge } from './EstimatedBadge'

/**
 * #4016 L4 (décision Louis 11/10/2026) — l'IA a le droit d'ESTIMER, à une
 * condition : l'estimation est BADGÉE, toujours, et ne se lit jamais comme une
 * preuve. Ce badge est la seule forme de cette mention (GA-26) — e-mail déduit,
 * rattachement probable, angle en hypothèse, valeur suggérée.
 */
describe('EstimatedBadge — une estimation se NOMME', () => {
  it('dit « estimé » par défaut, et son nom accessible dit que ce n’est pas une preuve', () => {
    render(<EstimatedBadge />)
    const badge = screen.getByText('estimé')
    expect(badge.closest('[aria-label]')?.getAttribute('aria-label')).toMatch(/pas une preuve/i)
  })

  it('porte la DATE de vérification quand il y en a une, lisible et localisée', () => {
    render(<EstimatedBadge verifiedAt="2026-10-11T09:12:00.000Z" />)
    expect(screen.getByText(/estimé, vérifié le 11 oct\.? 2026/)).toBeInTheDocument()
  })

  it('sait dire NON : une date illisible ne s’imprime pas — le badge reste « estimé »', () => {
    render(<EstimatedBadge verifiedAt="pas-une-date" />)
    expect(screen.queryByText(/pas-une-date/)).not.toBeInTheDocument()
    expect(screen.getByText('estimé')).toBeInTheDocument()
  })

  // #4295.17/.18 — recette production (fiche THALES) : angles « hypothèse », ESN « probable », jamais « estimé ».
  // UN mot visible pour toute valeur déduite ; la nuance reste lisible au lecteur d'écran et à l'infobulle.
  it('les quatre formes disent le MÊME mot « estimé » ; la nuance vit dans le nom accessible', () => {
    const { rerender } = render(<EstimatedBadge kind="probable" />)
    const nuances = { probable: /probable/i, hypothesis: /hypothèse/i, suggested: /suggérée/i } as const
    expect(screen.getByText('estimé').closest('[aria-label]')?.getAttribute('aria-label')).toMatch(nuances.probable)
    rerender(<EstimatedBadge kind="hypothesis" />)
    expect(screen.getByText('estimé').closest('[aria-label]')?.getAttribute('aria-label')).toMatch(nuances.hypothesis)
    expect(screen.getByText('estimé').closest('[data-estimate]')?.getAttribute('data-estimate')).toBe('hypothesis')
    rerender(<EstimatedBadge kind="suggested" />)
    expect(screen.getByText('estimé').closest('[aria-label]')?.getAttribute('aria-label')).toMatch(nuances.suggested)
  })

  it('sait dire NON : aucun second libellé visible (« hypothèse », « probable », « suggéré »)', () => {
    for (const kind of ['probable', 'hypothesis', 'suggested'] as const) {
      const { unmount } = render(<EstimatedBadge kind={kind} />)
      expect(screen.queryByText(/^(hypothèse|probable|suggéré)$/i)).toBeNull()
      unmount()
    }
  })

  it('la base de l’estimation se lit dans le nom accessible et en infobulle', () => {
    render(<EstimatedBadge basis="motif prénom.nom appris de 3 adresses vérifiées" />)
    const host = screen.getByText('estimé').closest('[aria-label]')
    expect(host?.getAttribute('aria-label')).toContain('motif prénom.nom appris de 3 adresses vérifiées')
    expect(host?.getAttribute('title')).toContain('motif prénom.nom')
  })
})
