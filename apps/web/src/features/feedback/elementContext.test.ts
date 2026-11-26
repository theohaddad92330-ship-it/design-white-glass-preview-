import { describe, expect, it, beforeEach } from 'vitest'
import { buildElementContext, formatElementContext } from './elementContext'

function mount(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLElement
}

describe('buildElementContext', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('reads the build-time source stamp off the clicked element', () => {
    const root = mount('<div data-bellum-src="apps/web/src/A.tsx:10:3"><button>Go</button></div>')
    const button = root.querySelector('button')!

    const context = buildElementContext(button)

    expect(context.sourceFile).toBeNull()
    // The nearest stamped ancestor is the app code that rendered this node.
    expect(context.sourceChain).toEqual(['apps/web/src/A.tsx:10:3'])
    expect(context.tagName).toBe('button')
    expect(context.text).toBe('Go')
  })

  it('prefers the stamp on the element itself when it has one', () => {
    const root = mount('<div data-bellum-src="outer:1:1"><span data-bellum-src="inner:2:2">x</span></div>')
    const context = buildElementContext(root.querySelector('span')!)

    expect(context.sourceFile).toBe('inner:2:2')
    expect(context.sourceChain).toEqual(['outer:1:1'])
  })

  it('captures accessibility and link metadata for the issue', () => {
    const root = mount('<a href="/accounts/1" role="link" aria-label="Voir le compte" id="go">Voir</a>')
    const context = buildElementContext(root)

    expect(context.href).toBe('/accounts/1')
    expect(context.role).toBe('link')
    expect(context.ariaLabel).toBe('Voir le compte')
    expect(context.elementId).toBe('go')
  })

  it('builds a selector that stops at the nearest id', () => {
    mount('<div id="panel"><ul><li>a</li><li>b</li></ul></div>')
    const second = document.querySelectorAll('li')[1]!

    expect(buildElementContext(second).selector).toBe('#panel > ul > li:nth-of-type(2)')
  })

  it('collapses whitespace and truncates long text', () => {
    const root = mount(`<p>  ${'mot '.repeat(100)}  </p>`)
    const { text } = buildElementContext(root)

    expect(text).toHaveLength(200)
    expect(text?.startsWith('mot mot')).toBe(true)
  })

  it('returns an empty component stack outside React', () => {
    const root = mount('<div>plain</div>')
    expect(buildElementContext(root).componentStack).toEqual([])
  })

  it('joint le markup réel et l’identité de l’élément', () => {
    const root = mount('<button class="btn primary" data-testid="reconnect" disabled>Reconnecter</button>')
    const { html, descriptor } = buildElementContext(root)

    // Le `disabled` ne se voit ni dans le sélecteur ni dans les classes.
    expect(html).toBe('<button class="btn primary" data-testid="reconnect" disabled="">Reconnecter</button>')
    expect(descriptor).toBe('button.btn.primary[data-testid="reconnect"]')
  })

  it('propose des chaînes cherchables, sans l’estampille de build', () => {
    const root = mount(
      '<button data-bellum-src="apps/web/src/A.tsx:1:1" data-testid="enrich-btn" aria-label="Enrichir ce contact">Enrichir</button>',
    )
    const { grepTokens } = buildElementContext(root)

    expect(grepTokens).toEqual(['enrich-btn', 'Enrichir ce contact', 'Enrichir'])
    // L'estampille est une piste, pas une chaîne à chercher dans le code.
    expect(buildElementContext(root).descriptor).not.toContain('data-bellum-src')
  })

  // Un graphe rend « 04/0705/0706/07… » : cette bouillie n'est dans aucun
  // fichier source, et mise dans une commande de recherche elle ne rend rien.
  it('remonte au titre voisin quand le texte est de la donnée agglutinée', () => {
    mount('<section>Volume de colis<div id="chart">04/0705/0706/0712/07 18,4 % 22,1 %</div></section>')
    const chart = document.getElementById('chart')!

    expect(buildElementContext(chart).text).toBe('Volume de colis')
  })

  // #2759 — un avatar (ou tout aperçu) en `data:` URI se sert EN PREMIER dans le
  // markup : ses octets de base64 (plusieurs Ko pour un simple avatar JPEG) noient
  // le budget de troncature `MAX_HTML`, et la réponse réelle qui suit n'apparaît
  // JAMAIS dans le rapport de bug — c'est ce qui a rendu #2759 inexploitable.
  it("n'engloutit pas le budget de troncature dans une image data: URI", () => {
    const bigBase64 = 'A'.repeat(2000)
    const root = mount(
      `<div><img src="data:image/jpeg;base64,${bigBase64}"><p>Ce qui manque : le brief équipe.</p></div>`,
    )
    const { html } = buildElementContext(root)

    expect(html).toContain('Ce qui manque : le brief équipe.')
    expect(html).not.toContain(bigBase64)
  })

  // #3895.1 (retour bêta ADD-SANOFI-09) — la sauvegarde d'un fil de conversation
  // long (`chat-messages-list`, `overflow-y-auto`) ne contient que ce qui est
  // monté dans le DOM : passé `MAX_HTML`, le markup est coupé SANS le dire, et
  // le rapport se lit comme un extrait complet alors qu'il ne l'est pas. La
  // doctrine du lot l'exige : un extrait se NOMME, il ne se fait pas passer pour
  // le tout.
  it('#3895.1 — un markup tronqué le dit, jamais silencieusement', () => {
    const long = '<p>' + 'contenu '.repeat(400) + '</p>'
    const root = mount(`<div>${long}</div>`)

    const { html, htmlTruncated } = buildElementContext(root)

    expect(htmlTruncated).toBe(true)
    expect(html).not.toBeNull()
  })

  it('#3895.1 — un markup complet ne se dit pas tronqué', () => {
    const root = mount('<button>Enrichir</button>')
    expect(buildElementContext(root).htmlTruncated).toBe(false)
  })
})

describe('formatElementContext', () => {
  it('leads with the source location and omits empty rows', () => {
    const root = mount('<button data-bellum-src="apps/web/src/A.tsx:10:3">Go</button>')
    const lines = formatElementContext(buildElementContext(root)).split('\n')

    expect(lines[0]).toBe('- Source : apps/web/src/A.tsx:10:3')
    expect(lines.some(line => line.startsWith('- Lien'))).toBe(false)
    expect(lines.some(line => line.startsWith('- Texte : « Go »'))).toBe(true)
  })

  // #3895.1 — la ligne qui manquait : un markup coupé le dit, pour qu'un extrait
  // de recette ne se lise jamais comme le fil complet.
  it('#3895.1 — nomme explicitement un markup tronqué', () => {
    const long = '<p>' + 'contenu '.repeat(400) + '</p>'
    const root = mount(`<div>${long}</div>`)
    const lines = formatElementContext(buildElementContext(root)).split('\n')

    expect(lines.some(line => line.includes('extrait') && line.includes('tronqué'))).toBe(true)
  })

  it('#3895.1 — pas de ligne de troncature quand le markup est complet', () => {
    const root = mount('<button data-bellum-src="apps/web/src/A.tsx:10:3">Go</button>')
    const lines = formatElementContext(buildElementContext(root)).split('\n')

    expect(lines.some(line => line.includes('tronqué'))).toBe(false)
  })
})
