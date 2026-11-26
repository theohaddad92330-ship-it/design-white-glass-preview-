import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Le fil s'installe une seule fois par module : on repart neuf à chaque test. */
async function freshModule() {
  vi.resetModules()
  document.body.innerHTML = ''
  return import('./breadcrumbs')
}

describe('breadcrumbs', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('nomme le geste par son libellé et sa ligne de code', async () => {
    const { installBreadcrumbs, getRecentBreadcrumbs } = await freshModule()
    installBreadcrumbs()
    document.body.innerHTML = '<div data-bellum-src="apps/web/src/A.tsx:10:3"><button>Enrichir</button></div>'

    document.querySelector('button')?.click()

    expect(getRecentBreadcrumbs()).toEqual([
      expect.objectContaining({ type: 'click', label: 'Enrichir (apps/web/src/A.tsx:10:3)' }),
    ])
  })

  // Sans ce filtre, les trois derniers gestes seraient toujours ceux du
  // rapporteur lui-même — le fil ne dirait plus rien de ce qui a précédé.
  it('ignore les clics dans le rapporteur de bug', async () => {
    const { installBreadcrumbs, getRecentBreadcrumbs } = await freshModule()
    installBreadcrumbs()
    document.body.innerHTML = '<div data-bellum-capture-ignore=""><button>Signaler</button></div>'

    document.querySelector('button')?.click()

    expect(getRecentBreadcrumbs()).toEqual([])
  })

  it('suit les navigations du routeur, que pushState n’annonce pas', async () => {
    const { installBreadcrumbs, getRecentBreadcrumbs } = await freshModule()
    installBreadcrumbs()

    window.history.pushState(null, '', '/accounts')
    window.history.pushState(null, '', '/accounts/42')

    expect(getRecentBreadcrumbs().map(b => b.label)).toEqual(['/accounts', '/accounts/42'])
  })

  // #1960.7 — le fil part dans le signalement : une requête ou une ancre y
  // porte des jetons (`?t=` du lien de démonstration, `#access_token=` d'un
  // retour de connexion, `code`/`state` d'un retour OAuth). Leur PRÉSENCE se
  // dit — leur absence peut être la cause du bug —, leur VALEUR ne part jamais.
  it('ne garde jamais la requête ni l’ancre d’une navigation, seulement leur présence', async () => {
    const { installBreadcrumbs, getRecentBreadcrumbs } = await freshModule()
    installBreadcrumbs()

    window.history.pushState(null, '', '/demo?t=jeton-secret')
    window.history.pushState(null, '', '/auth/callback#access_token=abc123')

    expect(getRecentBreadcrumbs().map(b => b.label)).toEqual(['/demo?…', '/auth/callback#…'])
    expect(JSON.stringify(getRecentBreadcrumbs())).not.toMatch(/jeton-secret|abc123/)
  })

  it('ne répète pas deux fois le même geste d’affilée', async () => {
    const { installBreadcrumbs, getRecentBreadcrumbs } = await freshModule()
    installBreadcrumbs()

    window.history.pushState(null, '', '/accounts')
    window.history.replaceState(null, '', '/accounts')

    expect(getRecentBreadcrumbs()).toHaveLength(1)
  })
})
