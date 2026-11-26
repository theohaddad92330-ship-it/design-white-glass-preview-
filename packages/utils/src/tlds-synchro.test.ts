import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Lot B2 ci/1-caches — `tlds.generated.ts` est COMMITÉ et le `prebuild` ne le réécrit que s'il change.
 * Cette garde échoue si le fichier commité n'est plus celui que produirait le paquet `tlds` installé :
 * sans elle, un build réécrirait un fichier suivi et le hash turbo différerait d'un job à l'autre.
 */
const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, '..', 'scripts', 'generate-tlds.mjs')
const generated = join(here, 'tlds.generated.ts')

describe('tlds.generated.ts', () => {
  it('est identique à ce que génère le paquet `tlds` installé', () => {
    expect(() => execFileSync('node', [script, '--check'], { stdio: 'pipe' })).not.toThrow()
  })

  it('sait dire NON : une copie périmée fait échouer --check et n’est pas réécrite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tlds-'))
    try {
      const stale = join(dir, 'tlds.generated.ts')
      const perimee = readFileSync(generated, 'utf8').replace('"com"', '"com-perime"')
      writeFileSync(stale, perimee)
      const result = spawnSync('node', [script, '--check', '--target', stale], { encoding: 'utf8' })
      expect(result.status).toBe(1)
      expect(readFileSync(stale, 'utf8')).toBe(perimee)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
