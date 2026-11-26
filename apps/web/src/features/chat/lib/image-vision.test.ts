import { describe, expect, it } from 'vitest'
import { imageVisionToSend, savedImageAsAttachment } from './image-vision'

const region = { quote: 'Total HT 1 250,00', bounding_box: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 } }

describe('#2433.4 / #2433.12 — la vision d’une image survit à l’envoi et au rechargement', () => {
  it('envoie les zones (sans image_id) et les objets des images RANGÉES par le serveur', () => {
    const sent = imageVisionToSend([
      {
        imageObjectId: 'img-1',
        citations: [{ ...region, image_id: 'img-1' }],
        objects: { documentBounds: { x: 0, y: 0, w: 1, h: 1 }, table: null },
      },
    ])
    expect(sent).toEqual([
      {
        id: 'img-1',
        regions: [region],
        objects: { document_bounds: { x: 0, y: 0, w: 1, h: 1 }, table: null },
      },
    ])
  })

  it('une image non rangée (pas d’imageObjectId) n’envoie rien : la preuve ne peut pas survivre', () => {
    expect(imageVisionToSend([{ citations: [{ ...region, image_id: 'ephemeral:x' }] }])).toEqual([])
  })

  it('une image sans rien de mesuré n’envoie pas d’entrée vide', () => {
    expect(imageVisionToSend([{ imageObjectId: 'img-1' }])).toEqual([])
  })

  it('relit une image sauvegardée avec ses zones citant CETTE image, et ses objets', () => {
    const objects = {
      documentBounds: null,
      table: {
        boundingBox: null,
        rows: [
          ['A', 'B'],
          ['1', null],
        ],
      },
    }
    expect(savedImageAsAttachment({ id: 'img-1', name: 'facture.png', regions: [region], objects })).toEqual({
      id: 'img-1',
      name: 'facture.png',
      imageObjectId: 'img-1',
      citations: [{ ...region, image_id: 'img-1' }],
      objects,
    })
  })

  it('une image d’AVANT cette colonne reste une simple pièce cliquable : aucune clé inventée', () => {
    expect(savedImageAsAttachment({ id: 'img-1', name: 'vieille.png' })).toEqual({
      id: 'img-1',
      name: 'vieille.png',
      imageObjectId: 'img-1',
    })
  })
})
