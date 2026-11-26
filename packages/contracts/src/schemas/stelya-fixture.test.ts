import { describe, expect, it } from 'vitest'
import { APPLICATION_SECTOR_BY_CODE } from './application-sectors.js'
import { CONSULTING_DOMAIN_BY_CODE } from './consulting-domains.js'
import { companyTypeFromPortfolio, offerPortfolioSchema, resolvedPortfolio } from './offer-portfolio.js'
import { siteSchema } from './account-entity.js'
import { siteFit } from './site-fit.js'

/**
 * La FIXTURE CANONIQUE de l'addendum Stelya (§31) et les goldens de recette
 * (§23.1).
 *
 * Le document le dit lui-même : « ce payload n'est pas une donnée de production
 * à copier telle quelle ». C'est un cas de référence — le profil décrit par
 * Ludovic — que le produit doit savoir lire de bout en bout sans qu'aucune
 * valeur ne soit codée en dur dans un pack global (interdit du §25.3 : « ne pas
 * coder en dur les zones, seuils et cibles Stelya »).
 *
 * Ce fichier ne teste donc PAS Stelya : il teste que les paramètres d'un
 * vendeur — n'importe lequel — traversent le contrat sans être perdus ni
 * devinés. Les valeurs ci-dessous sont celles du §31, et elles vivent ici, dans
 * un test, et nulle part dans le code livré.
 */

const STELYA_DOMAINS = [
  'SYSTEMS_MBSE',
  'MECHANICAL_ENGINEERING',
  'ELECTRICAL_ELECTRONICS',
  'INDUSTRIALIZATION_METHODS',
  'AUTOMATION_ROBOTICS',
  'QUALITY_VALIDATION_HSE',
  'MAINTENANCE_MRO',
  'MANUFACTURING_OPS',
]

const STELYA_SECTORS = ['automotive', 'rail', 'aerospace', 'defense', 'nuclear', 'special_machinery']

const STELYA_PORTFOLIO = offerPortfolioSchema.parse({
  target_application_sectors: STELYA_SECTORS,
  target_site: { types: ['usine', 'bureau d’études', 'R&D'], min_headcount: 100 },
  target_geographies: ['AURA', 'BFC', 'PACA'],
  forbidden_terms: ['ESN', 'régie', 'cabinet', 'intégré chez nos clients'],
  preferred_terms: ['société de conseil en ingénierie', 'mission', 'intervention sur site'],
})

function site(overrides: Record<string, unknown> = {}) {
  return siteSchema.parse({
    id: '00000000-0000-4000-8000-000000000001',
    account_id: '00000000-0000-4000-8000-000000000002',
    entity_id: null,
    label: 'Site',
    city: null,
    postal_code: null,
    country: 'FR',
    siret: null,
    headcount: null,
    created_at: '2026-08-24T00:00:00.000Z',
    updated_at: '2026-08-24T00:00:00.000Z',
    ...overrides,
  })
}

describe('G1 — le profil Stelya est lisible de bout en bout', () => {
  it('ses huit domaines existent tous dans la taxonomie', () => {
    for (const code of STELYA_DOMAINS) {
      expect(CONSULTING_DOMAIN_BY_CODE.get(code), code).toBeDefined()
    }
  })

  it('ses six secteurs d’application existent tous', () => {
    for (const code of STELYA_SECTORS) {
      expect(APPLICATION_SECTOR_BY_CODE.get(code), code).toBeDefined()
    }
  })

  it('son type de société se DÉRIVE de ses domaines, sans qu’on le lui demande', () => {
    expect(companyTypeFromPortfolio(STELYA_DOMAINS, null)).toBe('industrial_engineering')
  })

  it('aucun de ses paramètres n’est perdu par le contrat', () => {
    expect(STELYA_PORTFOLIO.target_application_sectors).toEqual(STELYA_SECTORS)
    expect(STELYA_PORTFOLIO.target_site.min_headcount).toBe(100)
    expect(STELYA_PORTFOLIO.target_geographies).toEqual(['AURA', 'BFC', 'PACA'])
    expect(STELYA_PORTFOLIO.forbidden_terms).toContain('régie')
  })
})

describe('G3 — un site vaut par lui-même, pas par la taille de son groupe', () => {
  it('une PME de 300 sur site passe devant un grand groupe de 30 sur site', () => {
    // Le golden G3 du §23.1, mot pour mot : « PME site 300 > grand groupe site
    // 30 pour la policy Stelya ; unknown non pénalisé ».
    const pme = siteFit(site({ site_type: 'usine', headcount: 300, headcount_confidence: 'high' }), STELYA_PORTFOLIO)
    const grandGroupe = siteFit(
      site({ site_type: 'usine', headcount: 30, headcount_confidence: 'high' }),
      STELYA_PORTFOLIO,
    )
    expect(pme.verdict).toBe('fits')
    expect(grandGroupe.verdict).toBe('below')
  })

  it('un effectif inconnu n’est PAS pénalisé', () => {
    expect(siteFit(site({ site_type: 'usine', headcount: null }), STELYA_PORTFOLIO).verdict).toBe('unknown')
  })
})

describe('G10 — un profil sans portefeuille garde le chemin historique', () => {
  it('rien d’enregistré ⇒ la lecture le DIT, elle n’invente pas une configuration', () => {
    const resolved = resolvedPortfolio({ portfolio: null, offer_domain: 'esn_it', offer_domains: [] })
    expect(resolved.source).toBe('legacy')
    expect(resolved.company_type).toBe('esn_it')
    expect(resolved.target_application_sectors).toEqual([])
  })
})

describe('§25.3 — aucun paramètre de ce client n’est codé en dur dans le produit', () => {
  it('le seuil de 100 n’est pas une valeur par défaut du contrat', () => {
    // « Le seuil de 100 est une préférence Stelya, pas une règle universelle du
    // produit » : un portefeuille vide n'a AUCUN seuil, et surtout pas celui-là.
    expect(offerPortfolioSchema.parse({}).target_site.min_headcount).toBeNull()
  })

  it('ses zones et ses termes interdits ne sont pas des défauts non plus', () => {
    const empty = offerPortfolioSchema.parse({})
    expect(empty.target_geographies).toEqual([])
    expect(empty.forbidden_terms).toEqual([])
    expect(empty.target_application_sectors).toEqual([])
  })
})
