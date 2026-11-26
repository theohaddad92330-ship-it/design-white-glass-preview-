import { z } from 'zod'

/**
 * #2433.4 (épopée #2876, lot M10 09/10) — LA CITATION VISUELLE D'UNE IMAGE DU
 * CHAT : une ligne lue (`quote`) et le rectangle où elle se trouve
 * (`bounding_box`, normalisé 0..1, origine en haut à gauche) — produit par
 * `vision_regions.locate_lines` (service IA), le même primitif que le
 * justificatif photo. L'`image_id` est l'image que cette zone cite : l'objet
 * rangé (`chat_image_attachment`) quand le serveur l'a rangé, sinon la pièce
 * de CET onglet.
 */
const chatImageBoundingBoxSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    w: z.number().gt(0).max(1),
    h: z.number().gt(0).max(1),
  })
  // Une zone qui déborde de l'image ne prouve rien : écartée, jamais rognée.
  .refine(box => box.x + box.w <= 1 + 1e-6 && box.y + box.h <= 1 + 1e-6)

const chatImageRegionSchema = z.object({
  quote: z.string().trim().min(1).max(160),
  bounding_box: chatImageBoundingBoxSchema,
})
export type ChatImageRegion = z.infer<typeof chatImageRegionSchema>

export type ChatImageCitation = ChatImageRegion & { image_id: string }

/** Relit les zones rendues par le service IA : une entrée invalide est écartée, jamais corrigée. */
export function parseChatImageRegions(raw: unknown): ChatImageRegion[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(entry => {
    const parsed = chatImageRegionSchema.safeParse(entry)
    return parsed.success ? [parsed.data] : []
  })
}

/** #2433.12 — une cellule LUE (texte) ou VIDE (`null`, #2433.5) : jamais un nombre deviné. */
const chatImageTableSchema = z.object({
  bounding_box: z.unknown().optional(),
  rows: z
    .array(z.array(z.string().max(120).nullable()).min(2).max(10))
    .min(2)
    .max(30)
    .refine(rows => rows.every(row => row.length === rows[0]?.length)),
})

/**
 * #2433.12 (épopée #2876, lot P02 09/10) — les OBJETS d'une image jointe au
 * chat, mesurés par le localiseur (`vision_objects.locate_objects`, service
 * IA) : les BORDS du document (le recadrage PROPOSÉ) et la GRILLE d'un
 * tableau. `null` sur un champ = mesuré, rien trouvé — sans bords, l'image
 * reste entière et l'écran le dit.
 */
export type ChatImageObjects = {
  documentBounds: ChatImageRegion['bounding_box'] | null
  table: { boundingBox: ChatImageRegion['bounding_box'] | null; rows: (string | null)[][] } | null
}

/**
 * Relit les objets rendus par le service IA. `null` = RIEN mesuré (panne, pas
 * une image, salle de démonstration) : l'écran ne dit alors rien. Des bords ou
 * une grille invalides sont écartés, jamais corrigés.
 */
export function parseChatImageObjects(raw: unknown): ChatImageObjects | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const bounds = chatImageBoundingBoxSchema.safeParse(record['document_bounds'])
  const table = chatImageTableSchema.safeParse(record['table'])
  const tableBox = table.success ? chatImageBoundingBoxSchema.safeParse(table.data.bounding_box) : null
  return {
    documentBounds: bounds.success ? bounds.data : null,
    table: table.success ? { boundingBox: tableBox?.success ? tableBox.data : null, rows: table.data.rows } : null,
  }
}

/**
 * #2876 (#2433.4/.12, lot W8) — ce que le message GARDE de la vision d'une image :
 * ses zones lues et ses objets mesurés, relus à la réouverture du fil. Une clé
 * absente = rien de mesuré (jamais `[]`, jamais un objet vide) ; une zone ou une
 * grille invalide est écartée, jamais corrigée.
 */
export type PersistedChatImage = {
  id: string
  name: string
  regions?: ChatImageRegion[]
  objects?: ChatImageObjects
}

/** Au plus autant de zones qu'un tableau en comporte : au-delà, ce n'est plus une preuve cliquable. */
const PERSISTED_REGIONS_MAX = 30

/** Les zones et objets rendus par le navigateur → ce qui peut s'écrire (`{}` si rien n'est mesuré). */
export function persistableImageVision(raw: {
  regions?: unknown
  objects?: unknown
}): Pick<PersistedChatImage, 'regions' | 'objects'> {
  const regions = parseChatImageRegions(raw.regions).slice(0, PERSISTED_REGIONS_MAX)
  const objects = parseChatImageObjects(raw.objects)
  const measured = objects !== null && (objects.documentBounds !== null || objects.table !== null)
  return { ...(regions.length ? { regions } : {}), ...(measured ? { objects } : {}) }
}
