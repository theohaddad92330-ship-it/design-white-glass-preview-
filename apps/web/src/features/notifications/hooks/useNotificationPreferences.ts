import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { defaultNotificationPreferences, detectNotificationPreset, NOTIFICATION_PRESETS } from '@bellum/contracts'
import type { NotificationPreferences, NotificationPresetId, UpdateNotificationPreferences } from '@bellum/contracts'
import { isSupportedLanguage, type SupportedLanguage } from '@/i18n/config'
import { useSession } from '@/lib/hooks/use-session'
import { notificationsApi } from '@/features/notifications/api'

export const NOTIFICATION_PREFERENCES_KEY = ['notification-preferences'] as const

/** i18next may report a region-tagged value (`fr-FR`) — reduce it to a code we ship. */
function activeLanguage(raw: string | undefined): SupportedLanguage {
  const base = (raw ?? '').split('-')[0]
  return isSupportedLanguage(base) ? base : 'fr'
}

/**
 * The authenticated user's notification toggles, with an optimistic
 * `setPreference` that persists via PATCH and rolls back on failure. Falls back
 * to shipped defaults before the first fetch resolves.
 *
 * It also REPORTS the UI language to the server (`email_language`). The language
 * is a client-side choice (localStorage), so without this the API would have no
 * way to know which of the FR/EN changelog labels to put in the Newsletter
 * Changelog. Fire-and-forget, once per change: the hook is mounted app-wide by
 * the sidebar's "Nouveautés" indicator, so it covers users who never open the
 * settings screen.
 */
export function useNotificationPreferences() {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const { i18n } = useTranslation()
  const language = activeLanguage(i18n.language)

  const query = useQuery({
    queryKey: NOTIFICATION_PREFERENCES_KEY,
    queryFn: () => notificationsApi.getPreferences(),
    enabled: !!user,
    staleTime: 60_000,
    placeholderData: defaultNotificationPreferences,
  })

  const mutation = useMutation<
    NotificationPreferences,
    Error,
    UpdateNotificationPreferences,
    { previous: NotificationPreferences | undefined }
  >({
    mutationFn: patch => notificationsApi.updatePreferences(patch),
    onMutate: async patch => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_PREFERENCES_KEY })
      const previous = queryClient.getQueryData<NotificationPreferences>(NOTIFICATION_PREFERENCES_KEY)
      const base = previous ?? defaultNotificationPreferences
      queryClient.setQueryData<NotificationPreferences>(NOTIFICATION_PREFERENCES_KEY, { ...base, ...patch })
      return { previous }
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(NOTIFICATION_PREFERENCES_KEY, context.previous)
    },
    onSuccess: data => {
      queryClient.setQueryData(NOTIFICATION_PREFERENCES_KEY, data)
    },
  })

  const preferences = query.data ?? defaultNotificationPreferences

  // Report the UI language once it actually differs from what the server holds.
  // `isPlaceholderData` guards the pre-fetch defaults (whose `email_language` is
  // `null`), so a boot never fires a PATCH before we know the stored value.
  const mutate = mutation.mutate
  const reported = useRef<SupportedLanguage | null>(null)
  const serverLanguage = query.data?.email_language ?? null
  useEffect(() => {
    if (!user || query.isPlaceholderData || !query.data) return
    if (serverLanguage === language || reported.current === language) return
    reported.current = language
    mutate({ email_language: language })
  }, [user, query.isPlaceholderData, query.data, serverLanguage, language, mutate])

  function setPreference<K extends keyof NotificationPreferences>(key: K, value: boolean): void {
    mutation.mutate({ [key]: value } as UpdateNotificationPreferences)
  }

  /** Théo D settings-compte.N2 — plusieurs réglages en UN SEUL PATCH (les
   *  familles, la plage de tranquillité) : jamais une écriture par clé, qui
   *  laisserait une fenêtre où le serveur tient un mélange. */
  function setPreferences(patch: UpdateNotificationPreferences): void {
    mutation.mutate(patch)
  }

  // #1938.6-9 — la présélection ACTIVE n'est jamais stockée : elle est
  // recalculée depuis les 7 réglages réels à chaque rendu (GA-26 — un second
  // endroit qui la mémoriserait divergerait dès qu'un interrupteur est touché
  // à la main).
  const activePreset: NotificationPresetId = detectNotificationPreset(preferences)

  /** Écrit les 7 réglages d'une présélection nommée en UN SEUL PATCH — jamais
   *  sept appels séparés, qui laisseraient une fenêtre où le serveur tient un
   *  mélange de deux présélections si l'un d'eux échouait en cours de route. */
  function applyPreset(id: Exclude<NotificationPresetId, 'custom'>): void {
    mutation.mutate(NOTIFICATION_PRESETS[id] as UpdateNotificationPreferences)
  }

  return {
    preferences,
    isLoading: query.isLoading,
    isSaving: mutation.isPending,
    setPreference,
    setPreferences,
    activePreset,
    applyPreset,
  }
}
