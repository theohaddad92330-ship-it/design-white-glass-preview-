import { describe, expect, it } from 'vitest'
import { Route as AffairesRoute } from './affaires'
import { Route as SignauxRoute } from './signaux'
import { Route as VivierRoute } from './vivier'

/**
 * #4710 — « Vivier », « Affaires », « Signaux » sont les noms que la navigation affiche ; leurs URL rendaient
 * « Page introuvable ». Chaque alias redirige explicitement (GA-27) vers la vraie route — et vers elle SEULE.
 */
function thrownBy(beforeLoad: unknown): unknown {
  try {
    ;(beforeLoad as (c: object) => void)({})
  } catch (thrown) {
    return thrown
  }
  return undefined
}

describe('#4710 — les URL françaises mènent à la vraie route', () => {
  it.each([
    ['/vivier', VivierRoute, '/consultants'],
    ['/affaires', AffairesRoute, '/projects'],
    ['/signaux', SignauxRoute, '/signals'],
  ])('%s redirige vers %s', (_alias, route, target) => {
    expect(thrownBy(route.options.beforeLoad)).toMatchObject({ options: { to: target, replace: true } })
  })

  it('chaque alias a sa propre cible (un copier-coller ne passe pas)', () => {
    const targets = [VivierRoute, AffairesRoute, SignauxRoute].map(
      r => (thrownBy(r.options.beforeLoad) as { options: { to: string } }).options.to,
    )
    expect(new Set(targets).size).toBe(3)
  })
})
