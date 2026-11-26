import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserChannelSection } from './BrowserChannelSection'

class FakeNotification {
  static permission: NotificationPermission = 'default'
  static requestPermission = vi.fn(() => {
    FakeNotification.permission = 'granted'
    return Promise.resolve(FakeNotification.permission)
  })
}

function installFakeNotification(permission: NotificationPermission) {
  FakeNotification.permission = permission
  FakeNotification.requestPermission = vi.fn(() => {
    FakeNotification.permission = 'granted'
    return Promise.resolve(FakeNotification.permission)
  })
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
 * #1938.3 — les QUATRE états, à l'écran. Aucun ne se confond avec « 0 » : les
 * deux états bloqués (`unsupported`, `denied`) remplacent l'interrupteur par
 * une phrase, jamais un interrupteur simplement désactivé qui ressemblerait à
 * « éteint ».
 */
describe('BrowserChannelSection', () => {
  it('navigateur sans l’API : aucun interrupteur, une phrase distincte', () => {
    render(<BrowserChannelSection />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByText('Indisponible')).toBeInTheDocument()
    expect(screen.getByText(/rien à activer ici/i)).toBeInTheDocument()
  })

  it('`default` (jamais demandé) : un interrupteur, éteint', () => {
    installFakeNotification('default')
    render(<BrowserChannelSection />)
    expect(screen.getByRole('switch')).not.toBeChecked()
  })

  it('cocher demande la permission — le SEUL geste qui le fait', async () => {
    installFakeNotification('default')
    render(<BrowserChannelSection />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('switch'))
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked())
  })

  it('`denied` : aucun interrupteur, jamais un geste qui redemande', () => {
    installFakeNotification('denied')
    render(<BrowserChannelSection />)
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.getByText('Refusée')).toBeInTheDocument()
    expect(screen.getByText(/ce choix ne se rouvre pas depuis cette page/i)).toBeInTheDocument()
  })
})
