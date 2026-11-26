import type { AccountContactsPerimeterResponse, ContactPerimeter } from '@bellum/contracts'

/**
 * #4996 L4 — le filtre « mon périmètre » d'un contact de compte groupe. Noyau PUR : le service lit les zones, ce
 * fichier décide. Le périmètre filtre et ordonne, il n'écrit rien et ne borne aucun geste (c76).
 *
 * Un contact est DANS le périmètre quand son entité est une zone du lecteur, quand il n'a pas d'entité (on ne sait
 * pas où il est : une absence ne l'écarte pas) ou quand son entité est celle « par défaut » (« Périmètre non
 * déterminé »). Une zone en texte libre n'arrive jamais ici : elle ne filtre rien (#3895).
 */
export function applyContactPerimeter<Row extends { entity_id: string | null }>(
  rows: Row[],
  input: { mode: ContactPerimeter; zoneEntityIds: string[]; defaultEntityIds: string[] },
): AccountContactsPerimeterResponse<Row> {
  // Sans zone d'entité : aucun filtre, aucun compteur.
  if (input.zoneEntityIds.length === 0) return { contacts: rows, outside_perimeter_count: null }
  const zones = new Set(input.zoneEntityIds)
  const neutral = new Set(input.defaultEntityIds)
  const isMine = (row: Row) => row.entity_id !== null && zones.has(row.entity_id)
  const isInside = (row: Row) => isMine(row) || row.entity_id === null || neutral.has(row.entity_id)
  const outside = rows.filter(row => !isInside(row)).length
  if (input.mode === 'mine') {
    // « ma zone d'abord » : stable, l'ordre d'origine tient à l'intérieur de chaque groupe.
    const inside = rows.filter(isInside)
    return {
      contacts: [...inside.filter(isMine), ...inside.filter(row => !isMine(row))],
      outside_perimeter_count: outside,
    }
  }
  return { contacts: [...rows.filter(isMine), ...rows.filter(row => !isMine(row))], outside_perimeter_count: outside }
}
