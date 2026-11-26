import type { KeyboardCoordinateGetter } from '@dnd-kit/core'

/**
 * #4339.1 — le glisser-déposer du pipe au CLAVIER. Le capteur clavier de dnd-kit avance de 25 px par flèche : d'une
 * colonne à sa voisine, c'est des dizaines d'appuis. Ici une flèche gauche/droite SAUTE à la colonne voisine
 * (la carte se pose au centre de la colonne, à sa hauteur d'origine) ; Espace/Entrée dépose, Échap annule.
 */
export type StageRect = { id: string; left: number; top: number; width: number; height: number }
type CardRect = { left: number; top: number; width: number; height: number }

export function nextStageCoordinates(
  code: string,
  card: CardRect,
  columns: readonly StageRect[],
): { x: number; y: number } | null {
  if (code !== 'ArrowRight' && code !== 'ArrowLeft') return null
  const cardCenter = card.left + card.width / 2
  const centerOf = (column: StageRect) => column.left + column.width / 2
  const candidates = columns
    .filter(column => (code === 'ArrowRight' ? centerOf(column) > cardCenter + 1 : centerOf(column) < cardCenter - 1))
    .sort((a, b) => Math.abs(centerOf(a) - cardCenter) - Math.abs(centerOf(b) - cardCenter))
  const target = candidates[0]
  if (!target) return null
  return { x: centerOf(target) - card.width / 2, y: card.top }
}

export const pipelineKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const { collisionRect, droppableRects, droppableContainers } = context
  if (!collisionRect) return undefined
  const columns: StageRect[] = []
  for (const container of droppableContainers.getEnabled()) {
    const rect = droppableRects.get(container.id)
    if (rect)
      columns.push({ id: String(container.id), left: rect.left, top: rect.top, width: rect.width, height: rect.height })
  }
  const next = nextStageCoordinates(event.code, collisionRect, columns)
  if (!next) return undefined
  event.preventDefault()
  return { x: next.x, y: next.y }
}
