import { describe, expect, it } from 'vitest'

import { COMMUNES_DEPARTEMENTS } from '../geo/communes-departements.data.js'
import { cityInDepartments, departmentsOfCity, normalizeCityName } from './geo-communes.js'

describe('departmentsOfCity', () => {
  it.each([
    ['Lille', ['59']],
    ['Marcq-en-Barœul', ['59']],
    ['marcq en baroeul', ['59']],
    ['Paris 15e', ['75']],
    ['Paris 15ème arrondissement', ['75']],
    ['Lyon 3e', ['69']],
    ['Marseille 8e', ['13']],
    ['Lens', ['62']],
    ['Saint-Denis', ['11', '30', '93', '974']],
    ['St Denis', ['11', '30', '93', '974']],
    ['  ÉVRY-Courcouronnes ', ['91']],
  ])('%s ⇒ %j', (name, expected) => {
    expect(departmentsOfCity(name)).toEqual(expected)
  })

  it('rend [] pour une ville inconnue, vide ou sans lettre — jamais d’exception', () => {
    expect(departmentsOfCity('Atlantis-sur-Mer')).toEqual([])
    expect(departmentsOfCity('')).toEqual([])
    expect(departmentsOfCity('   ')).toEqual([])
    expect(departmentsOfCity('---')).toEqual([])
  })

  it('« Lens » n’est pas dans le 59', () => {
    expect(departmentsOfCity('Lens')).not.toContain('59')
  })

  it('couvre la Corse et les DROM', () => {
    expect(departmentsOfCity('Ajaccio')).toEqual(['2A'])
    expect(departmentsOfCity('Bastia')).toEqual(['2B'])
    expect(departmentsOfCity('Fort-de-France')).toEqual(['972'])
  })
})

describe('cityInDepartments', () => {
  it('vrai si UN des départements possibles est demandé', () => {
    expect(cityInDepartments('Saint-Denis', ['974'])).toBe(true)
    expect(cityInDepartments('Lille', ['59', '62'])).toBe(true)
  })
  it('faux sinon, et faux pour une ville inconnue ou une liste vide', () => {
    expect(cityInDepartments('Lens', ['59'])).toBe(false)
    expect(cityInDepartments('Atlantis', ['59'])).toBe(false)
    expect(cityInDepartments('Lille', [])).toBe(false)
  })
  it('accepte un code écrit sans zéro initial ou en minuscules', () => {
    expect(cityInDepartments('Bourg-en-Bresse', ['1'])).toBe(true)
    expect(cityInDepartments('Ajaccio', ['2a'])).toBe(true)
  })
})

describe('données générées', () => {
  it('chaque clé est déjà normalisée (point fixe du normaliseur)', () => {
    for (const names of Object.values(COMMUNES_DEPARTEMENTS)) {
      for (const key of names.split('|')) expect(normalizeCityName(key)).toBe(key)
    }
  })
  it('est complète : plus de 30 000 communes, 101 départements', () => {
    const depts = Object.keys(COMMUNES_DEPARTEMENTS)
    expect(depts.length).toBeGreaterThanOrEqual(101)
    const total = depts.reduce((n, d) => n + (COMMUNES_DEPARTEMENTS[d] ?? '').split('|').length, 0)
    expect(total).toBeGreaterThan(30000)
  })
})
