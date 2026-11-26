import { decodeBase64Url, htmlToText, normalizeMailBody } from './mail-body'

describe('htmlToText', () => {
  it('rend les sauts de ligne visibles', () => {
    expect(htmlToText('<p>Bonjour</p><p>Merci</p>')).toBe('Bonjour\nMerci')
  })

  it('jette ce qui n’est jamais du contenu', () => {
    expect(htmlToText('<style>p{color:red}</style><p>Texte</p><script>alert(1)</script>')).toBe('Texte')
  })

  it('décode les entités courantes', () => {
    expect(htmlToText('<p>Tarif &lt; 600&nbsp;&euro; &amp; n&#39;h&eacute;sitez pas</p>')).toContain("n'h")
    expect(htmlToText('<p>a &amp; b</p>')).toBe('a & b')
  })

  it('marque les listes', () => {
    expect(htmlToText('<ul><li>Java</li><li>Spring</li></ul>')).toBe('- Java\n- Spring')
  })

  it('ne laisse pas trois sauts de ligne consécutifs', () => {
    expect(htmlToText('<p>a</p><br><br><br><p>b</p>')).toBe('a\n\nb')
  })
})

describe('normalizeMailBody', () => {
  it('préfère TOUJOURS le texte brut au HTML', () => {
    // Convertir du HTML est une perte ; l'infliger quand le fournisseur donne
    // déjà du texte est une perte pour rien.
    expect(normalizeMailBody({ plain: 'Le vrai texte', html: '<p>Autre chose</p>' }).text).toBe('Le vrai texte')
  })

  it('retombe sur le HTML quand il n’y a que ça', () => {
    expect(normalizeMailBody({ plain: '   ', html: '<p>Bonjour</p>' }).text).toBe('Bonjour')
  })

  it('rend null — et non une chaîne vide — quand il n’y a pas de corps', () => {
    // « Pas de corps » (un appel) et « corps vide » (un message blanc) se
    // distinguent à l'écran ; `''` se lirait comme le second.
    expect(normalizeMailBody({})).toEqual({ text: null, truncated: false })
    expect(normalizeMailBody({ plain: '\n \t ' }).text).toBeNull()
  })

  it('coupe et le DIT', () => {
    const result = normalizeMailBody({ plain: 'x'.repeat(50), maxLength: 10 })
    expect(result.text).toHaveLength(10)
    expect(result.truncated).toBe(true)
  })

  it('ne marque pas tronqué ce qui tient pile dans la borne', () => {
    expect(normalizeMailBody({ plain: 'x'.repeat(10), maxLength: 10 }).truncated).toBe(false)
  })
})

describe('decodeBase64Url', () => {
  it('décode une partie Gmail', () => {
    const encoded = Buffer.from('Bonjour Marie', 'utf8').toString('base64url')
    expect(decodeBase64Url(encoded)).toBe('Bonjour Marie')
  })

  it('rend null sur une entrée vide plutôt que de lever', () => {
    expect(decodeBase64Url(null)).toBeNull()
    expect(decodeBase64Url('')).toBeNull()
  })
})
