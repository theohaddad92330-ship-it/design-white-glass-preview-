import { useCallback, useState } from 'react'
import { getChangelog, LATEST_CHANGELOG_ID, type ChangelogEntry } from '@/features/changelog/changelog-entries'
import { useNotificationPreferences } from '@/features/notifications/hooks/useNotificationPreferences'

const STORAGE_KEY = 'bellum:changelog:last-seen'

function readLastSeen(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

/**
 * Drives the sidebar "Nouveautés" indicator. The highlight dot is real but gated
 * by the `sidebar_changelog` preference (the toggle literally controls whether
 * new items are highlighted in the menu). "Seen" state is persisted per browser
 * in localStorage.
 */
export function useChangelog(): { entries: ChangelogEntry[]; hasUnseen: boolean; markAllSeen: () => void } {
  const { preferences } = useNotificationPreferences()
  const [lastSeen, setLastSeen] = useState<string>(() => readLastSeen())

  const markAllSeen = useCallback(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, LATEST_CHANGELOG_ID)
    } catch {
      // ignore — the dot will simply reappear next mount
    }
    setLastSeen(LATEST_CHANGELOG_ID)
  }, [])

  const hasUnseen = preferences.sidebar_changelog && LATEST_CHANGELOG_ID !== '' && lastSeen !== LATEST_CHANGELOG_ID

  return { entries: getChangelog(), hasUnseen, markAllSeen }
}
