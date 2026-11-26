import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BROWSER_NOTIFICATION_ENABLED_KEY } from '@/features/notifications/browser-channel/browser-notification-channel'
import { useBrowserNotificationChannel } from './useBrowserNotificationChannel'

class FakeNotification {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn(() => Promise.resolve(FakeNotification.permission))
  onclick: (() => void) | null = null
  close = vi.fn()
  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {}
}

function installFakeNotification(permission: NotificationPermission = 'default') {
  FakeNotification.permission = permission
  FakeNotification.requestPermission = vi.fn(() => Promise.resolve(FakeNotification.permission))
  // @ts-expect-error — un global de test, pas le vrai constructeur DOM.
  window.Notification = FakeNotification
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  // @ts-expect-error — symétrique de l'installation ci-dessus.
  delete window.Notification
  vi.restoreAllMocks()
})

/**
 * #1938.3 — le hook derrière Réglages › Notifications › canal navigateur.
 */
describe('useBrowserNotificationChannel', () => {
  it('rend `unsupported` et éteint quand le navigateur n’a pas l’API', () => {
    const { result } = renderHook(() => useBrowserNotificationChannel())
    expect(result.current.permission).toBe('unsupported')
    expect(result.current.enabled).toBe(false)
    expect(result.current.active).toBe(false)
  })

  it('COCHER demande la permission, et le réglage suit ce que le navigateur répond', async () => {
    installFakeNotification('default')
    // Un vrai navigateur tient `Notification.permission` synchronisée avec ce
    // que `requestPermission()` vient de résoudre — la fausse doit le faire
    // aussi, sinon le test ne prouve rien du hook.
    FakeNotification.requestPermission = vi.fn(() => {
      FakeNotification.permission = 'granted'
      return Promise.resolve(FakeNotification.permission)
    })
    const { result } = renderHook(() => useBrowserNotificationChannel())

    await act(async () => {
      const outcome = await result.current.setChannelEnabled(true)
      expect(outcome).toBe('granted')
    })

    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.enabled).toBe(true))
    expect(result.current.active).toBe(true)
    expect(window.localStorage.getItem(BROWSER_NOTIFICATION_ENABLED_KEY)).toBe('1')
  })

  it('un refus (`denied`) NE reste jamais coché — le réglage suit la vérité du navigateur', async () => {
    installFakeNotification('default')
    FakeNotification.requestPermission = vi.fn(() => {
      FakeNotification.permission = 'denied'
      return Promise.resolve(FakeNotification.permission)
    })
    const { result } = renderHook(() => useBrowserNotificationChannel())

    await act(async () => {
      const outcome = await result.current.setChannelEnabled(true)
      expect(outcome).toBe('denied')
    })

    expect(result.current.enabled).toBe(false)
    expect(result.current.active).toBe(false)
  })

  it('DÉCOCHER ne demande JAMAIS la permission — toujours possible', async () => {
    installFakeNotification('granted')
    const { result } = renderHook(() => useBrowserNotificationChannel())
    await act(async () => {
      await result.current.setChannelEnabled(true)
    })
    await waitFor(() => expect(result.current.enabled).toBe(true))

    const calls = FakeNotification.requestPermission.mock.calls.length
    await act(async () => {
      await result.current.setChannelEnabled(false)
    })
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(calls)
    await waitFor(() => expect(result.current.enabled).toBe(false))
  })

  it('deux instances du hook se resynchronisent — le réglage vit hors de React', async () => {
    installFakeNotification('granted')
    const a = renderHook(() => useBrowserNotificationChannel())
    const b = renderHook(() => useBrowserNotificationChannel())

    await act(async () => {
      await a.result.current.setChannelEnabled(true)
    })

    await waitFor(() => expect(b.result.current.enabled).toBe(true))
  })
})
