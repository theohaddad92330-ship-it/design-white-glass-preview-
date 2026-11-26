import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoogleStatus } from '@/features/google/api'
import { i18n } from '@/i18n'
import { GoogleConnectNotice } from './GoogleConnectNotice'

/**
 * #2078.23 — une invite de (re)connexion posée dans un écran demande le niveau
 * dont CET écran a besoin, sans jamais rétrograder ni élever en silence.
 */

const connectUrl = vi.hoisted(() => vi.fn())
const statusMock = vi.hoisted(() => ({ data: undefined as GoogleStatus | undefined }))

vi.mock('@/features/google/api', () => ({ googleApi: { connectUrl } }))
vi.mock('@/features/google/hooks/useGoogleStatus', () => ({
  useGoogleStatus: () => ({ data: statusMock.data }),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

const originalLocation = window.location
beforeAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } })
})
afterAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
})

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  connectUrl.mockReset().mockResolvedValue({ url: 'https://consent.example/' })
})

function clickCta(level: 'read' | 'read_write') {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <GoogleConnectNotice message="Il manque un accès." ctaLabel="Connecter" level={level} />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Connecter' }))
}

describe('GoogleConnectNotice — le niveau redemandé', () => {
  it('un écran de LECTURE ne rétrograde pas une connexion en écriture', async () => {
    statusMock.data = { configured: true, connected: true, accessLevel: 'read_write' }
    clickCta('read')
    await waitFor(() => expect(connectUrl).toHaveBeenCalledWith('read_write'))
  })

  it('un écran de LECTURE sans connexion demande la lecture seule', async () => {
    statusMock.data = { configured: true, connected: false }
    clickCta('read')
    await waitFor(() => expect(connectUrl).toHaveBeenCalledWith('read'))
  })

  it('un écran d’ÉCRITURE demande l’écriture, depuis une connexion en lecture', async () => {
    statusMock.data = { configured: true, connected: true, accessLevel: 'read' }
    clickCta('read_write')
    await waitFor(() => expect(connectUrl).toHaveBeenCalledWith('read_write'))
  })
})
