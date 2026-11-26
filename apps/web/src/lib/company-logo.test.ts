import { describe, expect, it } from 'vitest'
import { companyLogoSrc } from './company-logo'

const APOLLO = 'https://zenprospect-production.s3.amazonaws.com/uploads/a/logo.png'

describe('companyLogoSrc — l’URL cacheable servie par notre origine', () => {
  it('fait passer le logo Apollo persisté par notre propre origine', () => {
    const src = companyLogoSrc(APOLLO, null)
    expect(src).toBeTruthy()
    const url = new URL(src!)
    expect(url.pathname).toBe('/logo')
    expect(url.searchParams.get('src')).toBe(APOLLO)
    expect(url.searchParams.has('domain')).toBe(false)
  })

  it('transmet le domaine du site pour le repli favicon côté API', () => {
    const url = new URL(companyLogoSrc(null, 'https://www.vinci.com/fr')!)
    expect(url.pathname).toBe('/logo')
    expect(url.searchParams.get('domain')).toBe('vinci.com')
    expect(url.searchParams.has('src')).toBe(false)
  })

  it('normalise le site (schéma, www, chemin, casse, espaces)', () => {
    const domainOf = (w: string) => new URL(companyLogoSrc(null, w)!).searchParams.get('domain')
    expect(domainOf('https://www.vinci.com/fr?x=1')).toBe('vinci.com')
    expect(domainOf('VINCI.COM')).toBe('vinci.com')
    expect(domainOf('  vinci.com  ')).toBe('vinci.com')
  })

  it('envoie les deux indices quand les deux sont connus — l’API tranche', () => {
    const url = new URL(companyLogoSrc(APOLLO, 'vinci.com')!)
    expect(url.searchParams.get('src')).toBe(APOLLO)
    expect(url.searchParams.get('domain')).toBe('vinci.com')
  })

  it('ne vise jamais un hôte tiers — toujours notre origine', () => {
    const url = new URL(companyLogoSrc(APOLLO, 'vinci.com')!)
    expect(url.host).not.toContain('amazonaws')
    expect(url.host).not.toContain('google')
  })

  it('est STABLE d’un appel à l’autre — une URL instable EST le bug corrigé', () => {
    expect(companyLogoSrc(APOLLO, 'vinci.com')).toBe(companyLogoSrc(APOLLO, 'vinci.com'))
  })

  it('renvoie null quand il n’y a rien à afficher (l’avatar montre l’initiale)', () => {
    expect(companyLogoSrc(null, null)).toBeNull()
    expect(companyLogoSrc(undefined, undefined)).toBeNull()
    expect(companyLogoSrc('', '')).toBeNull()
    expect(companyLogoSrc(null, 'nodot')).toBeNull()
  })

  it('ne relaie pas une valeur de logo non http(s)', () => {
    expect(companyLogoSrc('javascript:alert(1)', null)).toBeNull()
    expect(companyLogoSrc('data:image/png;base64,AAA', null)).toBeNull()
  })

  it('retombe sur le domaine quand le logo persisté est inexploitable', () => {
    const url = new URL(companyLogoSrc('javascript:alert(1)', 'vinci.com')!)
    expect(url.searchParams.has('src')).toBe(false)
    expect(url.searchParams.get('domain')).toBe('vinci.com')
  })

  describe('visuels de l’espace de démonstration', () => {
    it('sert le visuel livré avec l’app tel quel — rien à relayer, tout est déjà chez nous', () => {
      expect(companyLogoSrc('/demo-assets/logos/groupe-helios.svg', 'https://www.groupe-helios.example')).toBe(
        '/demo-assets/logos/groupe-helios.svg',
      )
    })

    it('n’ouvre le passe-droit QUE sur ce préfixe — pas sur un chemin quelconque', () => {
      // Un chemin absolu hors préfixe retombe sur le chemin normal (ici : rien
      // d’exploitable, donc null) plutôt que d’être servi tel quel.
      expect(companyLogoSrc('/uploads/whatever.svg', null)).toBeNull()
      expect(companyLogoSrc('/demo-assets-evil/x.svg', null)).toBeNull()
    })

    it('ne peut pas être détourné en URL protocol-relative vers un hôte tiers', () => {
      // `//evil.com/...` commence par deux barres : il ne matche pas le préfixe
      // et n’est pas http(s) → rien n’est relayé.
      expect(companyLogoSrc('//evil.com/demo-assets/logos/x.svg', null)).toBeNull()
    })

    it('un hôte tiers qui imite le préfixe reste soumis au relais (et à son allow-list)', () => {
      // Le passe-droit ne s’applique QU’aux chemins same-origin. Une URL absolue
      // repart par `/logo`, où l’allow-list anti-SSRF décide — donc l’exception
      // n’ouvre aucune porte que le relais fermait.
      const src = companyLogoSrc('https://evil.com/demo-assets/logos/x.svg', null)!
      expect(new URL(src).pathname).toBe('/logo')
      expect(new URL(src).host).not.toContain('evil.com')
    })
  })
})

describe('un domaine est un nom d’hôte, pas une phrase', () => {
  it('refuse la prose que le pipeline a parfois écrite dans le champ site', () => {
    // Vu en recette live sur la production : l'écran Comptes appelait
    // `/logo?domain=non identifié explicitement dans les sources fournies (le
    // site officiel blablacar est notoirement blablacar.fr` — un 404 à chaque
    // chargement. Le garde-fou exigeait un point, et la phrase en contenait un.
    expect(
      companyLogoSrc(
        null,
        'non identifié explicitement dans les sources fournies (le site officiel blablacar est notoirement blablacar.fr',
      ),
    ).toBeNull()
    expect(
      companyLogoSrc(null, 'totalenergies.com (site du groupe totalenergies, identifié dans les sources web)'),
    ).toBeNull()
    expect(
      companyLogoSrc(null, 'non identifié dans les sources (page magasin sur e.leclerc mentionnée : https:'),
    ).toBeNull()
  })

  it('laisse passer les vrais domaines, sous toutes leurs formes', () => {
    for (const site of ['airbus.com', 'https://www.airbus.com', 'https://airbus.com/fr/contact', 'sncf-reseau.com']) {
      expect(companyLogoSrc(null, site)).toContain('domain=')
    }
  })
})
