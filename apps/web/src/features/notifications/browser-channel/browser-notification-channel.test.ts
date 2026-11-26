import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BROWSER_NOTIFICATION_ENABLED_KEY,
  browserNotificationPermission,
  browserNotificationSupport,
  dismissNotificationsProposal,
  isBrowserNotificationChannelEnabled,
  isNotificationsProposalDismissed,
  requestBrowserNotificationPermission,
  setBrowserNotificationChannelEnabled,
  showBrowserNotification,
} from './browser-notification-channel'

/**
 * #1938.3 — LE CANAL NOTIFICATION NAVIGATEUR, sa brique de base.
 *
 * jsdom NE CONNAÎT PAS l'API `Notification` : sans le mock ci-dessous,
 * `browserNotificationSupport()` rendrait toujours `false`, et ces tests
 * prouveraient uniquement le chemin « navigateur incapable », jamais les
 * quatre états réels. D'où `FakeNotification`, posée et retirée à chaque test.
 */
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

function removeNotificationGlobal() {
  // @ts-expect-error — symétrique de l'installation ci-dessus.
  delete window.Notification
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  removeNotificationGlobal()
  vi.restoreAllMocks()
})

describe('#1938.3 — support et permission, sans jamais fabriquer un état', () => {
  it('un navigateur SANS Notification est `unsupported`, pas `default`', () => {
    removeNotificationGlobal()
    expect(browserNotificationSupport()).toBe(false)
    expect(browserNotificationPermission()).toBe('unsupported')
  })

  it('les trois états RÉELS du navigateur sont reportés tels quels', () => {
    for (const permission of ['default', 'granted', 'denied'] as const) {
      installFakeNotification(permission)
      expect(browserNotificationSupport()).toBe(true)
      expect(browserNotificationPermission()).toBe(permission)
    }
  })
})

describe('#1938.3 — le réglage : PAR NAVIGATEUR, éteint par défaut', () => {
  it('rend `false` quand rien n’a jamais été écrit — jamais une exception', () => {
    expect(isBrowserNotificationChannelEnabled()).toBe(false)
  })

  it('écrire puis lire retrouve exactement ce qui a été posé', () => {
    setBrowserNotificationChannelEnabled(true)
    expect(isBrowserNotificationChannelEnabled()).toBe(true)
    setBrowserNotificationChannelEnabled(false)
    expect(isBrowserNotificationChannelEnabled()).toBe(false)
  })

  it('un `localStorage` qui lève (mode privé, quota) ne fait jamais planter la lecture ni l’écriture', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(isBrowserNotificationChannelEnabled()).toBe(false)
    getSpy.mockRestore()
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => setBrowserNotificationChannelEnabled(true)).not.toThrow()
    setSpy.mockRestore()
  })

  it('la clé de stockage est nommée et propre au produit — pas un littéral recopié ailleurs', () => {
    setBrowserNotificationChannelEnabled(true)
    expect(window.localStorage.getItem(BROWSER_NOTIFICATION_ENABLED_KEY)).toBeTruthy()
  })
})

describe('#1938.3 — demander la permission : jamais sans navigateur capable', () => {
  it('rend `unsupported` sans appeler quoi que ce soit si l’API est absente', async () => {
    removeNotificationGlobal()
    await expect(requestBrowserNotificationPermission()).resolves.toBe('unsupported')
  })

  it('relaie exactement ce que le navigateur répond', async () => {
    installFakeNotification('default')
    FakeNotification.requestPermission = vi.fn(() => Promise.resolve('granted' as NotificationPermission))
    await expect(requestBrowserNotificationPermission()).resolves.toBe('granted')
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)
  })
})

describe('#1938.3 — montrer une notification : dégradation STRICTE sans permission ni réglage', () => {
  it('sans l’API du tout : aucune exception, et rien à observer', () => {
    removeNotificationGlobal()
    expect(() => showBrowserNotification({ title: 'x', body: 'y', tag: 'z' })).not.toThrow()
  })

  it('permission accordée mais réglage ÉTEINT : aucune notification ne se construit', () => {
    installFakeNotification('granted')
    setBrowserNotificationChannelEnabled(false)
    const ctor = vi.fn()
    class Spy extends FakeNotification {
      constructor(title: string, options?: NotificationOptions) {
        super(title, options)
        ctor(title, options)
      }
    }
    // @ts-expect-error — même substitution que `installFakeNotification`.
    window.Notification = Spy
    Spy.permission = 'granted'
    showBrowserNotification({ title: 'x', body: 'y', tag: 'z' })
    expect(ctor).not.toHaveBeenCalled()
  })

  it('réglage allumé mais permission PAS `granted` : aucune notification ne se construit', () => {
    installFakeNotification('default')
    setBrowserNotificationChannelEnabled(true)
    const ctor = vi.fn()
    class Spy extends FakeNotification {
      constructor(title: string, options?: NotificationOptions) {
        super(title, options)
        ctor(title, options)
      }
    }
    Spy.permission = 'default'
    // @ts-expect-error — même substitution que `installFakeNotification`.
    window.Notification = Spy
    showBrowserNotification({ title: 'x', body: 'y', tag: 'z' })
    expect(ctor).not.toHaveBeenCalled()
  })

  it('permission accordée ET réglage allumé : la notification native part, avec son titre et son clic', () => {
    installFakeNotification('granted')
    setBrowserNotificationChannelEnabled(true)
    const onClick = vi.fn()
    const captured = vi.fn()
    class Spy extends FakeNotification {
      constructor(title: string, options?: NotificationOptions) {
        super(title, options)
        captured(this)
      }
    }
    Spy.permission = 'granted'
    // @ts-expect-error — même substitution que `installFakeNotification`.
    window.Notification = Spy
    showBrowserNotification({ title: 'Signal détecté', body: 'Corp X', tag: 'abc', onClick })
    expect(captured).toHaveBeenCalledTimes(1)
    const created = captured.mock.calls[0][0] as FakeNotification
    expect(created.title).toBe('Signal détecté')
    expect(created.options?.body).toBe('Corp X')
    created.onclick?.()
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('un fournisseur (le navigateur lui-même) qui lève à la construction ne remonte JAMAIS à l’appelant', () => {
    installFakeNotification('granted')
    setBrowserNotificationChannelEnabled(true)
    class Throws {
      static permission: NotificationPermission = 'granted'
      static requestPermission = vi.fn()
      constructor() {
        throw new Error('permission revoked mid-flight')
      }
    }
    // @ts-expect-error — même substitution que `installFakeNotification`.
    window.Notification = Throws
    expect(() => showBrowserNotification({ title: 'x', body: 'y', tag: 'z' })).not.toThrow()
  })
})

// #2082.1 — la proposition (jalon `dossier_viewed`) : refusable, ne revient
// pas si refusée. Persistée au même endroit que le réglage du canal — PAR
// NAVIGATEUR, comme `Notification.permission` elle-même (voir le commentaire
// d'en-tête du module) — jamais côté compte.
describe('#2082.1 — la proposition de notifications : refusable, ne revient jamais si refusée', () => {
  it("n'est pas rejetée par défaut", () => {
    expect(isNotificationsProposalDismissed()).toBe(false)
  })

  it('reste rejetée après un refus — persistée, pas seulement en mémoire', () => {
    dismissNotificationsProposal()
    expect(isNotificationsProposalDismissed()).toBe(true)
  })

  it('un `localStorage` bloqué (mode privé, quota) rend `false`, jamais une exception', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => isNotificationsProposalDismissed()).not.toThrow()
    expect(isNotificationsProposalDismissed()).toBe(false)
    getItem.mockRestore()
  })
})
