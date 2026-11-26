/**
 * Louis 21/10 — la porte PRINCIPALE « Demander à Laura » de la barre latérale ouvre
 * Laura EN GRAND (`/chat`), jamais la bulle. F1-FIX #4345 l'avait basculée sur la
 * bulle ; #4345 visait les boutons « Demander à Laura » DANS les écrans (vivier,
 * fiche compte…), qui gardent la bulle sur place — eux ne sont pas touchés.
 */
import { fireEvent, screen } from '@testing-library/react'
import { SidebarProvider } from '@bellum/ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { resetLauraIntro, requestLauraOpen } from '@/features/laura/bubble/laura-intro-store'
import { CustomerNavbarBody } from './CustomerNavbarBody'

vi.mock('@/components/sidebar/ThemeToggle', () => ({ ThemeToggle: () => null }))
vi.mock('@/features/laura/bubble/laura-intro-store', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/laura/bubble/laura-intro-store')>()),
  requestLauraOpen: vi.fn(),
}))

const user: SessionUser = {
  id: 'u1',
  email: 'commercial@bellum-ai.com',
  email_confirmed_at: null,
  created_at: '2026-08-28T00:00:00.000Z',
  roles: ['customer'],
}

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(requestLauraOpen).mockClear()
  resetLauraIntro()
})

function renderAt(path: string) {
  window.history.pushState({}, '', path)
  return renderWithRouter(
    <SidebarProvider>
      <CustomerNavbarBody user={user} />
    </SidebarProvider>,
    path,
  )
}

describe('Louis 21/10 — la porte de la barre latérale ouvre Laura en grand', () => {
  it('un clic simple mène à /chat, la bulle n’est pas ouverte', async () => {
    renderAt('/accounts')
    const link = await screen.findByRole('link', { name: 'Demander à Laura' })
    expect(link.getAttribute('href')).toMatch(/^\/chat\?/)
    fireEvent.click(link)
    expect(requestLauraOpen).not.toHaveBeenCalled()
  })

  it('déjà sur /chat, la porte navigue comme avant (Laura EST la page)', async () => {
    renderAt('/chat')
    const link = await screen.findByRole('link', { name: 'Demander à Laura' })
    fireEvent.click(link)
    expect(requestLauraOpen).not.toHaveBeenCalled()
  })
})
