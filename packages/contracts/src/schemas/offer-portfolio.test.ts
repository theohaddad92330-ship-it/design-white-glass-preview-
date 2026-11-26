import { describe, expect, it } from 'vitest'
import {
  OFFER_PORTFOLIO_VERSION,
  companyTypeFromPortfolio,
  offerPortfolioSchema,
  portfolioFromLegacy,
  seniorityFit,
  resolvedPortfolio,
} from './offer-portfolio.js'

describe('offerPortfolioSchema — le contrat versionné du profil vendeur', () => {
  it('accepte un portefeuille vide : tous les champs ont un défaut inoffensif', () => {
    const parsed = offerPortfolioSchema.parse({})
    expect(parsed.version).toBe(OFFER_PORTFOLIO_VERSION)
    expect(parsed.company_type).toBeNull()
    expect(parsed.target_application_sectors).toEqual([])
    expect(parsed.target_site.types).toEqual([])
    // `null`, jamais 0 : « aucun seuil » n'est pas « seuil de zéro ».
    expect(parsed.target_site.min_headcount).toBeNull()
    expect(parsed.preferred_terms).toEqual([])
    expect(parsed.privacy.feedback_reuse).toBe('tenant_private')
  })

  it('écarte un code inconnu ÉLÉMENT par élément, jamais le tableau entier', () => {
    // Même règle que `offer_domains` : un build plus ancien qui ne connaît pas
    // un secteur ne doit pas perdre les onze autres.
    const parsed = offerPortfolioSchema.parse({
      target_application_sectors: ['nuclear', 'ce-secteur-nexiste-pas', 'rail'],
    })
    expect(parsed.target_application_sectors).toEqual(['nuclear', 'rail'])
  })

  it('cible les sites avec le vocabulaire QUE L’IA PRODUIT, pas un second', () => {
    // `usine` est ce que le pipeline écrit dans `sitesFrance[].type`. Un
    // ciblage exprimé dans un autre vocabulaire ne rapprocherait jamais rien.
    const parsed = offerPortfolioSchema.parse({ target_site: { types: ['usine', 'bureau d’études', 'inexistant'] } })
    expect(parsed.target_site.types).toEqual(['usine', 'bureau d’études'])
  })

  it('refuse un seuil d’effectif négatif plutôt que de le corriger en silence', () => {
    expect(offerPortfolioSchema.parse({ target_site: { min_headcount: -5 } }).target_site.min_headcount).toBeNull()
    expect(offerPortfolioSchema.parse({ target_site: { min_headcount: 100 } }).target_site.min_headcount).toBe(100)
  })

  it('ne porte PAS les domaines : ils vivent dans offer_domains et nulle part ailleurs', () => {
    // Loi 1 du tome 7 — un réglage a une seule porte d'écriture. Un
    // `capability_codes` ici serait une seconde vérité du portefeuille.
    expect(Object.keys(offerPortfolioSchema.parse({}))).not.toContain('capability_codes')
    expect(Object.keys(offerPortfolioSchema.parse({}))).not.toContain('primary_domain_code')
  })
})

describe('companyTypeFromPortfolio — dérivé, jamais demandé', () => {
  it('dérive le type de société du pack dominant du portefeuille', () => {
    // Deux domaines Technology → pack `esn_it`.
    expect(companyTypeFromPortfolio(['SW_ENGINEERING', 'CLOUD_DEVOPS_SRE'], null)).toBe('esn_it')
  })

  it('un portefeuille vide ne produit AUCUN type — on ne devine pas', () => {
    expect(companyTypeFromPortfolio([], null)).toBeNull()
    expect(companyTypeFromPortfolio(['code-inconnu'], null)).toBeNull()
  })

  it('une correction humaine gagne toujours sur la dérivation', () => {
    // Le vendeur a corrigé : sa correction ne doit pas être écrasée au prochain
    // recalcul, même si le portefeuille dit autre chose.
    expect(companyTypeFromPortfolio(['SW_ENGINEERING'], 'finance')).toBe('finance')
  })
})

describe('portfolioFromLegacy — l’adapter de lecture seule', () => {
  it('construit un portefeuille minimal depuis un profil d’avant le contrat', () => {
    const portfolio = portfolioFromLegacy({ offer_domain: 'finance', offer_domains: [] })
    expect(portfolio.company_type).toBe('finance')
    expect(portfolio.target_application_sectors).toEqual([])
  })

  it('un profil sans rien du tout ne fabrique aucun type', () => {
    expect(portfolioFromLegacy({ offer_domain: null, offer_domains: [] }).company_type).toBeNull()
  })
})

describe('resolvedPortfolio — ce que le reste du produit lit', () => {
  it('sans portefeuille stocké, le chemin legacy est rendu tel quel', () => {
    const resolved = resolvedPortfolio({ portfolio: null, offer_domain: 'esn_it', offer_domains: [] })
    expect(resolved.company_type).toBe('esn_it')
    expect(resolved.source).toBe('legacy')
  })

  it('avec un portefeuille stocké, le type dérive des domaines réellement choisis', () => {
    const resolved = resolvedPortfolio({
      portfolio: offerPortfolioSchema.parse({}),
      offer_domain: 'esn_it',
      offer_domains: ['MECHANICAL_ENGINEERING', 'MAINTENANCE_MRO'],
    })
    expect(resolved.source).toBe('portfolio')
    // Le type vient des DOMAINES et non du legacy `esn_it`. Ces deux codes-là
    // résolvaient `generic` avant le 24/08 — c'est-à-dire un prisme sans aucun
    // vocabulaire d'ingénierie pour une société qui n'en vend que.
    expect(resolved.company_type).toBe('industrial_engineering')
  })

  it('la correction humaine du portefeuille prime sur les domaines', () => {
    const resolved = resolvedPortfolio({
      portfolio: offerPortfolioSchema.parse({ company_type: 'pmo' }),
      offer_domain: 'esn_it',
      offer_domains: ['SW_ENGINEERING'],
    })
    expect(resolved.company_type).toBe('pmo')
  })
})

describe('#3238.8 — niveaux vendus et séniorité cherchée', () => {
  it('non déclaré par défaut, jamais « tous »', () => {
    expect(offerPortfolioSchema.parse({}).sold_seniority_levels).toEqual([])
  })

  it('écarte un niveau inconnu élément par élément', () => {
    expect(
      offerPortfolioSchema.parse({ sold_seniority_levels: ['senior', 'stagiaire', 'junior'] }).sold_seniority_levels,
    ).toEqual(['junior', 'senior'])
  })

  it('croise le niveau cherché et les niveaux vendus ; un silence reste « unknown »', () => {
    expect(seniorityFit('junior', ['junior', 'confirme'])).toBe('sold')
    expect(seniorityFit('senior', ['junior', 'confirme'])).toBe('not_sold')
    expect(seniorityFit('senior', [])).toBe('unknown')
    expect(seniorityFit(null, ['senior'])).toBe('unknown')
    expect(seniorityFit(undefined, ['senior'])).toBe('unknown')
  })
})
