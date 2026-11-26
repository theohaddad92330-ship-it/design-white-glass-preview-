import { describe, expect, it } from 'vitest'
import { belowTargetHeadcount } from './discover-below-target'

// #5006 (Louis) — le critère « hors cible » = MOINS DE 20 SALARIÉS, rien d'autre ; effectif inconnu ⇒ aucune marque.
describe('#5006 — hors cible : moins de 20 salariés', () => {
  it.each(['1 ou 2 salariés', '3 à 5 salariés', '10 à 19 salariés'])('« %s » est hors cible', label => {
    expect(belowTargetHeadcount(label)).toBe(true)
  })
  it.each(['20 à 49 salariés', '50 à 99 salariés', '1000 salariés et plus', '10 à 49 salariés'])(
    '« %s » n’est pas hors cible (la tranche atteint 20)',
    label => {
      expect(belowTargetHeadcount(label)).toBe(false)
    },
  )
  it.each([null, undefined, '', '0 salarié', 'Non employeur', 'illisible'])(
    '« %s » : inconnu ⇒ aucune marque',
    label => {
      expect(belowTargetHeadcount(label)).toBe(false)
    },
  )
})
