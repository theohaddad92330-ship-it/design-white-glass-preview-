import { describe, expect, it } from 'vitest'
import { listIaTestFiles, planIaShards } from '../../../../tools/ci/shard-ia.mjs'

describe('shard-ia — la somme des paquets est exactement la suite pytest', () => {
  // #4869.3 — test-ia en 3 paquets : aucun fichier perdu, aucun doublon.
  it('partitionne le disque réel de apps/ia sans perte ni doublon', () => {
    const files = listIaTestFiles()
    expect(files.length).toBeGreaterThan(1000)
    const shards = planIaShards(files, 3)
    const all = shards.flat()
    expect(all.length).toBe(files.length)
    expect(new Set(all).size).toBe(files.length)
    expect([...all].sort()).toEqual(files.map(f => f.path).sort())
    for (const shard of shards) expect(shard.length).toBeGreaterThan(0)
  })
  it('équilibre la taille (écart < 15 % du plus chargé)', () => {
    const files = listIaTestFiles()
    const size = new Map(files.map(f => [f.path, f.size]))
    const loads = planIaShards(files, 3).map(s => s.reduce((n, p) => n + (size.get(p) ?? 0), 0))
    expect((Math.max(...loads) - Math.min(...loads)) / Math.max(...loads)).toBeLessThan(0.15)
  })
  it('est déterministe', () => {
    const files = listIaTestFiles()
    expect(planIaShards(files, 3)).toEqual(planIaShards([...files].reverse(), 3))
  })
  it('un paquet de plus que de fichiers laisse des paquets vides (jamais de fichier dupliqué)', () => {
    const two = [
      { path: 'a.py', size: 1 },
      { path: 'b.py', size: 1 },
    ]
    const shards = planIaShards(two, 3)
    expect(shards.flat().sort()).toEqual(['a.py', 'b.py'])
  })
})
