import type { ChatImageCitation, ChatImageObjects, ChatImageRegion, PersistedChatImage } from '@bellum/contracts'

/**
 * #2433.4 / #2433.12 (lot W8) — LA VISION D'UNE IMAGE DU CHAT, de l'envoi au rechargement.
 *
 * Zones lues et objets mesurés vivaient dans l'état de l'onglet : le message
 * écrit ne gardait que le nom du fichier. Ces deux gestes les font voyager avec
 * lui — et reviennent à l'identique à la réouverture du fil.
 */

type VisionCarrier = {
  imageObjectId?: string
  citations?: ChatImageCitation[]
  objects?: ChatImageObjects
}

export type SentImageVision = {
  id: string
  regions?: ChatImageRegion[]
  objects?: { document_bounds: ChatImageRegion['bounding_box'] | null; table: ChatImageObjects['table'] }
}

/**
 * Ce qui part avec le message : seulement les images RANGÉES par le serveur
 * (`imageObjectId`) — une image qui n'a pas d'identité côté serveur ne peut pas
 * garder de preuve. Aucune entrée vide : « rien de mesuré » ne s'écrit pas.
 */
export function imageVisionToSend(docs: readonly VisionCarrier[]): SentImageVision[] {
  return docs.flatMap(doc => {
    if (!doc.imageObjectId) return []
    const regions = (doc.citations ?? []).map(({ quote, bounding_box }) => ({ quote, bounding_box }))
    const objects = doc.objects
    const hasObjects = objects !== undefined && (objects.documentBounds !== null || objects.table !== null)
    if (regions.length === 0 && !hasObjects) return []
    return [
      {
        id: doc.imageObjectId,
        ...(regions.length ? { regions } : {}),
        ...(hasObjects ? { objects: { document_bounds: objects.documentBounds, table: objects.table } } : {}),
      },
    ]
  })
}

/** Une image relue d'un fil : la pièce cliquable, ses zones citant CETTE image, ses objets. */
export function savedImageAsAttachment(image: PersistedChatImage): {
  id: string
  name: string
  imageObjectId: string
  citations?: ChatImageCitation[]
  objects?: ChatImageObjects
} {
  return {
    id: image.id,
    name: image.name,
    imageObjectId: image.id,
    ...(image.regions?.length ? { citations: image.regions.map(region => ({ ...region, image_id: image.id })) } : {}),
    ...(image.objects ? { objects: image.objects } : {}),
  }
}
