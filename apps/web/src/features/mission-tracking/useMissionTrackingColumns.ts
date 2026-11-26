import { useCallback, useState } from 'react'
import { mergeAddedColumns } from '@/lib/column-preference'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import {
  DEFAULT_MISSION_TRACKING_COLUMNS,
  MISSION_TRACKING_COLUMN_KEYS,
  MISSION_TRACKING_COLUMNS_ADDED_SINCE,
  PINNED_MISSION_TRACKING_COLUMNS,
  isMissionTrackingColumnKey,
  type MissionTrackingColumnKey,
} from './columns'

/** Même forme de clé que `missionColumnsStorageKey` — une PRÉFÉRENCE par
 *  utilisateur sur cette machine, pas un cache de données (GA-42). */
const STORAGE_PREFIX = 'bellum:mission-tracking:columns:'

export function missionTrackingColumnsStorageKey(userId: string): string {
  return STORAGE_PREFIX + userId
}

function canonical(keys: readonly MissionTrackingColumnKey[]): MissionTrackingColumnKey[] {
  const chosen = new Set<MissionTrackingColumnKey>(keys)
  for (const pinned of PINNED_MISSION_TRACKING_COLUMNS) chosen.add(pinned)
  return MISSION_TRACKING_COLUMN_KEYS.filter(key => chosen.has(key))
}

function readStored(userId: string | null): MissionTrackingColumnKey[] | null {
  if (!userId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(missionTrackingColumnsStorageKey(userId))
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const known = parsed.filter(isMissionTrackingColumnKey)
    if (known.length === 0) return null
    // ⚠️ Une préférence enregistrée AVANT qu'une colonne existe ne la contient
    // pas — la rendre telle quelle masquerait la colonne neuve à tous ceux qui
    // ont déjà ouvert l'écran (défaut mesuré le 04/09/2026 sur `/missions`).
    return canonical(mergeAddedColumns(known, MISSION_TRACKING_COLUMNS_ADDED_SINCE, MISSION_TRACKING_COLUMN_KEYS))
  } catch {
    return null
  }
}

function writeStored(userId: string | null, keys: readonly MissionTrackingColumnKey[]): void {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(missionTrackingColumnsStorageKey(userId), JSON.stringify(keys))
  } catch {
    // Stockage plein ou refusé : le choix vit le temps de la session.
  }
}

export function useMissionTrackingColumns(): {
  visible: MissionTrackingColumnKey[]
  isVisible: (key: MissionTrackingColumnKey) => boolean
  toggle: (key: MissionTrackingColumnKey, visible: boolean) => void
  reset: () => void
} {
  const userId = useCurrentUserStore(state => state.currentUser?.id ?? null)
  const [visible, setVisible] = useState<MissionTrackingColumnKey[]>(
    () => readStored(userId) ?? canonical(DEFAULT_MISSION_TRACKING_COLUMNS),
  )

  const apply = useCallback(
    (next: MissionTrackingColumnKey[]) => {
      const ordered = canonical(next)
      setVisible(ordered)
      writeStored(userId, ordered)
    },
    [userId],
  )

  const toggle = useCallback(
    (key: MissionTrackingColumnKey, show: boolean) => {
      if (PINNED_MISSION_TRACKING_COLUMNS.has(key) && !show) return
      setVisible(current => {
        const next = show ? [...current, key] : current.filter(entry => entry !== key)
        const ordered = canonical(next)
        writeStored(userId, ordered)
        return ordered
      })
    },
    [userId],
  )

  const reset = useCallback(() => apply([...DEFAULT_MISSION_TRACKING_COLUMNS]), [apply])
  const isVisible = useCallback((key: MissionTrackingColumnKey) => visible.includes(key), [visible])

  return { visible, isVisible, toggle, reset }
}
