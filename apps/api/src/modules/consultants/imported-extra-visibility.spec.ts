import { importedExtraFor } from './imported-extra-visibility'

describe('importedExtraFor — les colonnes importées d’un consultant', () => {
  it('sortent en visibilité complète', () => {
    expect(importedExtraFor({ 'TJM achat': '420' }, { contacts: true, finance: true })).toEqual({
      extra: { 'TJM achat': '420' },
    })
    expect(importedExtraFor(null, { contacts: true, finance: true })).toEqual({ extra: {} })
  })

  it('ne sortent PAS sous un masque coordonnées ou finance — la clé est absente, pas vidée', () => {
    expect(importedExtraFor({ 'TJM achat': '420' }, { contacts: true, finance: false })).toEqual({})
    expect(importedExtraFor({ Portable: '06' }, { contacts: false, finance: true })).toEqual({})
  })
})
