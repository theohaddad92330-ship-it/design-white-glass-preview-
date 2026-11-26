import { describe, expect, it } from 'vitest'
import { Route as AnalyzeRoute } from './analyze'
import { Route as AnalyseRoute } from './analyse'
import { Route as AccountRoute } from './accounts/$id'
import { Route as AccountAnalyzeRoute } from './accounts/$id_.analyze'
import { Route as AccountAnalyseRoute } from './accounts/$id_.analyse'

/**
 * #4658 — `/analyze` rendait « Page introuvable » : la route du verbe principal du produit est `/search`. Une adresse
 * qui se tape de mémoire, se met en favori, se colle dans un message ne rend pas une erreur. La redirection se déclare
 * dans la DÉFINITION de route (`beforeLoad`), jamais par un `<Navigate>` (GA-27). Les voisines — `/analyse` et
 * `/accounts/analyze|analyse`, que le segment `$id` aurait avalées — font la même chose (une famille, un correctif).
 */
function thrownBy(beforeLoad: unknown, ctx: object): unknown {
  try {
    ;(beforeLoad as (c: object) => void)(ctx)
  } catch (thrown) {
    return thrown
  }
  return undefined
}

describe('#4658 — les noms du verbe principal mènent à /search', () => {
  it.each([
    ['/analyze', AnalyzeRoute.options.beforeLoad, {}],
    ['/analyse', AnalyseRoute.options.beforeLoad, {}],
    ['/accounts/analyze', AccountRoute.options.beforeLoad, { params: { id: 'analyze' } }],
    ['/accounts/analyse', AccountRoute.options.beforeLoad, { params: { id: 'analyse' } }],
  ])('%s redirige vers /search', (_label, beforeLoad, ctx) => {
    expect(thrownBy(beforeLoad, ctx)).toMatchObject({ options: { to: '/search' } })
  })

  it('un segment qui n’est ni un compte ni un nom du verbe reste « introuvable »', () => {
    expect(thrownBy(AccountRoute.options.beforeLoad, { params: { id: 'duplicates' } })).toMatchObject({
      isNotFound: true,
    })
  })
})

/**
 * #4789 — la forme AVEC identifiant (`/accounts/<id>/analyze|analyse`) rendait « Page introuvable » sur un compte
 * qu'on a sous les yeux. Alias vers le dossier du compte, identifiant conservé.
 */
describe('#4789 — /accounts/<id>/analyze|analyse mènent au dossier du compte', () => {
  it.each([
    ['/accounts/<id>/analyze', AccountAnalyzeRoute.options.beforeLoad],
    ['/accounts/<id>/analyse', AccountAnalyseRoute.options.beforeLoad],
  ])('%s redirige vers /accounts/$id avec le même identifiant', (_label, beforeLoad) => {
    expect(thrownBy(beforeLoad, { params: { id: '781e98e8-059d-48ac-acd9-f0cae463ecdb' } })).toMatchObject({
      options: { to: '/accounts/$id', params: { id: '781e98e8-059d-48ac-acd9-f0cae463ecdb' } },
    })
  })
})
