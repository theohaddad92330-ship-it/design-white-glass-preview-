import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import pkg from '../../package.json'
import versionJson from '../../generated/version.json'
import { buildVersionStamp, describeVersionChange, type VersionStamp } from './version'
import { readShortSha } from './version-git'

describe('readShortSha', () => {
  it('lit le sha court du HEAD git de ce dépôt', () => {
    const sha = readShortSha()
    expect(sha).toMatch(/^[0-9a-f]{7,12}$/)
  })

  it('sait dire NON : un dossier sans dépôt git rend « inconnu », jamais une exception ni un sha inventé', () => {
    // `os.tmpdir()` n'est pas un dépôt git (ou, au pire, un dépôt SANS COMMIT) —
    // dans les deux cas `git rev-parse` échoue, et la fonction ne doit ni
    // lever, ni deviner une valeur.
    expect(readShortSha(tmpdir())).toBe('inconnu')
  })
})

describe('buildVersionStamp', () => {
  it('porte le sha, une date ISO et le nombre de specs, tels que reçus', () => {
    const now = new Date('2026-09-25T10:00:00.000Z')
    const stamp = buildVersionStamp(158, 'abc1234', now)
    expect(stamp).toEqual({ sha: 'abc1234', date: '2026-09-25T10:00:00.000Z', specCount: 158 })
  })
})

describe('describeVersionChange — la comparaison au tampon présent', () => {
  const next = { sha: 'def5678', date: '2026-09-26T08:00:00.000Z', specCount: 160 }

  it('aucun tampon présent : première synchronisation', () => {
    expect(describeVersionChange(null, next)).toBe('Version def5678 (160 specs) — première synchronisation.')
  })

  it('même sha, même nombre de specs : déjà à jour', () => {
    expect(describeVersionChange(next, next)).toBe('Version def5678 (160 specs) — déjà à jour.')
  })

  it('sha ou nombre de specs différents : montre les DEUX tampons, jamais un écrasement muet', () => {
    const previous = { sha: 'abc1234', date: '2026-09-25T10:00:00.000Z', specCount: 158 }
    expect(describeVersionChange(previous, next)).toBe('Version abc1234 → def5678 (158 → 160 specs).')
  })
})

describe('generated/version.json — le tampon commité', () => {
  // Pas d'égalité au registre ici : `sha`, `date` ET `specCount` bougent dès qu'une
  // autre PR ajoute une spec — un compte figé dans le dépôt serait rouge sur chaque
  // PR concurrente sans rien garder. La fraîcheur est garantie ailleurs : `build`
  // relance `extract` avant de compiler (test ci-dessous), donc le plugin que l'on
  // charge dans Figma porte toujours le tampon du code qu'il dessine.
  const version = versionJson as VersionStamp

  it('a la forme d’un tampon : sha non vide, date ISO valide', () => {
    expect(typeof version.sha).toBe('string')
    expect(version.sha.length).toBeGreaterThan(0)
    expect(Number.isNaN(Date.parse(version.date))).toBe(false)
  })

  it('specCount est un compte plausible (entier positif)', () => {
    expect(Number.isInteger(version.specCount)).toBe(true)
    expect(version.specCount).toBeGreaterThan(0)
  })

  it('`build` relance `extract` AVANT de compiler — le tampon chargé dans Figma est frais', () => {
    const build = pkg.scripts.build
    expect(build.indexOf('src/extract/cli.ts')).toBeGreaterThanOrEqual(0)
    expect(build.indexOf('src/extract/cli.ts')).toBeLessThan(build.indexOf('scripts/build.ts'))
  })
})
