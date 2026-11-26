import { describe, expect, it } from 'vitest'
import { decodeHtmlEntities } from './decode-html-entities'

// #VU.1 (18/10) — /mailbox affichait `t&#39;appelle` et `&lt;youri@…&gt;` bruts.
describe('decodeHtmlEntities', () => {
  it('décode les entités nommées et numériques courantes', () => {
    expect(decodeHtmlEntities('Je t&#39;appelle')).toBe("Je t'appelle")
    expect(decodeHtmlEntities('Youri &lt;youri@acme.fr&gt;')).toBe('Youri <youri@acme.fr>')
    expect(decodeHtmlEntities('A &amp; B &quot;x&quot; &#x27;y&#x27;')).toBe('A & B "x" \'y\'')
  })
  it('ne décode qu’une fois et laisse le reste intact', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;')
    expect(decodeHtmlEntities('texte simple & vrai')).toBe('texte simple & vrai')
    expect(decodeHtmlEntities('&inconnu;')).toBe('&inconnu;')
  })
  it('rend null/undefined tels quels', () => {
    expect(decodeHtmlEntities(null)).toBeNull()
    expect(decodeHtmlEntities(undefined)).toBeUndefined()
  })
})
