import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { OrgCoverageHeader } from '@bellum/contracts'
import { OrgCoverageBanner } from './OrgCoverageBanner'

/** #3490 (vu en passant, recette 02/10) — une phrase, dans le bon sens. */
function coverage(over: Partial<OrgCoverageHeader> = {}): OrgCoverageHeader {
  return {
    discovered: 1959,
    attachedToEntity: null,
    llmEnriched: null,
    hierarchyVerified: 0,
    hierarchyProbable: 0,
    uncoveredZones: 0,
    ...over,
  } as OrgCoverageHeader
}

describe('OrgCoverageBanner', () => {
  it('#4075 — un compteur absent ne s’affiche pas : ni « non mesuré », ni libellé orphelin', () => {
    const { container } = render(<OrgCoverageBanner coverage={coverage()} />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/1.959\s*découverts/)
    expect(text).not.toMatch(/rattachés/)
    expect(text).not.toMatch(/enrichis/)
    expect(text).not.toMatch(/non mesuré/)
    expect(screen.queryByText(/aucune analyse ne le mesure encore/)).not.toBeInTheDocument()
  })

  it('un rattachement mesuré garde « nombre puis libellé »', () => {
    const { container } = render(<OrgCoverageBanner coverage={coverage({ attachedToEntity: 12 })} />)
    expect(container.textContent).toMatch(/12\s*rattachés/)
  })

  // Louis 12/10/2026 — aucune arête : pas de trois zéros, une phrase.
  it('un graphe SANS aucune arête ne montre pas « 0 liens vérifiés · 0 liens probables · 0 zones »', () => {
    const { container } = render(<OrgCoverageBanner coverage={coverage()} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/liens vérifiés/)
    expect(text).not.toMatch(/liens probables/)
    expect(text).not.toMatch(/zones à couvrir/)
    expect(text).toMatch(/Aucun lien hiérarchique connu pour ce compte/)
  })

  // #1 (recette 13/10) — Renault : 20 probables, 0 vérifié. Zéro vérifié se dit, il ne se chiffre pas.
  it('#1 — 0 lien vérifié (avec des probables) : « aucun lien encore vérifié », jamais « 0 liens vérifiés »', () => {
    const { container } = render(<OrgCoverageBanner coverage={coverage({ hierarchyProbable: 20 })} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/0\s*liens vérifiés/)
    expect(text).toMatch(/aucun lien encore vérifié/)
    expect(text).toMatch(/20\s*liens probables/)
  })

  it('sait dire NON : dès un lien vérifié, le compteur revient avec son nombre', () => {
    const { container } = render(
      <OrgCoverageBanner coverage={coverage({ hierarchyVerified: 2, hierarchyProbable: 3 })} />,
    )
    const text = container.textContent ?? ''
    expect(text).toMatch(/2\s*liens vérifiés/)
    expect(text).not.toMatch(/aucun lien encore vérifié/)
    expect(text).toMatch(/3\s*liens probables/)
    expect(text).toMatch(/0\s*zones à couvrir/)
    expect(text).not.toMatch(/Aucun lien hiérarchique connu/)
  })

  it('sait dire NON (suite) : arêtes probables seules, les zones restent un compteur', () => {
    const { container } = render(<OrgCoverageBanner coverage={coverage({ hierarchyProbable: 3 })} />)
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/0\s*liens vérifiés/)
    expect(text).toMatch(/3\s*liens probables/)
    expect(text).toMatch(/0\s*zones à couvrir/)
    expect(text).not.toMatch(/Aucun lien hiérarchique connu/)
  })

  // #4433.9 — l'analyse : peu de décideurs → la passe d'élargissement a eu lieu, et le bandeau le DIT.
  it('#4433.9 — une passe d’élargissement qui a apporté des contacts se dit, avec le même bandeau que Découvrir', () => {
    render(<OrgCoverageBanner coverage={coverage({ widened: { attempted: true, initialStock: 5, added: 7 } })} />)
    const notice = screen.getByTestId('surface-widening-notice')
    expect(notice).toHaveTextContent('Élargi aux postes voisins : 7 résultats')
    expect(within(notice).queryByRole('button')).toBeNull()
  })

  it('#4433.9 — une passe sans apport, en échec ou absente : rien (un palier sans apport ne s’affiche pas)', () => {
    const { rerender } = render(
      <OrgCoverageBanner coverage={coverage({ widened: { attempted: true, initialStock: 5, added: 0 } })} />,
    )
    expect(screen.queryByTestId('surface-widening-notice')).toBeNull()
    rerender(
      <OrgCoverageBanner coverage={coverage({ widened: { attempted: true, initialStock: 5, failure: 'timeout' } })} />,
    )
    expect(screen.queryByTestId('surface-widening-notice')).toBeNull()
    rerender(<OrgCoverageBanner coverage={coverage({ widened: null })} />)
    expect(screen.queryByTestId('surface-widening-notice')).toBeNull()
  })
})
