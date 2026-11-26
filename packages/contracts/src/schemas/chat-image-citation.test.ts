import { describe, expect, it } from 'vitest'
import { parseChatImageObjects, parseChatImageRegions, persistableImageVision } from './chat-image-citation.js'

/**
 * #2433.4 (épopée #2876, lot M10 09/10) — la citation visuelle d'une image du
 * chat : une ligne LUE et la zone où elle se trouve. Ce qui vient du service
 * IA est relu ici : une zone invalide est ÉCARTÉE, jamais corrigée.
 */
describe('parseChatImageRegions', () => {
  it('garde une zone normalisée valide, avec sa citation', () => {
    const regions = parseChatImageRegions([
      { quote: 'TOTAL 42,00 €', bounding_box: { x: 0.1, y: 0.7, w: 0.5, h: 0.08 } },
    ])
    expect(regions).toEqual([{ quote: 'TOTAL 42,00 €', bounding_box: { x: 0.1, y: 0.7, w: 0.5, h: 0.08 } }])
  })

  it('sait dire NON — hors image, vide, sans citation, ou pas une liste : écarté', () => {
    expect(
      parseChatImageRegions([
        { quote: 'hors image', bounding_box: { x: 0.9, y: 0.1, w: 0.5, h: 0.1 } },
        { quote: 'vide', bounding_box: { x: 0.1, y: 0.1, w: 0, h: 0.1 } },
        { quote: '', bounding_box: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } },
        { bounding_box: { x: 0.1, y: 0.1, w: 0.2, h: 0.1 } },
      ]),
    ).toEqual([])
    expect(parseChatImageRegions('pas une liste')).toEqual([])
    expect(parseChatImageRegions(undefined)).toEqual([])
  })
})

/**
 * #2433.12 (épopée #2876, lot P02 09/10) — les OBJETS d'une image du chat :
 * les bords du document (recadrage proposé) et la grille d'un tableau. Relus
 * ici : jamais un recadrage deviné, jamais une cellule vide devenue « 0 ».
 */
describe('parseChatImageObjects', () => {
  it('garde des bords valides et une grille de cellules lues ou vides', () => {
    expect(
      parseChatImageObjects({
        document_bounds: { x: 0.08, y: 0.05, w: 0.84, h: 0.9 },
        table: {
          bounding_box: null,
          rows: [
            ['Profil', 'TJM'],
            ['Tech lead', null],
          ],
        },
      }),
    ).toEqual({
      documentBounds: { x: 0.08, y: 0.05, w: 0.84, h: 0.9 },
      table: {
        boundingBox: null,
        rows: [
          ['Profil', 'TJM'],
          ['Tech lead', null],
        ],
      },
    })
  })

  it('mesuré sans rien trouver : les deux à null — l’écran dira « image entière »', () => {
    expect(parseChatImageObjects({ document_bounds: null, table: null })).toEqual({
      documentBounds: null,
      table: null,
    })
  })

  it('sait dire NON — bords hors image, grille d’une ligne, cellule non textuelle : écartés', () => {
    expect(
      parseChatImageObjects({
        document_bounds: { x: 0.5, y: 0.1, w: 0.7, h: 0.5 },
        table: { rows: [['seule ligne', 'x']] },
      }),
    ).toEqual({ documentBounds: null, table: null })
    expect(
      parseChatImageObjects({
        table: {
          rows: [
            ['a', 0],
            ['b', 'c'],
          ],
        },
      }),
    ).toEqual({
      documentBounds: null,
      table: null,
    })
    // Rien mesuré (panne, pas une image) : `null`, jamais « bords non détectés ».
    expect(parseChatImageObjects(undefined)).toBeNull()
    expect(parseChatImageObjects('x')).toBeNull()
  })
})

describe('persistableImageVision (#2433.4 / #2433.12, lot W8)', () => {
  const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.1 }

  it('garde les zones valides et les objets mesurés', () => {
    const out = persistableImageVision({
      regions: [{ quote: 'Total', bounding_box: box }],
      objects: { document_bounds: box, table: null },
    })
    expect(out.regions).toHaveLength(1)
    expect(out.objects).toEqual({ documentBounds: box, table: null })
  })

  it('rien de mesuré → aucune clé (jamais [] ni un objet vide)', () => {
    expect(persistableImageVision({})).toEqual({})
    expect(persistableImageVision({ regions: [], objects: { document_bounds: null, table: null } })).toEqual({})
    expect(persistableImageVision({ regions: 'n’importe quoi', objects: 42 })).toEqual({})
  })

  it('plafonne les zones à 30 : au-delà, ce n’est plus une preuve cliquable', () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ quote: `ligne ${i}`, bounding_box: box }))
    expect(persistableImageVision({ regions: many }).regions).toHaveLength(30)
  })
})
