import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Cloud } from 'lucide-react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { OAuthProviderCard } from './OAuthProviderCard'

/**
 * Le défaut d'origine (P13) : `disconnect()` est typé `Promise<void>` côté web
 * et jette la réponse de l'API. Deux fournisseurs (Salesforce, Pipedrive —
 * commit d97ba6b1) rendent désormais `{ revoked, warning }` au lieu d'un 204
 * muet quand le fournisseur n'a pas confirmé la révocation server-side — mais
 * rien ne l'affichait : l'écran disait « déconnecté » exactement comme quand
 * tout allait bien.
 *
 * Ce que ces tests tiennent : la réponse remonte jusqu'à l'écran QUAND elle
 * existe, un fournisseur qui rend encore un 204 vide ne se voit jamais prêter
 * un avertissement qu'il n'a pas rendu, et l'avertissement n'est JAMAIS
 * confondu avec une erreur — la déconnexion a réussi côté Bellum, ce n'est
 * pas un échec.
 */

// `vi.mock` is hoisted above imports/top-level `const`s — `vi.hoisted` is the
// documented escape hatch to share a reference between the factory and the
// assertions below.
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

const BASE_PROPS = {
  icon: Cloud,
  name: 'Salesforce',
  description: 'Exporte tes contacts qualifiés.',
  statusKey: ['salesforce', 'status'] as const,
  status: { configured: true, connected: true, accountLabel: 'acme.my.salesforce.com' },
  isLoading: false,
  accountFallback: 'Org Salesforce',
}

const REVOCATION_UNCONFIRMED_WARNING =
  "L'accès a été retiré de Bellum ; le fournisseur n'a pas confirmé la révocation — retire-le aussi depuis ton compte."

describe('OAuthProviderCard — la réponse de déconnexion remonte à l’écran', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    toastMock.success.mockClear()
    toastMock.error.mockClear()
    toastMock.warning.mockClear()
  })

  it('affiche l’avertissement du fournisseur — jamais en erreur — quand la révocation n’a pas été confirmée', async () => {
    const disconnect = vi.fn().mockResolvedValue({ revoked: false, warning: REVOCATION_UNCONFIRMED_WARNING })
    wrap(<OAuthProviderCard {...BASE_PROPS} api={{ connectUrl: vi.fn(), disconnect }} />)

    fireEvent.click(screen.getByText('Déconnecter'))

    await waitFor(() => expect(disconnect).toHaveBeenCalled())
    await waitFor(() =>
      expect(toastMock.warning).toHaveBeenCalledWith(REVOCATION_UNCONFIRMED_WARNING, expect.anything()),
    )
    // Le registre n'est PAS une erreur : la déconnexion a réussi côté Bellum,
    // un toast rouge ferait croire qu'il faut recommencer.
    expect(toastMock.error).not.toHaveBeenCalled()
    expect(toastMock.success).not.toHaveBeenCalled()
  })

  it('affiche le succès normal, sans rien d’anormal, quand la révocation est confirmée', async () => {
    const disconnect = vi.fn().mockResolvedValue({ revoked: true, warning: null })
    wrap(<OAuthProviderCard {...BASE_PROPS} api={{ connectUrl: vi.fn(), disconnect }} />)

    fireEvent.click(screen.getByText('Déconnecter'))

    await waitFor(() => expect(disconnect).toHaveBeenCalled())
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
    expect(toastMock.warning).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('n’invente aucun avertissement pour un fournisseur qui rend encore un 204 vide (non converti)', async () => {
    // `apiFetch` rend `undefined` sur un 204 — c'est la forme exacte que
    // reçoit aujourd'hui `attioApi.disconnect()` (API non convertie).
    const disconnect = vi.fn().mockResolvedValue(undefined)
    wrap(<OAuthProviderCard {...BASE_PROPS} api={{ connectUrl: vi.fn(), disconnect }} />)

    fireEvent.click(screen.getByText('Déconnecter'))

    await waitFor(() => expect(disconnect).toHaveBeenCalled())
    await waitFor(() => expect(toastMock.success).toHaveBeenCalled())
    expect(toastMock.warning).not.toHaveBeenCalled()
  })

  it('signale une erreur claire — jamais confondue avec un avertissement — sur un échec réseau de la déconnexion', async () => {
    const disconnect = vi.fn().mockRejectedValue(new Error('network down'))
    wrap(<OAuthProviderCard {...BASE_PROPS} api={{ connectUrl: vi.fn(), disconnect }} />)

    fireEvent.click(screen.getByText('Déconnecter'))

    await waitFor(() => expect(disconnect).toHaveBeenCalled())
    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(toastMock.warning).not.toHaveBeenCalled()
    expect(toastMock.success).not.toHaveBeenCalled()
  })
})

/** Le filtre « Branchés » et la carte lisent le MÊME état : HubSpot listé « Branché » ne propose pas « Connecter ». */
describe('OAuthProviderCard — même état que le filtre « Branchés »', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })
  const api = { connectUrl: vi.fn(), disconnect: vi.fn() }

  it('registre « connecté » + /status non connecté : la carte est branchée, pas « Connecter »', () => {
    wrap(
      <OAuthProviderCard {...BASE_PROPS} state="connected" status={{ configured: true, connected: false }} api={api} />,
    )
    expect(screen.queryByText(/Connecter Salesforce/)).not.toBeInTheDocument()
    expect(screen.getByText('Déconnecter')).toBeInTheDocument()
  })
  it('SAIT DIRE NON : registre « à brancher » → « Connecter », même si /status dit connecté', () => {
    wrap(<OAuthProviderCard {...BASE_PROPS} state="available" api={api} />)
    expect(screen.getByText(/Connecter Salesforce/)).toBeInTheDocument()
    expect(screen.queryByText('Déconnecter')).not.toBeInTheDocument()
  })
})
