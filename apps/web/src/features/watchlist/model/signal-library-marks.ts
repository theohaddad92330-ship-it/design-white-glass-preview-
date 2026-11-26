import type { LibraryMarks } from './signal-library'

/**
 * Les marques de la personne sur la bibliothèque : « enregistré » et « corbeille ».
 *
 * Elles vivent dans le navigateur, par utilisateur — aucun état serveur n'existe encore pour un signal
 * enregistré ou mis à la corbeille. La clé est préfixée pour être balayée avec le reste du stockage local.
 */
const KEY = 'bellum:signals-library'

export const EMPTY_MARKS: LibraryMarks = { saved: new Set(), trashed: new Set() }

function storageKey(userId: string): string {
  return `${KEY}:${userId}`
}

export function readMarks(userId: string | undefined): LibraryMarks {
  if (!userId) return EMPTY_MARKS
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return EMPTY_MARKS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_MARKS
    const { saved, trashed } = parsed as { saved?: unknown; trashed?: unknown }
    const ids = (value: unknown): Set<string> =>
      new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])
    return { saved: ids(saved), trashed: ids(trashed) }
  } catch {
    return EMPTY_MARKS
  }
}

export function writeMarks(userId: string | undefined, marks: LibraryMarks): void {
  if (!userId) return
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify({ saved: [...marks.saved], trashed: [...marks.trashed] }),
    )
  } catch {
    // Stockage fermé (navigation privée, quota) : les marques vivent le temps de la session.
  }
}

export function withSaved(marks: LibraryMarks, ids: readonly string[], saved: boolean): LibraryMarks {
  const next = new Set(marks.saved)
  for (const id of ids) {
    if (saved) next.add(id)
    else next.delete(id)
  }
  return { ...marks, saved: next }
}

export function withTrashed(marks: LibraryMarks, ids: readonly string[], trashed: boolean): LibraryMarks {
  const next = new Set(marks.trashed)
  for (const id of ids) {
    if (trashed) next.add(id)
    else next.delete(id)
  }
  return { ...marks, trashed: next }
}
