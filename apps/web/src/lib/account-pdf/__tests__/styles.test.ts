import { describe, expect, it } from 'vitest'
import { decisionBadgePalette, palette, reportingLineStyle } from '../styles'

/**
 * `reportingLineStyle` seule décide trait plein / trait pointillé sur la page
 * organigramme du PDF — le cœur de la distinction que la maquette demande de
 * ne jamais aplatir. Testée en isolation, pure : une régression ici ferait
 * dessiner une hypothèse comme un fait, et aucun test qui inspecte les octets
 * (potentiellement compressés) du PDF final ne pourrait l'attraper de façon
 * fiable.
 */
describe('reportingLineStyle', () => {
  it('un rattachement VÉRIFIÉ est un trait PLEIN', () => {
    expect(reportingLineStyle({ verified: true })).toEqual({ color: palette.verifiedFg, borderStyle: 'solid' })
  })

  it('un rattachement NON vérifié (hypothèse ou lien faible) est un trait POINTILLÉ', () => {
    expect(reportingLineStyle({ verified: false })).toEqual({ color: palette.hypothesisFg, borderStyle: 'dashed' })
  })

  it('les deux ne partagent jamais la même couleur — sinon plein et pointillé se confondent au premier coup d’œil', () => {
    const verified = reportingLineStyle({ verified: true })
    const unverified = reportingLineStyle({ verified: false })
    expect(verified.color).not.toBe(unverified.color)
    expect(verified.borderStyle).not.toBe(unverified.borderStyle)
  })

  it('aucun rattachement connu (`null`) rend un gris neutre — pas de ligne inventée', () => {
    expect(reportingLineStyle(null)).toEqual({ color: palette.border, borderStyle: 'solid' })
  })
})

describe('decisionBadgePalette', () => {
  it('donne une couleur DISTINCTE à chacun des quatre badges', () => {
    const badges = ['sponsor', 'influencer', 'operational', 'blocker'] as const
    const colours = badges.map(badge => decisionBadgePalette(badge).fg)
    expect(new Set(colours).size).toBe(badges.length)
  })
})
