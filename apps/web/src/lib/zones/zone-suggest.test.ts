import { describe, expect, it } from 'vitest'
import { ZONE_COMMUNES, ZONE_DEPARTMENTS, ZONE_REGIONS } from './zone-referential.data'
import {
  suggestCommunes,
  suggestDepartments,
  unrecognizedCity,
  unrecognizedDepartments,
  withDepartmentSuggestion,
} from './zone-suggest'

// #4303 — référentiel STATIQUE (INSEE COG) : départements + régions + communes de plus de 5 000 habitants.
describe('#4303 — le référentiel de zones', () => {
  it('couvre tous les départements et toutes les régions de France', () => {
    expect(ZONE_DEPARTMENTS.length).toBeGreaterThanOrEqual(101)
    expect(ZONE_REGIONS.length).toBeGreaterThanOrEqual(13)
  })

  it('chaque commune pointe un département connu, et chaque département une région connue', () => {
    const deps = new Set(ZONE_DEPARTMENTS.map(d => d[0]))
    const regions = new Set(ZONE_REGIONS.map(r => r[0]))
    expect(ZONE_COMMUNES.every(c => deps.has(c[2]))).toBe(true)
    expect(ZONE_DEPARTMENTS.every(d => regions.has(d[2]))).toBe(true)
  })

  it('porte Paris, Lyon et Marseille comme communes (arrondissements sommés)', () => {
    const labels = ZONE_COMMUNES.map(c => c[1])
    expect(labels).toEqual(expect.arrayContaining(['Paris', 'Lyon', 'Marseille']))
  })
})

describe('#4303.1 — suggestions de ville', () => {
  it('« Lyon » propose Lyon, avec son département et sa région', () => {
    const [first] = suggestCommunes('Lyon')
    expect(first).toMatchObject({ label: 'Lyon', department: '69', region: 'Auvergne-Rhône-Alpes' })
  })

  it('ignore la casse et les accents, et classe le début du nom avant le reste', () => {
    const labels = suggestCommunes('saint etienne').map(s => s.label)
    expect(labels[0]).toBe('Saint-Étienne')
  })

  it('ne propose rien en dessous de deux lettres, ni pour une saisie sans correspondance', () => {
    expect(suggestCommunes('L')).toEqual([])
    expect(suggestCommunes('zzzzqx')).toEqual([])
  })
})

describe('#4303.1 — suggestions de département', () => {
  it('par le code : « 69 » propose le Rhône', () => {
    expect(suggestDepartments('69')[0]).toMatchObject({ kind: 'department', code: '69', label: 'Rhône' })
  })

  it('par le nom, sur le DERNIER élément de la liste saisie', () => {
    expect(suggestDepartments('75, rhô')[0]).toMatchObject({ kind: 'department', code: '69' })
  })

  it('« Auvergne-Rhône-Alpes » propose la région, qui apporte tous ses départements', () => {
    const region = suggestDepartments('auvergne').find(s => s.kind === 'region')
    expect(region?.codes).toEqual(expect.arrayContaining(['69', '01', '63']))
  })

  it('choisir une suggestion remplace le dernier élément et garde les autres', () => {
    expect(withDepartmentSuggestion('75, rhô', ['69'])).toBe('75, 69')
    expect(withDepartmentSuggestion('', ['69', '01'])).toBe('69, 01')
  })
})

// « jamais de recherche silencieuse sur une zone inventée »
describe('#4303.2 — zone non reconnue', () => {
  it('une ville inventée est non reconnue ; une ville du référentiel ne l’est pas', () => {
    expect(unrecognizedCity('Zorglubville')).toBe(true)
    expect(unrecognizedCity('Lyon')).toBe(false)
    expect(unrecognizedCity('  lyon ')).toBe(false)
  })

  it('un champ vide n’est pas une zone inventée', () => {
    expect(unrecognizedCity('')).toBe(false)
    expect(unrecognizedDepartments('')).toEqual([])
  })

  it('liste les départements saisis qui ne sont pas des codes connus', () => {
    expect(unrecognizedDepartments('69, 99, Rhône')).toEqual(['99', 'Rhône'])
    expect(unrecognizedDepartments('75, 92, 2A')).toEqual([])
  })
})
