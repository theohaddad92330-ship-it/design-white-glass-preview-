import { act, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBrowserNotificationChannelEnabled } from './browser-notification-channel'

const relaySpy = vi.fn(() => null)
vi.mock('./BrowserNotificationRelay', () => ({ BrowserNotificationRelay: () => relaySpy() }))

class FakeNotification {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn(() => Promise.resolve(FakeNotification.permission))
}

function installFakeNotification(permission: NotificationPermission) {
  FakeNotification.permission = permission
  // @ts-expect-error — un global de test, pas le vrai constructeur DOM.
  window.Notification = FakeNotification
}

beforeEach(() => {
  window.localStorage.clear()
  relaySpy.mockClear()
})

afterEach(() => {
  // @ts-expect-error — symétrique de l'installation ci-dessus.
  delete window.Notification
  vi.restoreAllMocks()
})

/**
 * #1938.3 — la PORTE : elle ne monte le relais (donc n'appelle jamais
 * `useNotifications()` pour ce canal) que si le réglage ET la permission le
 * permettent tous les deux. C'est ce qui tient « sans permission, chemin
 * byte-identique, zéro appel réseau » — dit ici sans réseau du tout, en ne
 * montant pas le composant qui en ferait un.
 */
describe('BrowserNotificationChannel — la porte', () => {
  it('ne monte PAS le relais sans permission ni réglage', async () => {
    const { BrowserNotificationChannel } = await import('./BrowserNotificationChannel')
    render(<BrowserNotificationChannel />)
    expect(relaySpy).not.toHaveBeenCalled()
  })

  it('ne monte PAS le relais avec la permission seule, réglage éteint', async () => {
    installFakeNotification('granted')
    const { BrowserNotificationChannel } = await import('./BrowserNotificationChannel')
    render(<BrowserNotificationChannel />)
    expect(relaySpy).not.toHaveBeenCalled()
  })

  it('monte le relais quand réglage ET permission sont réunis', async () => {
    installFakeNotification('granted')
    setBrowserNotificationChannelEnabled(true)
    const { BrowserNotificationChannel } = await import('./BrowserNotificationChannel')
    render(<BrowserNotificationChannel />)
    expect(relaySpy).toHaveBeenCalled()
  })

  it('se resynchronise sans recharger — un geste posé ailleurs (Réglages) le fait apparaître', async () => {
    installFakeNotification('granted')
    const { BrowserNotificationChannel } = await import('./BrowserNotificationChannel')
    render(<BrowserNotificationChannel />)
    expect(relaySpy).not.toHaveBeenCalled()

    act(() => setBrowserNotificationChannelEnabled(true))
    await waitFor(() => expect(relaySpy).toHaveBeenCalled())
  })
})
