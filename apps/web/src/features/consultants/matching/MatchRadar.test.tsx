import { describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MATCH_AXES, type MatchAxisResult } from '@bellum/contracts'
import { MatchRadar } from './MatchRadar'
import type { RadarProfile } from './radarGeometry'

function axes(scores: readonly (number | null)[]): MatchAxisResult[] {
  return MATCH_AXES.map((axis, index) => ({
    axis,
    score: scores[index] ?? null,
    weight: 8,
    detail: `détail ${axis}`,
    evidence: [],
  }))
}

const FULL = Array.from({ length: MATCH_AXES.length }, (_, index) => 40 + index * 5)

function profile(id: string, label: string, scores: readonly (number | null)[] = FULL): RadarProfile {
  return { id, label, axes: axes(scores) }
}

const TWO = [profile('a', 'Cap Sud — Data engineer'), profile('b', 'Nordiq — Data engineer')]

describe('MatchRadar', () => {
  it('trace TOUTES les branches du contrat (#4072.6 : quatorze avec `client_history`), chacune nommée', () => {
    cleanup()
    render(<MatchRadar profiles={TWO} title="Rapprochement" />)
    const chart = screen.getByRole('img', { name: /Rapprochement/ })
    expect(chart).toBeInTheDocument()
    expect(chart.querySelectorAll('[data-axis]')).toHaveLength(MATCH_AXES.length)
    // ⚠️ Sur le graphe, la branche porte son RANG : treize libellés français
    // autour d'un rayon de 110 px se chevauchent, et un libellé illisible ne
    // nomme rien. Le NOM voyage dans le `<title>` de la branche — que lit un
    // lecteur d'écran — et en toutes lettres dans le tableau juste à côté.
    for (const label of ['Compétences obligatoires', 'Disponibilité', 'TJM', 'Contraintes client', 'Risques']) {
      expect(within(chart).getByText(label)).toBeInTheDocument()
    }
  })

  it('écrit CHAQUE valeur en chiffre à côté du graphe', () => {
    cleanup()
    render(<MatchRadar profiles={TWO} title="Rapprochement" />)
    const table = screen.getByRole('table')
    // un rang par axe du contrat + l'en-tête.
    expect(within(table).getAllByRole('row')).toHaveLength(MATCH_AXES.length + 1)
    expect(within(table).getAllByText('40').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('95').length).toBeGreaterThan(0)
    // Le libellé complet vit ici, avec le rang qui le relie à la branche.
    expect(within(table).getByText(/Compétences obligatoires/)).toBeInTheDocument()
  })

  it('nomme les profils ailleurs que par la couleur', () => {
    cleanup()
    render(<MatchRadar profiles={TWO} title="Rapprochement" />)
    // Légende ET en-tête de colonne : l'identité ne dépend jamais d'une teinte.
    expect(screen.getAllByText('Cap Sud — Data engineer').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('Nordiq — Data engineer').length).toBeGreaterThanOrEqual(2)
  })

  describe('un axe non évaluable ne ressemble PAS à un axe à zéro', () => {
    const holed = [...FULL]
    holed[9] = null as unknown as number // « TJM »

    it('hachure la branche quand PERSONNE n’a pu être jugé dessus', () => {
      cleanup()
      render(<MatchRadar profiles={[profile('a', 'A', holed), profile('b', 'B', holed)]} title="Rapprochement" />)
      const chart = screen.getByRole('img', { name: /Rapprochement/ })
      const hatched = chart.querySelectorAll('[data-evaluability="none"]')
      expect(hatched.length).toBeGreaterThan(0)
      // La hachure est une TEXTURE, jamais une teinte : elle doit survivre au
      // daltonisme, au noir et blanc et au mode contrastes forcés.
      expect(chart.querySelector('pattern#bellum-radar-hatch')).not.toBeNull()
    })

    it('écrit « non évaluable » dans le tableau, jamais « 0 »', () => {
      cleanup()
      render(<MatchRadar profiles={[profile('a', 'A', holed), profile('b', 'B', holed)]} title="Rapprochement" />)
      const rate = screen.getByRole('row', { name: /TJM/ })
      expect(within(rate).getAllByText(/non mesuré|non évaluable/i).length).toBe(2)
      expect(within(rate).queryByText('0')).not.toBeInTheDocument()
    })

    it('distingue un VRAI zéro d’une absence', () => {
      cleanup()
      const zeroed = [...FULL]
      zeroed[9] = 0
      render(<MatchRadar profiles={[profile('a', 'A', zeroed), profile('b', 'B', zeroed)]} title="Rapprochement" />)
      const rate = screen.getByRole('row', { name: /TJM/ })
      // Un zéro mesuré s'écrit « 0 » et sa branche N'EST PAS hachurée.
      expect(within(rate).getAllByText('0')).toHaveLength(2)
      const chart = screen.getByRole('img', { name: /Rapprochement/ })
      expect(chart.querySelectorAll('[data-evaluability="none"]')).toHaveLength(0)
    })

    it('ne hachure PAS une branche qu’un seul des profils ne renseigne pas', () => {
      cleanup()
      render(<MatchRadar profiles={[profile('a', 'A', holed), profile('b', 'B', FULL)]} title="Rapprochement" />)
      const chart = screen.getByRole('img', { name: /Rapprochement/ })
      // Hachurer dirait « personne n'a pu être jugé », ce qui est faux.
      expect(chart.querySelectorAll('[data-evaluability="none"]')).toHaveLength(0)
      expect(chart.querySelectorAll('[data-evaluability="partial"]').length).toBeGreaterThan(0)
    })
  })

  describe('les bornes de la source', () => {
    it('ne dessine rien sous deux profils — un radar seul ne compare rien', () => {
      cleanup()
      const { container } = render(<MatchRadar profiles={[profile('a', 'A')]} title="Rapprochement" />)
      expect(container.querySelector('svg')).toBeNull()
      expect(screen.getByText(/deux profils/i)).toBeInTheDocument()
    })

    it('n’en superpose jamais plus de quatre', () => {
      cleanup()
      const five = ['a', 'b', 'c', 'd', 'e'].map(id => profile(id, `Profil ${id}`))
      render(<MatchRadar profiles={five} title="Rapprochement" />)
      // Le cinquième n'est pas tracé, et son absence est DITE.
      expect(screen.queryByText('Profil e')).not.toBeInTheDocument()
      expect(screen.getByText(/quatre/i)).toBeInTheDocument()
    })
  })
})
