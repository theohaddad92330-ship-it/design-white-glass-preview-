import { describe, expect, it } from 'vitest'
import { projectOriginSearch, readProjectOrigin } from './projectOrigin'

describe('projectOrigin — #3683.6', () => {
  it('l’origine écrite dans l’URL est relue à l’identique (survit au rechargement)', () => {
    const origin = { accountId: 'acc-1', tab: 'plan' as const }
    expect(readProjectOrigin(projectOriginSearch(origin))).toEqual(origin)
  })
  it('une origine sans identifiant ou d’un genre inconnu n’en est pas une', () => {
    expect(readProjectOrigin({})).toBeNull()
    expect(readProjectOrigin({ from: 'account' })).toBeNull()
    expect(readProjectOrigin({ from: 'mission', fromId: 'x' })).toBeNull()
  })
  it('un onglet inconnu retombe sur Signaux et besoins, jamais sur un onglet deviné ailleurs', () => {
    expect(readProjectOrigin({ from: 'account', fromId: 'a', fromTab: 'nimportequoi' })).toEqual({
      accountId: 'a',
      tab: 'veille',
    })
  })
})
