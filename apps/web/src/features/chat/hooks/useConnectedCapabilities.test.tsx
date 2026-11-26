import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const registry = vi.fn()

vi.mock('@/features/integration-center/api', () => ({
  integrationCenterApi: { registry: (...args: unknown[]) => registry(...args) },
  TOOL_REGISTRY_KEY: ['tool-registry'],
}))

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: { id: 'u-1' } }) }))

import { useConnectedCapabilities } from './useConnectedCapabilities'

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

/** Un outil minimal du registre — seuls `family` et `status` comptent ici. */
function tool(family: string, status: string) {
  return { provider: `${family}-provider`, family, status, display_name: `${family} vendor` }
}

/**
 * #1791.1 — le menu « désigner un connecteur » de la barre de saisie lit le
 * même registre que Réglages › Intégrations, agrégé par FAMILLE (jamais par
 * éditeur, GA-44) et réduit aux connexions VIVANTES.
 */
describe('useConnectedCapabilities', () => {
  beforeEach(() => registry.mockReset())

  it('ne retient que les familles connectées ou à reconnecter', async () => {
    registry.mockResolvedValue([
      tool('crm', 'connected'),
      tool('email', 'action_required'),
      tool('calendar', 'available'),
      tool('ats', 'coming_soon'),
    ])
    const { result } = renderHook(() => useConnectedCapabilities(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.families).toEqual(['crm', 'email'])
  })

  it('dédoublonne deux outils de la MÊME famille en une seule entrée', async () => {
    registry.mockResolvedValue([tool('crm', 'connected'), tool('crm', 'connected')])
    const { result } = renderHook(() => useConnectedCapabilities(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.families).toEqual(['crm'])
  })

  it("rend l'ordre STABLE de toolFamilyValues, pas l'ordre d'arrivée du registre", async () => {
    registry.mockResolvedValue([tool('finance', 'connected'), tool('crm', 'connected'), tool('email', 'connected')])
    const { result } = renderHook(() => useConnectedCapabilities(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.families).toEqual(['crm', 'email', 'finance'])
  })

  it('rend une liste VIDE — jamais une erreur — quand rien n’est connecté', async () => {
    registry.mockResolvedValue([])
    const { result } = renderHook(() => useConnectedCapabilities(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.families).toEqual([])
    expect(result.current.tools).toEqual([])
  })

  /**
   * #1912.11 — décision Louis 13/09/2026, batch 11 : l'outil que l'espace a
   * BRANCHÉ se nomme dans la saisie de Laura ; notre fournisseur jamais, même
   * quand une clé serveur le fait remonter « connecté » dans le registre.
   */
  it('rend les outils BRANCHÉS par l’espace sous leur nom, jamais nos fournisseurs', async () => {
    registry.mockResolvedValue([
      { provider: 'hubspot', family: 'crm', status: 'connected', display_name: 'HubSpot' },
      { provider: 'dropcontact', family: 'prospection', status: 'connected', display_name: 'Dropcontact' },
      { provider: 'gmail', family: 'email', status: 'available', display_name: 'Gmail' },
    ])
    const { result } = renderHook(() => useConnectedCapabilities(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tools).toEqual([{ provider: 'hubspot', family: 'crm', name: 'HubSpot', capabilities: [] }])
    // Les familles, elles, restent celles d'avant : la capacité de recherche de
    // coordonnées est vivante, seul le nom de son fournisseur est tu.
    expect(result.current.families).toEqual(['crm', 'prospection'])
  })

  it('un registre qui n’est pas un tableau ne nomme rien et ne fait rien tomber', async () => {
    registry.mockResolvedValue({ error: 'Bad Gateway' })
    const { result } = renderHook(() => useConnectedCapabilities(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tools).toEqual([])
  })
})
