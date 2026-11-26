import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { forgetTabDemoFlag, markTabAsDemo } from '@/features/auth/demo-tab'
import { ImpersonationBanner } from './ImpersonationBanner'

function toBase64Url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function setImpStateCookie(state: { email: string; by: string; exp: number }) {
  document.cookie = `imp_state=${toBase64Url(state)}`
}

function clearImpStateCookie() {
  document.cookie = 'imp_state=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
}

const replaceMock = vi.fn()

function stubLocation(hash: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href: 'http://localhost/', pathname: '/', search: '', hash, replace: replaceMock },
  })
}

describe('ImpersonationBanner', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    replaceMock.mockReset()
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined)
    stubLocation('')
  })

  afterEach(() => {
    clearImpStateCookie()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders nothing when no impersonation cookie is present', () => {
    const { container } = render(<ImpersonationBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the persistent warning banner (FR) with the impersonated email', () => {
    setImpStateCookie({ email: 'jane@corp.fr', by: 'ops@bellum', exp: 9999999999 })
    render(<ImpersonationBanner />)
    expect(screen.getByText(/Tu incarnes/i)).toBeInTheDocument()
    expect(screen.getByText(/jane@corp\.fr/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Quitter' })).toBeInTheDocument()
  })

  it('renders the banner in English when the language is EN', async () => {
    await i18n.changeLanguage('en')
    setImpStateCookie({ email: 'jane@corp.fr', by: 'ops@bellum', exp: 9999999999 })
    render(<ImpersonationBanner />)
    expect(screen.getByText(/You are impersonating/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument()
  })

  it('"Quitter" stops the session and returns to /login', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    setImpStateCookie({ email: 'jane@corp.fr', by: 'ops@bellum', exp: 9999999999 })
    render(<ImpersonationBanner />)

    await userEvent.click(screen.getByRole('button', { name: 'Quitter' }))

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/login'))
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/auth/impersonate/stop'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    )
  })

  it('consumes a token from the URL fragment then reboots as the impersonated user', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    stubLocation('#imp_token=the-token')

    render(<ImpersonationBanner />)

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/auth/impersonate/consume'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: { Authorization: 'Bearer the-token' },
        }),
      ),
    )
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'))
  })

  // SIMON-FIX (vu en passant c) — recette Simon 20/10 : le titre des modales passait SOUS le bandeau
  // d'incarnation (fixe, z 9999). Le bandeau publie sa hauteur : `Dialog` la déduit de sa zone.
  it('publie sa hauteur dans --impersonation-banner-height tant qu’il est affiché, et la retire ensuite', () => {
    setImpStateCookie({ email: 'jane@corp.fr', by: 'ops@bellum', exp: 9999999999 })
    const { unmount } = render(<ImpersonationBanner />)
    expect(document.documentElement.style.getPropertyValue('--impersonation-banner-height')).toMatch(/^\d+px$/)
    unmount()
    expect(document.documentElement.style.getPropertyValue('--impersonation-banner-height')).toBe('')
  })

  // #4608.3 — le bandeau dit la vérité de l'onglet, pas celle du premier rendu.
  describe('#4608.3 — aller-retour par la démonstration', () => {
    afterEach(() => forgetTabDemoFlag())

    it("REFUS : un onglet de démonstration n'affiche JAMAIS « Tu incarnes » (cookie d'incarnation encore posé)", () => {
      setImpStateCookie({ email: 'jane@corp.fr', by: 'ops@bellum', exp: 9999999999 })
      markTabAsDemo()
      const { container } = render(<ImpersonationBanner />)
      expect(container).toBeEmptyDOMElement()
    })

    it('entrer en démo SANS recharger retire le bandeau, en sortir (onglet rendu) le rétablit', async () => {
      setImpStateCookie({ email: 'jane@corp.fr', by: 'ops@bellum', exp: 9999999999 })
      render(<ImpersonationBanner />)
      expect(screen.getByText(/Tu incarnes/i)).toBeInTheDocument()
      act(() => markTabAsDemo())
      await waitFor(() => expect(screen.queryByText(/Tu incarnes/i)).not.toBeInTheDocument())
      act(() => forgetTabDemoFlag())
      await waitFor(() => expect(screen.getByText(/Tu incarnes/i)).toBeInTheDocument())
    })

    it("le cookie d'incarnation disparu pendant la démo : le bandeau ne revient pas à la sortie", async () => {
      setImpStateCookie({ email: 'jane@corp.fr', by: 'ops@bellum', exp: 9999999999 })
      render(<ImpersonationBanner />)
      act(() => markTabAsDemo())
      clearImpStateCookie()
      act(() => forgetTabDemoFlag())
      await waitFor(() => expect(screen.queryByText(/Tu incarnes/i)).not.toBeInTheDocument())
    })
  })
})
