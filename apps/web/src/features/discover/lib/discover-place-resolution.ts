/**
 * #4429.6 — une commune mal orthographiée ou homonyme ne tombe JAMAIS en plein texte en silence.
 *
 * Le moteur (`apps/ia`, `place_resolution.py`) corrige « Tolouse » par proximité sur le référentiel de
 * communes, retient la plus peuplée d'un homonyme, ou dit qu'aucune commune ne correspond : il écrit
 * ce qu'il a fait dans `query.placeResolution`. L'écran LIT et DIT ; une note illisible est absente,
 * jamais devinée.
 */
export type DiscoverPlaceResolution = {
  kind: 'corrected' | 'homonym' | 'none'
  typed: string
  chosen?: string
  department?: string
  alternatives?: { name: string; department: string }[]
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

export function normalizePlaceResolution(
  query: Record<string, unknown> | undefined,
): DiscoverPlaceResolution | undefined {
  const raw = query?.placeResolution
  if (typeof raw !== 'object' || raw === null) return undefined
  const note = raw as Record<string, unknown>
  const typed = text(note.typed)
  if (!typed) return undefined
  if (note.kind === 'none') return { kind: 'none', typed }
  const chosen = text(note.chosen)
  if ((note.kind !== 'corrected' && note.kind !== 'homonym') || !chosen) return undefined
  const department = text(note.department)
  const alternatives = (Array.isArray(note.alternatives) ? note.alternatives : []).flatMap(entry => {
    const other = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {}
    const name = text(other.name)
    const area = text(other.department)
    return name && area ? [{ name, department: area }] : []
  })
  return {
    kind: note.kind,
    typed,
    chosen,
    ...(department ? { department } : {}),
    ...(alternatives.length > 0 ? { alternatives } : {}),
  }
}
