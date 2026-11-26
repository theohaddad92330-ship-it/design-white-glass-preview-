import { describe, expect, it } from 'vitest'
import {
  BUSINESS_FAMILY_IDS,
  businessFamilyTerms,
  cadrageApplied,
  cadrageFromLegacyScopeMode,
  scopeModeForCadrage,
} from './analysis-cadrage.js'
import { analysisScopeModeSchema } from './analysis.js'

describe('cadrage analyse (15/10) — migration des anciens périmètres', () => {
  it('chaque ancien périmètre se migre vers les nouveaux champs, sans jeter un lien existant', () => {
    for (const mode of analysisScopeModeSchema.options) {
      expect(cadrageFromLegacyScopeMode(mode)).toBeTypeOf('object')
    }
    expect(cadrageFromLegacyScopeMode('france')).toEqual({ geo_perimeter: 'france' })
    // « Groupe entier » d'avant ne filtrait aucun pays : la migration ne doit pas en ajouter un.
    expect(cadrageFromLegacyScopeMode('groupe')).toEqual({ geo_perimeter: 'world' })
    expect(cadrageFromLegacyScopeMode('site')).toEqual({ geo_perimeter: 'city' })
    expect(cadrageFromLegacyScopeMode('startups')).toEqual({ geo_perimeter: 'world' })
  })

  it('une valeur inconnue ou absente ne cadre rien (le défaut France s’applique ailleurs)', () => {
    expect(cadrageFromLegacyScopeMode(undefined)).toEqual({})
    expect(cadrageFromLegacyScopeMode('nimporte')).toEqual({})
  })

  it('le mode envoyé au serveur se DÉDUIT de la géographie — plus aucun second sélecteur', () => {
    expect(scopeModeForCadrage({ geo_perimeter: 'france' })).toBe('france')
    expect(scopeModeForCadrage({ geo_perimeter: 'region', geo_areas: ['Bretagne'] })).toBe('france')
    expect(scopeModeForCadrage({ geo_perimeter: 'city', geo_areas: ['Lyon'] })).toBe('site')
    expect(scopeModeForCadrage({ geo_perimeter: 'europe' })).toBe('groupe')
    expect(scopeModeForCadrage({ geo_perimeter: 'world' })).toBe('groupe')
    expect(scopeModeForCadrage({})).toBe('groupe')
  })
})

describe('postes à placer → termes de tri des offres et des contacts', () => {
  it('le libellé FR comme le libellé EN d’une famille rendent les mêmes termes', () => {
    expect(businessFamilyTerms(['Cyber'])).toContain('soc')
    expect(businessFamilyTerms(['Data / IA'])).toEqual(businessFamilyTerms(['Data / AI']))
    expect(businessFamilyTerms(['Achats'])).toEqual(businessFamilyTerms(['Purchasing']))
  })

  it('un libellé inconnu (saisi ailleurs) reste son propre terme, jamais jeté', () => {
    expect(businessFamilyTerms(['Analyste SOC'])).toEqual(['analyste soc'])
  })

  it('« Autre » ne filtre rien : il ne porte aucun terme', () => {
    expect(businessFamilyTerms(['Autre'])).toEqual([])
    expect(BUSINESS_FAMILY_IDS).toContain('other')
  })
})

describe('« Cadrage appliqué » — ce qui a filtré quoi', () => {
  it('nomme chaque paramètre posé, dans l’ordre des quatre questions', () => {
    const parts = cadrageApplied({
      geo_perimeter: 'city',
      geo_areas: ['Lyon'],
      included_entities: ['Siemens Mobility'],
      excluded_entities: ['Siemens Healthineers'],
      selected_angles: ['cybersécurité'],
      business_families: ['Cyber'],
      excluded_angles: ['ERP'],
      hierarchy_levels: ['n2', 'n1'],
    })
    expect(parts.map(p => p.key)).toEqual([
      'geo',
      'included',
      'excluded',
      'priorities',
      'roles',
      'excludedThemes',
      'levels',
    ])
    expect(parts[0]).toEqual({ key: 'geo', geo: 'city', values: ['Lyon'] })
  })

  it('un run sans cadrage ou d’avant la feature ne fabrique AUCUNE ligne', () => {
    expect(cadrageApplied(null)).toEqual([])
    expect(cadrageApplied({ depth: 'quick' })).toEqual([])
  })

  it('l’effectif (supprimé de l’écran) n’apparaît jamais dans le récap', () => {
    expect(cadrageApplied({ headcount_min: 50 })).toEqual([])
  })
})

// Théo B r1-recherche.N6 — « Cadrage conservé » : les objectifs choisis et l'angle accompagnent le dossier ouvert.
describe('cadrageApplied — objectifs et angle (Théo B r1-recherche.N6)', () => {
  it('nomme les objectifs choisis, dans l’ordre, en tête du récap', () => {
    const parts = cadrageApplied({ objectives: ['open_account', 'find_decision_makers'], geo_perimeter: 'france' })
    expect(parts.map(part => part.key)).toEqual(['objectives', 'geo'])
    expect(parts[0]).toEqual({ key: 'objectives', objectives: ['open_account', 'find_decision_makers'] })
  })

  it('porte l’angle en une phrase', () => {
    expect(cadrageApplied({ angle: 'Placer deux profils Data' })).toEqual([
      { key: 'angle', value: 'Placer deux profils Data' },
    ])
  })

  it('sait dire NON : un objectif hors table et un angle vide ne fabriquent aucune ligne', () => {
    expect(cadrageApplied({ objectives: ['vendre_tout'], angle: '   ' })).toEqual([])
    expect(cadrageApplied({ objectives: [] })).toEqual([])
  })
})

describe('lot 757 — un coéquipier relit les filiales cochées sur le run', () => {
  it('nomme les entités où les contacts ont aussi été cherchés ; absent, aucune ligne', () => {
    const parts = cadrageApplied({
      contact_entities: [
        { siren: '351058151', name: 'BOURSORAMA' },
        { siren: '807465059', name: 'TREEZOR' },
      ],
    })
    expect(parts).toEqual([{ key: 'contactEntities', values: ['BOURSORAMA', 'TREEZOR'] }])
    expect(cadrageApplied({ contact_entities: [] })).toEqual([])
  })
})
