import type { AtsStatus } from '@bellum/contracts'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { AtsCard } from './AtsCard'

// #4689 — un seul bouton « Connecter mon BoondManager », aucun champ de secret, trois états NOMMÉS.
const mocks = vi.hoisted(() => ({
  status: undefined as unknown,
  connect: vi.fn(),
  disconnect: vi.fn(),
  verdict: undefined as unknown,
  check: vi.fn(),
}))
vi.mock('../api', () => ({
  useAtsStatus: () => ({ data: mocks.status }),
  useConnectAts: () => ({ mutate: mocks.connect, isPending: false, isError: false, error: null }),
  useDisconnectAts: () => ({ mutate: mocks.disconnect, isPending: false }),
  useTestAts: () => ({ mutate: mocks.check, isPending: false, isError: false, data: mocks.verdict }),
}))

function status(over: Partial<AtsStatus>): AtsStatus {
  return {
    connected: false,
    provider: null,
    authMode: null,
    connectedAt: null,
    fromEnvironment: false,
    lastExchangeAt: null,
    needsReconnect: false,
    scopes: null,
    instanceLabel: null,
    oauthAvailable: true,
    ...over,
  }
}

beforeEach(async () => {
  mocks.connect.mockReset()
  mocks.disconnect.mockReset()
  mocks.check.mockReset()
  mocks.verdict = undefined
  window.history.replaceState({}, '', '/integrations')
  await i18n.changeLanguage('fr')
})

describe('#4689 — AtsCard', () => {
  it('non branché : un bouton « Connecter mon BoondManager », AUCUN champ de saisie', () => {
    mocks.status = status({})
    render(<AtsCard />)
    expect(screen.getByText('Non branché')).toBeInTheDocument()
    expect(document.querySelectorAll('input')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Connecter mon BoondManager' }))
    expect(mocks.connect).toHaveBeenCalledTimes(1)
  })

  it('sans App OAuth configurée : pas de bouton, la phrase dit pourquoi', () => {
    mocks.status = status({ oauthAvailable: false })
    render(<AtsCard />)
    expect(screen.queryByRole('button', { name: /Connecter/ })).not.toBeInTheDocument()
    expect(screen.getByText(/pas encore activée/)).toBeInTheDocument()
  })

  it('branché : la date du dernier échange réussi, et seulement si on la sait', () => {
    mocks.status = status({ connected: true, authMode: 'oauth2', lastExchangeAt: '2026-10-25T08:00:00.000Z' })
    const { unmount } = render(<AtsCard />)
    expect(screen.getByText('Branché')).toBeInTheDocument()
    expect(screen.getByText(/Dernier échange réussi/)).toHaveTextContent('2026')
    unmount()
    mocks.status = status({ connected: true, authMode: 'oauth2', lastExchangeAt: null })
    render(<AtsCard />)
    expect(screen.getByText(/Aucun échange réussi enregistré/)).toBeInTheDocument()
    expect(screen.queryByText(/Dernier échange réussi/)).not.toBeInTheDocument()
  })

  it('à reconnecter : le dit en une phrase et propose « Reconnecter »', () => {
    mocks.status = status({ connected: true, authMode: 'oauth2', needsReconnect: true })
    render(<AtsCard />)
    expect(screen.getByText('À reconnecter')).toBeInTheDocument()
    expect(screen.getByText(/refusé de renouveler l'accès/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reconnecter mon BoondManager' }))
    expect(mocks.connect).toHaveBeenCalledTimes(1)
  })

  it('connexion héritée : « branché (mode jeton, à migrer) »', () => {
    mocks.status = status({ connected: true, authMode: 'user_token' })
    render(<AtsCard />)
    expect(screen.getByText('Branché (mode jeton, à migrer)')).toBeInTheDocument()
  })

  it('ne dit plus « lecture seule » et nomme ce qui peut être écrit, sous quelle porte', () => {
    mocks.status = status({})
    render(<AtsCard />)
    expect(screen.queryByText(/n'y écrit jamais|lecture seule/i)).not.toBeInTheDocument()
    expect(screen.getByText(/second responsable/)).toBeInTheDocument()
  })
  it('#4691.3 — sans deliveries:write, « Créer une mission » et « Corriger un TJM » ne sont pas proposés', () => {
    mocks.status = status({ connected: true, authMode: 'oauth2', scopes: 'opportunities:write' })
    render(<AtsCard />)
    expect(screen.queryByText('Créer une mission')).not.toBeInTheDocument()
    expect(screen.queryByText('Corriger un TJM')).not.toBeInTheDocument()
    expect(screen.getByText("Changer le statut d'un besoin")).toBeInTheDocument()
  })

  it('#4691.3 — avec deliveries:write, ils le sont ; sans aucun scope d’écriture, la carte le dit', () => {
    mocks.status = status({ connected: true, authMode: 'oauth2', scopes: 'deliveries:write opportunities:write' })
    const { unmount } = render(<AtsCard />)
    expect(screen.getByText('Créer une mission')).toBeInTheDocument()
    expect(screen.getByText('Corriger un TJM')).toBeInTheDocument()
    unmount()
    mocks.status = status({ connected: true, authMode: 'oauth2', scopes: 'companies:read' })
    render(<AtsCard />)
    expect(screen.getByText(/Aucune écriture n'est accordée/)).toBeInTheDocument()
  })
})

// #4688.11 — les `meta.warnings` de l'éditeur arrivent à l'écran Intégrations, en FR comme en EN.
describe('#4688.11 — AtsCard : avertissements de l’éditeur', () => {
  const connected = () => status({ connected: true, authMode: 'oauth2', lastExchangeAt: '2026-10-25T08:00:00.000Z' })

  it('branché : « Vérifier la connexion » lance le test', () => {
    mocks.status = connected()
    render(<AtsCard />)
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier la connexion' }))
    expect(mocks.check).toHaveBeenCalledTimes(1)
  })

  it('non branché : aucun bouton de vérification', () => {
    mocks.status = status({})
    render(<AtsCard />)
    expect(screen.queryByRole('button', { name: 'Vérifier la connexion' })).not.toBeInTheDocument()
  })

  it('un avertissement connu est traduit, un inconnu est nommé tel que rendu', () => {
    mocks.status = connected()
    mocks.verdict = { reachable: true, warnings: ['appOauthRedirection', 'someNewWarning'] }
    render(<AtsCard />)
    expect(screen.getByText(/redirection/i)).toBeInTheDocument()
    expect(screen.getByText(/someNewWarning/)).toBeInTheDocument()
    expect(screen.queryByText('appOauthRedirection')).not.toBeInTheDocument()
  })

  it('aucun avertissement rendu : aucune ligne d’avertissement', () => {
    mocks.status = connected()
    mocks.verdict = { reachable: true, warnings: [] }
    render(<AtsCard />)
    expect(screen.queryByText(/avertissement/i)).not.toBeInTheDocument()
  })

  it('EN : l’avertissement connu est lisible en anglais', async () => {
    await i18n.changeLanguage('en')
    mocks.status = connected()
    mocks.verdict = { reachable: true, warnings: ['appOauthRedirection'] }
    render(<AtsCard />)
    expect(screen.getByText(/redirect/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Check the connection' })).toBeInTheDocument()
  })
})
