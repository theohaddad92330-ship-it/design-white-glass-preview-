import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GoogleStatus } from '@/features/google/api'
import { i18n } from '@/i18n'
import { GoogleWorkspaceCard } from './GoogleWorkspaceCard'

/**
 * #2078.22 / #2078.23 — Réglages › Intégrations : on CHOISIT son niveau à la
 * connexion, on VOIT son niveau une fois connecté, et on élève sans perdre la
 * connexion. Aucune reconnexion ne change le niveau sans un geste qui le dit.
 */

const googleApiMock = vi.hoisted(() => ({
  connections: vi.fn(),
  connectUrl: vi.fn(),
  disconnect: vi.fn(),
}))
const statusMock = vi.hoisted(() => ({ data: undefined as GoogleStatus | undefined }))

vi.mock('@/features/google/api', () => ({ googleApi: googleApiMock }))
vi.mock('@/features/google/hooks/useGoogleStatus', () => ({
  GOOGLE_STATUS_KEY: ['google-status'],
  useGoogleStatus: () => ({ data: statusMock.data, isLoading: false }),
}))
vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u1' } }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const READ_CAPS = {
  calendar: false,
  calendarRead: true,
  gmail: false,
  gmailRead: true,
  gmailDraft: false,
  drive: true,
  sheets: false,
}
const FULL_CAPS = {
  calendar: true,
  calendarRead: true,
  gmail: true,
  gmailRead: true,
  gmailDraft: true,
  drive: true,
  sheets: true,
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

const originalLocation = window.location
beforeAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: { href: '' } })
})
afterAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
})

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  googleApiMock.connectUrl.mockReset().mockResolvedValue({ url: 'https://consent.example/' })
  googleApiMock.disconnect.mockReset()
  googleApiMock.connections.mockReset().mockResolvedValue([])
})

describe('GoogleWorkspaceCard — le niveau d’accès', () => {
  it('propose les deux niveaux avant de connecter, lecture seule cochée', () => {
    statusMock.data = { configured: true, connected: false }
    wrap(<GoogleWorkspaceCard />)
    expect(screen.getByRole('radio', { name: /Lecture seule/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Lecture et écriture/ })).not.toBeChecked()
  })

  it('connecte au niveau LECTURE quand on ne change rien', async () => {
    statusMock.data = { configured: true, connected: false }
    wrap(<GoogleWorkspaceCard />)
    fireEvent.click(screen.getByRole('button', { name: /Connecter Google Workspace/ }))
    await waitFor(() => expect(googleApiMock.connectUrl).toHaveBeenCalledWith('read'))
  })

  it('connecte au niveau LECTURE + ÉCRITURE quand on le choisit', async () => {
    statusMock.data = { configured: true, connected: false }
    wrap(<GoogleWorkspaceCard />)
    fireEvent.click(screen.getByRole('radio', { name: /Lecture et écriture/ }))
    fireEvent.click(screen.getByRole('button', { name: /Connecter Google Workspace/ }))
    await waitFor(() => expect(googleApiMock.connectUrl).toHaveBeenCalledWith('read_write'))
  })

  it('en lecture seule : le niveau est affiché et l’élévation est proposée', async () => {
    statusMock.data = { configured: true, connected: true, capabilities: READ_CAPS, accessLevel: 'read' }
    wrap(<GoogleWorkspaceCard />)
    expect(screen.getByText(/Accès : lecture seule/)).toBeInTheDocument()
    // Les capacités d'écriture éteintes le sont À DESSEIN : pas d'invite
    // « de nouvelles capacités sont disponibles ».
    expect(screen.queryByText(/De nouvelles capacités/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Autoriser l’écriture/ }))
    await waitFor(() => expect(googleApiMock.connectUrl).toHaveBeenCalledWith('read_write'))
  })

  it('en lecture + écriture : le niveau est affiché, aucune élévation proposée', () => {
    statusMock.data = { configured: true, connected: true, capabilities: FULL_CAPS, accessLevel: 'read_write' }
    wrap(<GoogleWorkspaceCard />)
    expect(screen.getByText(/Accès : lecture et écriture/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Autoriser l’écriture/ })).not.toBeInTheDocument()
  })

  it('la reconnexion d’une capacité de LECTURE manquante garde le niveau lecture (aucune élévation implicite)', async () => {
    statusMock.data = {
      configured: true,
      connected: true,
      capabilities: { ...READ_CAPS, drive: false },
      accessLevel: 'read',
    }
    wrap(<GoogleWorkspaceCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Reconnecter' }))
    await waitFor(() => expect(googleApiMock.connectUrl).toHaveBeenCalledWith('read'))
  })

  it('niveau INCONNU sur une connexion existante : l’écriture est proposée et jamais rétrogradée (#2078.22)', async () => {
    statusMock.data = { configured: true, connected: true, capabilities: READ_CAPS, accessLevel: null }
    wrap(<GoogleWorkspaceCard />)
    expect(screen.getByText(/Accès : niveau inconnu/)).toBeInTheDocument()
    // « Autoriser l'écriture » doit être proposé même si le niveau n'est pas
    // littéralement `read` — sinon un refus « autorise l'écriture depuis
    // Intégrations » n'a rien à cliquer.
    fireEvent.click(screen.getByRole('button', { name: /Autoriser l’écriture/ }))
    await waitFor(() => expect(googleApiMock.connectUrl).toHaveBeenCalledWith('read_write'))
  })

  it('la reconnexion d’un niveau INCONNU redemande read_write, jamais une rétrogradation vers read (#2078.22)', async () => {
    statusMock.data = {
      configured: true,
      connected: true,
      capabilities: { ...READ_CAPS, drive: false },
      accessLevel: null,
    }
    wrap(<GoogleWorkspaceCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Reconnecter' }))
    await waitFor(() => expect(googleApiMock.connectUrl).toHaveBeenCalledWith('read_write'))
  })

  it('la reconnexion d’une connexion en écriture ne la rétrograde pas', async () => {
    statusMock.data = {
      configured: true,
      connected: true,
      capabilities: { ...FULL_CAPS, sheets: false },
      accessLevel: 'read_write',
    }
    wrap(<GoogleWorkspaceCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Reconnecter' }))
    await waitFor(() => expect(googleApiMock.connectUrl).toHaveBeenCalledWith('read_write'))
  })
})

describe('GoogleWorkspaceCard — #4546.4 les boîtes', () => {
  it('connecté : les boîtes sont listées et « Ajouter une boîte » redemande le consentement au niveau déjà accordé', async () => {
    statusMock.data = {
      configured: true,
      connected: true,
      accessLevel: 'read_write',
      capabilities: FULL_CAPS,
    }
    googleApiMock.connections.mockResolvedValue([
      {
        id: 'c1',
        accountLabel: 'anne@esn.fr',
        externalAccountId: null,
        connectedAt: null,
        scopes: null,
        capabilities: FULL_CAPS,
        scopeType: 'personal',
      },
    ])
    wrap(<GoogleWorkspaceCard />)
    expect(await screen.findByText('anne@esn.fr')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter une boîte' }))
    await waitFor(() => expect(googleApiMock.connectUrl).toHaveBeenCalledWith('read_write'))
  })

  it('pas connecté : aucune liste de boîtes, aucune lecture de `/google/connections`', () => {
    statusMock.data = { configured: true, connected: false }
    wrap(<GoogleWorkspaceCard />)
    expect(screen.queryByTestId('google-mailboxes')).not.toBeInTheDocument()
    expect(googleApiMock.connections).not.toHaveBeenCalled()
  })
})
