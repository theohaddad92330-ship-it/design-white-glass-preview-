import { describe, expect, it } from 'vitest'
import { normalizePlaceResolution } from './discover-place-resolution'
import { normalizeDiscoverResponse } from './discover-normalize'

// #4429.6 — la commune corrigée, l'homonyme et l'absence de commune se LISENT sur la réponse.
describe('#4429.6 — résolution du lieu dans Découvrir', () => {
  it('lit la correction par proximité', () => {
    expect(
      normalizePlaceResolution({
        placeResolution: { kind: 'corrected', typed: 'Tolouse', chosen: 'Toulouse', department: 'Haute-Garonne' },
      }),
    ).toEqual({ kind: 'corrected', typed: 'Tolouse', chosen: 'Toulouse', department: 'Haute-Garonne' })
  })

  it('lit l’homonyme et nomme les autres candidates', () => {
    expect(
      normalizePlaceResolution({
        placeResolution: {
          kind: 'homonym',
          typed: 'Saint-Denis',
          chosen: 'Saint-Denis',
          department: 'La Réunion',
          alternatives: [
            { name: 'Saint-Denis', department: 'Seine-Saint-Denis' },
            { name: '', department: 'x' },
          ],
        },
      }),
    ).toEqual({
      kind: 'homonym',
      typed: 'Saint-Denis',
      chosen: 'Saint-Denis',
      department: 'La Réunion',
      alternatives: [{ name: 'Saint-Denis', department: 'Seine-Saint-Denis' }],
    })
  })

  it('lit l’absence de commune', () => {
    expect(normalizePlaceResolution({ placeResolution: { kind: 'none', typed: 'Xyzzy' } })).toEqual({
      kind: 'none',
      typed: 'Xyzzy',
    })
  })

  it('dit NON : sans note, ou illisible, rien n’est inventé', () => {
    expect(normalizePlaceResolution({})).toBeUndefined()
    expect(normalizePlaceResolution(undefined)).toBeUndefined()
    expect(normalizePlaceResolution({ placeResolution: { kind: 'corrected', typed: 'Tolouse' } })).toBeUndefined()
    expect(normalizePlaceResolution({ placeResolution: { kind: 'autre', typed: 'X', chosen: 'Y' } })).toBeUndefined()
  })

  it('la note voyage dans la requête de la réponse normalisée', () => {
    const response = normalizeDiscoverResponse({
      candidates: [],
      query: { placeResolution: { kind: 'none', typed: 'Xyzzy' } },
      degraded: [],
    })
    expect(normalizePlaceResolution(response.query)).toEqual({ kind: 'none', typed: 'Xyzzy' })
  })
})
