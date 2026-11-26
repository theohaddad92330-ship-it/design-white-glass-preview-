import { describe, expect, it } from 'vitest'
import { SKILL_DOMAINS } from './criteria-referential.js'
import {
  FRENCH_REGIONS,
  FRENCH_REGION_DEPARTMENTS,
  MARKET_PATTERN_SIGNAL_TYPE,
  MARKET_PATTERN_SKILL_DOMAINS,
  MARKET_PATTERN_WINDOW_DAYS,
  marketPatternObservedLabel,
  regionKeyOfAddress,
  skillDomainOfJobTitle,
  toMarketPatternLine,
} from './market-pattern.js'
import { SHARED_AGGREGATE_TABLES, SHARED_BASE_MIN_WORKSPACES } from './shared-anonymous-base.js'

/**
 * #4286.15.c — DÉCISION LOUIS 22/10/2026 : `market_pattern`, des tendances de marché entre espaces,
 * en agrégats sur jetons fermés, publiés à trois espaces au moins, jamais un coût ni un nom.
 */
describe('#4286.15.c — les catégories fermées d’un market_pattern viennent des référentiels existants', () => {
  it('la famille de métier recruté = les domaines du référentiel de compétences, rien d’autre', () => {
    expect([...MARKET_PATTERN_SKILL_DOMAINS].sort()).toEqual(Object.keys(SKILL_DOMAINS).sort())
  })

  it('le signal lu est le recrutement (nature fermée de l’analyse), sur une fenêtre bornée', () => {
    expect(MARKET_PATTERN_SIGNAL_TYPE).toBe('recrutement')
    expect(MARKET_PATTERN_WINDOW_DAYS).toBeGreaterThan(0)
  })

  it('la table entre dans la liste des agrégats communs — GA-43 la relit', () => {
    expect(SHARED_AGGREGATE_TABLES).toContain('shared_market_pattern_aggregates')
  })

  it('un intitulé d’offre se range dans UN domaine — par les termes du référentiel, puis la compétence', () => {
    expect(skillDomainOfJobTitle('Data Engineer confirmé (H/F)')).toBe('data')
    expect(skillDomainOfJobTitle('Développeur React / Node')).toBe('web')
    expect(skillDomainOfJobTitle('Ingénieur DevOps Kubernetes')).toBe('cloud')
  })

  it('sait dire NON — un intitulé hors référentiel ne devient aucun domaine (jamais deviné)', () => {
    expect(skillDomainOfJobTitle('Comptable fournisseurs')).toBeNull()
    expect(skillDomainOfJobTitle('')).toBeNull()
    expect(skillDomainOfJobTitle(null)).toBeNull()
  })

  it('la région se lit dans le code postal de l’adresse ; illisible ou hors métropole = aucune région', () => {
    expect(regionKeyOfAddress('12 rue de la Paix, 75002 Paris')).toBe('ile_de_france')
    expect(regionKeyOfAddress('Parc Technologique, 69120 Vaulx-en-Velin')).toBe('auvergne_rhone_alpes')
    expect(regionKeyOfAddress('Route de Bastia, 20200 Bastia')).toBe('corse')
    expect(regionKeyOfAddress('97400 Saint-Denis')).toBeNull()
    expect(regionKeyOfAddress('Paris')).toBeNull()
    expect(regionKeyOfAddress(null)).toBeNull()
  })

  it('les treize régions métropolitaines, chacune un jeton, chaque département dans une seule', () => {
    expect(FRENCH_REGIONS).toHaveLength(13)
    const departments = Object.values(FRENCH_REGION_DEPARTMENTS).flat()
    expect(new Set(departments).size).toBe(departments.length)
    expect(Object.keys(FRENCH_REGION_DEPARTMENTS).sort()).toEqual([...FRENCH_REGIONS].sort())
  })
})

describe('#4286.15.c — ce qui se publie, et ce qui est refusé', () => {
  const cell = {
    topic: 'data',
    sectorKey: 'naf_64',
    sizeBand: 'eti',
    regionKey: 'ile_de_france',
    observations: 7,
    contributingWorkspaces: 4,
  }

  it('publie une cellule portée par trois espaces au moins, avec son libellé « observé dans N espaces »', () => {
    expect(toMarketPatternLine(cell)).toEqual({ ...cell, observedIn: 'observé dans 4 espaces' })
    expect(marketPatternObservedLabel(SHARED_BASE_MIN_WORKSPACES)).toBe('observé dans 3 espaces')
  })

  it('sait dire NON — sous trois espaces contributeurs, rien ne sort (k-anonymat)', () => {
    expect(toMarketPatternLine({ ...cell, contributingWorkspaces: SHARED_BASE_MIN_WORKSPACES - 1 })).toBeNull()
  })

  it('sait dire NON — un champ de coût, de prix, de TJM, un nom ou un texte libre fait refuser la ligne', () => {
    for (const field of ['cost', 'price', 'tjm', 'dailyRate', 'workspaceId', 'companyName', 'note', 'message']) {
      expect(toMarketPatternLine({ ...cell, [field]: 1 })).toBeNull()
    }
    expect(toMarketPatternLine({ ...cell, regionKey: 'Île-de-France' })).toBeNull()
    expect(toMarketPatternLine({ ...cell, topic: 'comptabilite' })).toBeNull()
  })

  it('un compte, jamais un taux ni une probabilité — le libellé dit ce qu’on SAIT (GA-259)', () => {
    const label = marketPatternObservedLabel(5)
    expect(label).not.toMatch(/%|probab|chance|taux|le marché/i)
    expect(Object.keys(toMarketPatternLine(cell) ?? {})).not.toEqual(expect.arrayContaining(['rate']))
  })
})
