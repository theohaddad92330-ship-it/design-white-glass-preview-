import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import {
  COMPACT_PROJECT_COLUMNS,
  DEFAULT_PROJECT_COLUMNS,
  WIDE_PROJECT_TABLE_MIN_PX,
  canonicalProjectColumns,
  clearStoredProjectColumns,
  readStoredProjectColumns,
  writeStoredProjectColumns,
  type ProjectColumnKey,
} from './project-columns'

/** L'écran est-il assez large pour les neuf colonnes ? Là où `matchMedia` n'existe pas (jsdom) : oui. */
function useIsWideTable(): boolean {
  const read = () =>
    typeof window === 'undefined' || typeof window.matchMedia !== 'function'
      ? true
      : window.matchMedia(`(min-width: ${WIDE_PROJECT_TABLE_MIN_PX}px)`).matches
  const [wide, setWide] = useState(read)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(`(min-width: ${WIDE_PROJECT_TABLE_MIN_PX}px)`)
    const onChange = (event: MediaQueryListEvent) => setWide(event.matches)
    query.addEventListener('change', onChange)
    setWide(query.matches)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return wide
}

/**
 * #4337.1 — le choix des colonnes du tableau des affaires, et le SEUL endroit où il vit (GA-26) : le tableau et le
 * menu « Colonnes » lisent tous deux ce hook. Sans choix enregistré, les défauts suivent la largeur de l'écran.
 */
export function useProjectColumns(): {
  visible: readonly ProjectColumnKey[]
  toggle: (key: ProjectColumnKey, visible: boolean) => void
  reset: () => void
} {
  const userId = useCurrentUserStore(state => state.currentUser?.id ?? null)
  const wide = useIsWideTable()
  const [chosen, setChosen] = useState<ProjectColumnKey[] | null>(() => readStoredProjectColumns(userId))
  const visible = useMemo(() => chosen ?? (wide ? DEFAULT_PROJECT_COLUMNS : COMPACT_PROJECT_COLUMNS), [chosen, wide])

  const toggle = useCallback(
    (key: ProjectColumnKey, show: boolean) => {
      const next = canonicalProjectColumns(show ? [...visible, key] : visible.filter(entry => entry !== key))
      setChosen(next)
      writeStoredProjectColumns(userId, next)
    },
    [userId, visible],
  )

  const reset = useCallback(() => {
    setChosen(null)
    clearStoredProjectColumns(userId)
  }, [userId])

  return { visible, toggle, reset }
}
