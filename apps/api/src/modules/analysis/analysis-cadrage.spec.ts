import type { AnalysisScopeSelection } from '@bellum/contracts'
import { applyScopeToResearch, graphScopeSelection } from './analysis-scope'

/**
 * Cadrage analyse (retour Louis 15/10) — « que ce qu'on sélectionne avant
 * analyse entre VRAIMENT en compte ». Avant ce lot, `graphScopeSelection` ne
 * laissait partir au graphe IA que la profondeur et la zone : niveaux de
 * contact, postes à placer, priorités, entités ciblées/exclues et thèmes
 * exclus étaient ENVOYÉS par l'écran puis jetés ici — l'appelant manquait.
 */
describe('graphScopeSelection — chaque paramètre gardé part au graphe IA', () => {
  const full: AnalysisScopeSelection = {
    depth: 'quick',
    geo_perimeter: 'city',
    geo_areas: ['Lyon'],
    included_entities: ['Siemens Mobility'],
    excluded_entities: ['Siemens Healthineers'],
    selected_angles: ['cybersécurité'],
    excluded_angles: ['ERP'],
    business_families: ['Cyber'],
    hierarchy_levels: ['n2', 'n1'],
    headcount_min: 50,
  }

  it('transmet les quatre questions, et les termes des postes à placer résolus UNE fois (contrat)', () => {
    const out = graphScopeSelection(full)
    expect(out).toMatchObject({
      depth: 'quick',
      geo_perimeter: 'city',
      geo_areas: ['Lyon'],
      included_entities: ['Siemens Mobility'],
      excluded_entities: ['Siemens Healthineers'],
      selected_angles: ['cybersécurité'],
      excluded_angles: ['ERP'],
      business_families: ['Cyber'],
      hierarchy_levels: ['n2', 'n1'],
    })
    expect(out?.business_family_terms).toEqual(expect.arrayContaining(['cyber', 'soc', 'pentest']))
  })

  it('l’effectif, supprimé de l’écran et sans effet sur l’analyse, ne part pas', () => {
    expect(graphScopeSelection(full)).not.toHaveProperty('headcount_min')
  })

  // Théo B r1-recherche.N1 — les objectifs (plusieurs choix) partent au graphe, dans l'ordre choisi.
  it('transmet les objectifs choisis, et rien quand il n’y en a pas', () => {
    expect(graphScopeSelection({ objectives: ['open_account', 'find_decision_makers'] })).toEqual({
      objectives: ['open_account', 'find_decision_makers'],
    })
    expect(graphScopeSelection({ objectives: [] })).toBeUndefined()
  })

  it('transmet l’angle en une phrase', () => {
    expect(graphScopeSelection({ angle: 'Placer deux profils Data' })).toEqual({ angle: 'Placer deux profils Data' })
  })

  it('sans cadrage : clé absente, corps du graphe byte-identique', () => {
    expect(graphScopeSelection(undefined)).toBeUndefined()
    expect(graphScopeSelection({})).toBeUndefined()
  })
})

describe('applyScopeToResearch — ciblé et priorités ORDONNENT le dossier', () => {
  const research = {
    subsidiaries: [{ name: 'Siemens Healthineers' }, { name: 'Siemens Energy' }, { name: 'Siemens Mobility' }],
    angles: [
      { angle: 'Refonte ERP', offer: 'SAP' },
      { angle: 'Modernisation data', offer: 'Data' },
      { angle: 'Renfort SOC', offer: 'Cybersécurité' },
    ],
  }

  it('les entités ciblées passent en tête, sans retirer les autres', () => {
    const out = applyScopeToResearch(research, { included_entities: ['Siemens Mobility'] })
    expect((out?.subsidiaries as { name: string }[]).map(s => s.name)).toEqual([
      'Siemens Mobility',
      'Siemens Healthineers',
      'Siemens Energy',
    ])
  })

  it('« ce que tu vends » place ses angles en tête', () => {
    const out = applyScopeToResearch(research, { selected_angles: ['cybersécurité'] })
    expect((out?.angles as { angle: string }[]).map(a => a.angle)).toEqual([
      'Renfort SOC',
      'Refonte ERP',
      'Modernisation data',
    ])
  })

  it('un thème exclu retire l’angle même s’il était aussi prioritaire ailleurs', () => {
    const out = applyScopeToResearch(research, { selected_angles: ['data'], excluded_angles: ['ERP'] })
    expect((out?.angles as { angle: string }[]).map(a => a.angle)).toEqual(['Modernisation data', 'Renfort SOC'])
  })

  it('rien qui ne corresponde ⇒ même référence (aucune copie inutile)', () => {
    expect(applyScopeToResearch(research, { selected_angles: ['RH'] })).toBe(research)
  })
})

describe('lot 757 — les filiales cochées partent au graphe IA', () => {
  it('transmet contact_entities tel quel ; absent, la clé n’existe pas (corps d’avant)', () => {
    const contact_entities = [{ siren: '500569405', name: 'DECATHLON FRANCE' }]
    expect(graphScopeSelection({ contact_entities })).toEqual({ contact_entities })
    expect(graphScopeSelection({ contact_entities: [] })).toBeUndefined()
  })
})
