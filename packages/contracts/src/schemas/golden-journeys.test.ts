import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GOLDEN_JOURNEYS,
  GOLDEN_JOURNEYS_TOTAL,
  coveredGoldenJourneyNumbers,
  goldenJourneysCovered,
} from './golden-journeys.js'

const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..', '..')

describe('registre des golden journeys de #2208', () => {
  it('chaque parcours déclaré a son fichier de test — le registre ne ment pas', () => {
    const missing = GOLDEN_JOURNEYS.filter(entry => !existsSync(join(REPO_ROOT, entry.file)))
    expect(missing.map(entry => `${entry.number} → ${entry.file}`)).toEqual([])
  })

  it('chaque fichier cite SON parcours dans son en-tête : le point #2208.<k> ou « journey <n> »', () => {
    for (const entry of GOLDEN_JOURNEYS) {
      const header = readFileSync(join(REPO_ROOT, entry.file), 'utf8').slice(0, 4000)
      const point = `#2208.${Number(entry.issue.replace('#2958.', ''))}`
      const cites =
        header.includes(point) || new RegExp(`journeys?\\s+(?:\\d+\\s+et\\s+)?${entry.number}\\b`).test(header)
      expect(cites, `${entry.file} ne cite ni ${point} ni « journey ${entry.number} »`).toBe(true)
    }
  })

  it('les vingt-cinq parcours couverts sont les huit existants du 02/10 et les dix-sept du lot X40', () => {
    expect(coveredGoldenJourneyNumbers()).toEqual([
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
      ...[33, 37, 38, 39, 40],
    ])
    expect(coveredGoldenJourneyNumbers().length).toBeLessThan(GOLDEN_JOURNEYS_TOTAL)
  })

  it('sait dire NON : un parcours absent du registre n’est pas couvert, et une liste vide non plus', () => {
    expect(goldenJourneysCovered([1, 2, 21])).toBe(false)
    expect(goldenJourneysCovered([])).toBe(false)
    expect(goldenJourneysCovered([1, 2, 3, 4])).toBe(true)
  })

  it('un numéro n’apparaît pas deux fois pour deux fichiers différents', () => {
    const filesByNumber = new Map<number, Set<string>>()
    for (const entry of GOLDEN_JOURNEYS) {
      filesByNumber.set(entry.number, (filesByNumber.get(entry.number) ?? new Set()).add(entry.file))
    }
    expect([...filesByNumber.values()].every(files => files.size === 1)).toBe(true)
  })
})
