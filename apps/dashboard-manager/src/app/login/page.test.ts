import { describe, expect, it } from 'vitest'
import { suiteInterne } from './suite'

/**
 * L'open-redirect de l'écran de connexion (#pentest 2026-09-12).
 *
 * Le filtre d'avant n'acceptait que « commence par `/` et pas par `//` ».
 * `/\evil.com` passait : il commence par `/`, pas par `//` — et plusieurs
 * navigateurs lisent `\` comme `/` en tête de chemin, ce qui en fait une URL
 * protocole-relative une fois assignée à `window.location`. Même défense que
 * `appRouteTarget` dans `apps/web/src/components/navigation/known-routes.ts`.
 *
 * ⚠️ CE QUE CE TEST PROUVE EN PREMIER : un chemin interne ordinaire continue
 * de passer inchangé — sinon la connexion redirige toujours vers `/`, quelle
 * que soit la page d'origine, et le durcissement casse l'usage normal.
 */
describe('suiteInterne — sait dire NON à une redirection qui quitte le domaine', () => {
  it('refuse `/\\evil.com` (le piège backslash-devient-slash des navigateurs)', () => {
    expect(suiteInterne('/\\evil.com')).toBe('/')
  })

  it('refuse `//evil.com` (URL protocole-relative)', () => {
    expect(suiteInterne('//evil.com')).toBe('/')
  })

  it('refuse une URL absolue `https://evil.com`', () => {
    expect(suiteInterne('https://evil.com')).toBe('/')
  })

  it('refuse une URL absolue `http://evil.com`', () => {
    expect(suiteInterne('http://evil.com')).toBe('/')
  })

  it('refuse un simple `\\evil.com`, sans slash initial', () => {
    expect(suiteInterne('\\evil.com')).toBe('/')
  })

  it('refuse les slashes/backslashes mélangés (`/\\/\\evil.com`, `\\\\evil.com`)', () => {
    expect(suiteInterne('/\\/\\evil.com')).toBe('/')
    expect(suiteInterne('\\\\evil.com')).toBe('/')
  })

  it('refuse un chemin sans slash initial (`evil.com`)', () => {
    expect(suiteInterne('evil.com')).toBe('/')
  })

  it('LIT quelque chose — accepte un chemin interne ordinaire', () => {
    expect(suiteInterne('/dashboard')).toBe('/dashboard')
  })

  it('accepte un chemin interne avec requête et ancre', () => {
    expect(suiteInterne('/clients?filtre=actifs#haut')).toBe('/clients?filtre=actifs#haut')
  })

  it('rend `/` par défaut sur une valeur vide', () => {
    expect(suiteInterne('')).toBe('/')
    expect(suiteInterne('   ')).toBe('/')
  })
})
