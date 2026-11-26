import { describe, expect, it } from 'vitest'
import { compter, trierFichiers, type FichierDrive } from './drive-interne.logic'

const f = (name: string, status: FichierDrive['status']): FichierDrive => ({
  name,
  path: `Partagé / ${name}`,
  status,
  modifiedTime: '2026-10-04T08:00:00.000Z',
  syncedAt: '2026-10-04T09:00:00.000Z',
  chunkCount: 1,
  errorMessage: null,
})

describe('#3586 — Drive interne dans le DM', () => {
  it('erreurs en tête, puis ignorés, indexés, archivés ; alphabétique à rang égal', () => {
    const out = trierFichiers([
      f('b', 'indexed'),
      f('z', 'archived'),
      f('a', 'error'),
      f('c', 'ignored'),
      f('a2', 'indexed'),
    ])
    expect(out.map(x => x.name)).toEqual(['a', 'c', 'a2', 'b', 'z'])
  })

  it('ne mute pas l’entrée', () => {
    const input = [f('b', 'indexed'), f('a', 'error')]
    trierFichiers(input)
    expect(input[0]?.name).toBe('b')
  })

  it('absence ≠ 0 : un compteur manquant ou null se dit « — », un vrai 0 reste 0', () => {
    expect(compter(null)).toBe('—')
    expect(compter(undefined)).toBe('—')
    expect(compter(0)).toBe('0')
    expect(compter(12)).toBe('12')
  })
})
