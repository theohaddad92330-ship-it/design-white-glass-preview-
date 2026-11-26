import { defaultNotificationPreferences, NOTIFICATION_PRESETS, type NotificationPreferences } from '@bellum/contracts'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'
import { useNotificationPreferences } from './useNotificationPreferences'

const apiFetchMock = vi.mocked(apiFetch)

vi.mock('@/lib/hooks/use-session', () => ({
  useSession: () => ({ user: { id: 'u-1', email: 'u@example.com' }, loading: false }),
}))

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

function serverPrefs(overrides: Partial<NotificationPreferences> = {}): NotificationPreferences {
  return { ...defaultNotificationPreferences, ...overrides }
}

/**
 * The UI language is a client-side choice (localStorage), so the server can only
 * learn it if the app reports it. Without that, the Changelog newsletter would
 * have no honest way to pick between the FR and EN labels.
 */
describe('useNotificationPreferences — reporting the email language', () => {
  beforeEach(async () => {
    apiFetchMock.mockReset()
    await i18n.changeLanguage('fr')
  })

  it('reports the UI language when the server does not know it yet', async () => {
    apiFetchMock.mockResolvedValue(serverPrefs({ email_language: null }))

    renderHook(() => useNotificationPreferences(), { wrapper: wrapper() })

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/notifications/preferences',
        method: 'PATCH',
        body: { email_language: 'fr' },
      }),
    )
  })

  it('reports the new language after the user switches to EN', async () => {
    apiFetchMock.mockResolvedValue(serverPrefs({ email_language: 'fr' }))
    await i18n.changeLanguage('en')

    renderHook(() => useNotificationPreferences(), { wrapper: wrapper() })

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/notifications/preferences',
        method: 'PATCH',
        body: { email_language: 'en' },
      }),
    )

    await i18n.changeLanguage('fr')
  })

  it('stays silent when the server already holds the right language', async () => {
    apiFetchMock.mockResolvedValue(serverPrefs({ email_language: 'fr' }))

    const { result } = renderHook(() => useNotificationPreferences(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.preferences.email_language).toBe('fr'))
    expect(apiFetchMock.mock.calls.every(([call]) => call.method === undefined)).toBe(true)
  })
})

/**
 * #1938.6-9 — les présélections. `applyPreset` doit écrire les 7 réglages
 * d'UN COUP (un seul PATCH), jamais un par un : sept PATCH successifs
 * laisseraient une fenêtre où le serveur tient un mélange de deux
 * présélections si l'un d'eux échoue en cours de route.
 */
describe('useNotificationPreferences — présélections (#1938.6-9)', () => {
  beforeEach(() => {
    apiFetchMock.mockReset()
  })

  it('détecte la présélection active depuis les réglages reçus', async () => {
    apiFetchMock.mockResolvedValue(serverPrefs({ ...NOTIFICATION_PRESETS.urgent_only, email_language: 'fr' }))

    const { result } = renderHook(() => useNotificationPreferences(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.activePreset).toBe('urgent_only'))
  })

  it('applyPreset écrit les 7 réglages en UN SEUL PATCH', async () => {
    apiFetchMock.mockResolvedValue(serverPrefs({ email_language: 'fr' }))
    const { result } = renderHook(() => useNotificationPreferences(), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    apiFetchMock.mockClear()
    apiFetchMock.mockResolvedValue(serverPrefs({ ...NOTIFICATION_PRESETS.daily_brief, email_language: 'fr' }))

    result.current.applyPreset('daily_brief')

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith({
        path: '/notifications/preferences',
        method: 'PATCH',
        body: NOTIFICATION_PRESETS.daily_brief,
      }),
    )
    // Un seul appel d'écriture — pas sept.
    expect(apiFetchMock.mock.calls.filter(([call]) => call.method === 'PATCH')).toHaveLength(1)
  })

  it('des réglages qui ne correspondent à aucune présélection nommée se lisent « custom »', async () => {
    // #2082.16 — les DÉFAUTS ne suffisent plus à composer un cas « custom » :
    // depuis qu'aucun envoi n'est coché d'avance, ils égalent « Urgent
    // uniquement ». Un vrai mélange est donc construit ici, explicitement.
    apiFetchMock.mockResolvedValue(serverPrefs({ email_language: 'fr', weekly_digest: true }))

    const { result } = renderHook(() => useNotificationPreferences(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.activePreset).toBe('custom'))
  })

  it('les défauts serveur se lisent « Urgent uniquement » — aucun envoi coché d’avance (#2082.16)', async () => {
    apiFetchMock.mockResolvedValue(serverPrefs({ email_language: 'fr' }))

    const { result } = renderHook(() => useNotificationPreferences(), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.activePreset).toBe('urgent_only'))
  })
})
