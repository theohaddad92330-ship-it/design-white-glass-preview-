import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GOLDEN_JOURNEYS_X41,
  GOLDEN_JOURNEYS_X41_TOTAL,
  SCENARIOS_2154_X41,
  coveredGoldenJourneyX41Numbers,
} from './golden-journeys-x41.js'

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

describe('registre des golden journeys du lot X41 (21 à 36)', () => {
  it('chaque parcours déclaré a son fichier de test — le registre ne ment pas', () => {
    const missing = GOLDEN_JOURNEYS_X41.filter(entry => !existsSync(join(REPO_ROOT, entry.file)))
    expect(missing.map(entry => `${entry.number} → ${entry.file}`)).toEqual([])
  })

  it('chaque fichier cite SON parcours dans son en-tête : le point #2208.<k> ou « golden journey <n> »', () => {
    for (const entry of GOLDEN_JOURNEYS_X41) {
      const header = readFileSync(join(REPO_ROOT, entry.file), 'utf8').slice(0, 4000)
      const point = `#2208.${Number(entry.issue.replace('#2958.', ''))}`
      expect(
        header.includes(point) || new RegExp(`golden journey ${entry.number}\\b`, 'i').test(header),
        `${entry.file} ne cite ni ${point} ni « golden journey ${entry.number} »`,
      ).toBe(true)
    }
  })

  it('les quinze parcours couverts sont 21-32 et 34-36 — le 29 a sa porte depuis le lot E02', () => {
    expect(coveredGoldenJourneyX41Numbers()).toEqual([21, 22, 23, 24, 27, 28, 29, 30, 31, 32, 34, 35, 36])
    expect(GOLDEN_JOURNEYS_X41_TOTAL).toBe(coveredGoldenJourneyX41Numbers().length)
  })

  it('aucun numéro ne recoupe le registre du lot X40 (1 à 20) ni les parcours déjà livrés (33, 37 à 40)', () => {
    const forbidden = new Set([...Array.from({ length: 20 }, (_, index) => index + 1), 33, 37, 38, 39, 40])
    expect(coveredGoldenJourneyX41Numbers().filter(number => forbidden.has(number))).toEqual([])
  })

  it('un numéro n’apparaît pas deux fois', () => {
    const numbers = GOLDEN_JOURNEYS_X41.map(entry => entry.number)
    expect(new Set(numbers).size).toBe(numbers.length)
  })
})

describe('scénarios #2154.16 à .29 du lot X41', () => {
  it('chaque scénario déclaré a son fichier — le seul absent est « démo » (.26), déjà livré avant ce lot', () => {
    const missing = SCENARIOS_2154_X41.filter(entry => !existsSync(join(REPO_ROOT, entry.file)))
    expect(missing.map(entry => `${entry.point} → ${entry.file}`)).toEqual([])
    expect(SCENARIOS_2154_X41.some(entry => entry.point === '#2154.26')).toBe(false)
  })

  it('chaque fichier cite SON point #2154.<k> dans son en-tête, ou le parcours qui le joue', () => {
    for (const entry of SCENARIOS_2154_X41) {
      const header = readFileSync(join(REPO_ROOT, entry.file), 'utf8').slice(0, 4000)
      expect(header.includes(entry.point), `${entry.file} ne cite pas ${entry.point}`).toBe(true)
    }
  })

  it('couvre .16 à .25 et .27 à .29 : treize points, un par entrée', () => {
    const points = SCENARIOS_2154_X41.map(entry => entry.point)
    expect(new Set(points).size).toBe(points.length)
    expect(points).toEqual([
      ...Array.from({ length: 10 }, (_, index) => `#2154.${index + 16}`),
      '#2154.27',
      '#2154.28',
      '#2154.29',
    ])
  })
})
