import { pickScopedCookie, readSessionScopeHint, SESSION_SCOPE_HEADER } from './scoped-session-cookie'

const REAL = '11111111-1111-4111-8111-111111111111'
const DEMO = '22222222-2222-4222-8222-222222222222'

describe('lecture du cookie de session quand le navigateur en porte plusieurs', () => {
  const both = { [`session:${REAL}`]: 'jeton-reel', [`session:${DEMO}`]: 'jeton-demo' }

  it("sert le cookie de l'identité déclarée, pas le premier venu (DEMO-01)", () => {
    expect(pickScopedCookie(both, 'session', DEMO)).toBe('jeton-demo')
    expect(pickScopedCookie(both, 'session', REAL)).toBe('jeton-reel')
  })

  it("ne sert JAMAIS une autre identité quand celle demandée n'a pas de cookie", () => {
    expect(pickScopedCookie({ [`session:${REAL}`]: 'jeton-reel' }, 'session', DEMO)).toBeNull()
  })

  it('sans indication, garde le comportement historique (premier cookie)', () => {
    expect(pickScopedCookie(both, 'session', null)).toBe('jeton-reel')
  })

  it('ignore un cookie vide', () => {
    expect(pickScopedCookie({ [`session:${DEMO}`]: '' }, 'session', DEMO)).toBeNull()
  })

  it('tolère la casse du nom de cookie', () => {
    const upper = { [`session:${DEMO.toUpperCase()}`]: 'jeton-demo' }
    expect(pickScopedCookie(upper, 'session', DEMO)).toBe('jeton-demo')
  })

  it('vaut aussi pour le cookie de rafraîchissement', () => {
    const refresh = { [`uploadsSig:${REAL}`]: 'r-reel', [`uploadsSig:${DEMO}`]: 'r-demo' }
    expect(pickScopedCookie(refresh, 'uploadsSig', DEMO)).toBe('r-demo')
  })

  it('rend null sans cookie du tout', () => {
    expect(pickScopedCookie(undefined, 'session', REAL)).toBeNull()
  })
})

describe("l'identité déclarée par l'onglet", () => {
  it('accepte un UUID et le normalise en minuscules', () => {
    expect(readSessionScopeHint({ [SESSION_SCOPE_HEADER]: DEMO.toUpperCase() })).toBe(DEMO)
  })

  it("refuse ce qui n'est pas un identifiant — l'en-tête ne compose qu'un nom de cookie", () => {
    expect(readSessionScopeHint({ [SESSION_SCOPE_HEADER]: '../../etc/passwd' })).toBeNull()
    expect(readSessionScopeHint({ [SESSION_SCOPE_HEADER]: '' })).toBeNull()
    expect(readSessionScopeHint({ [SESSION_SCOPE_HEADER]: ['a', 'b'] })).toBeNull()
    expect(readSessionScopeHint(undefined)).toBeNull()
  })

  it('prend la première valeur quand un mandataire duplique l’en-tête', () => {
    expect(readSessionScopeHint({ [SESSION_SCOPE_HEADER]: [DEMO, REAL] })).toBe(DEMO)
  })
})
