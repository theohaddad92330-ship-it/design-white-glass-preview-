import { describe, expect, it } from 'vitest'
import { Route as TalentsRoute } from './talents'

/**
 * #4668 — `/talents` (le nom de la section, décision Louis 14/10) rendait « Page introuvable » ; la route qui existe
 * est `/consultants`. La redirection se déclare dans la DÉFINITION de route, jamais par un `<Navigate>` (GA-27).
 */
function thrownBy(beforeLoad: unknown): unknown {
  try {
    ;(beforeLoad as (c: object) => void)({})
  } catch (thrown) {
    return thrown
  }
  return undefined
}

describe('#4668 — /talents mène à /consultants', () => {
  it('redirige vers /consultants', () => {
    expect(thrownBy(TalentsRoute.options.beforeLoad)).toMatchObject({ options: { to: '/consultants' } })
  })
})
