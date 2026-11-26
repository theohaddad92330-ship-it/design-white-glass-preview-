import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { missionKeys, useMission } from './api'

const apiFetchMock = vi.mocked(apiFetch)

const ID = '55555555-5555-4555-8555-555555555555'
const OTHER = '66666666-6666-4666-8666-666666666666'

function row(id: string) {
  return { id, label: `mission ${id.slice(0, 4)}`, marginPercent: null }
}

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

/**
 * UNE mission par son identité — la lecture du DOSSIER (D200, 30/08/2026).
 *
 * Les trois choses que ces tests tiennent, et qui sont trois causes racines
 * déjà payées par ce dépôt :
 *
 *  1. La MÊME lecture que la liste (`?id=`), pas une seconde route — sinon le
 *     dossier et sa liste finiraient par ne plus dire la même chose.
 *  2. La mission est RETROUVÉE par son identité, jamais prise en première
 *     ligne : le serveur ignore un `?id=` illisible et rend la liste entière.
 *  3. « Introuvable » et « la lecture a échoué » sont DEUX réponses.
 */
describe('useMission — ce que lit le dossier', () => {
  beforeEach(() => apiFetchMock.mockReset())

  it('lit la MÊME route que la liste, resserrée par `?id=`', async () => {
    apiFetchMock.mockResolvedValueOnce({ missions: [row(ID)], canReadFinance: true })

    const { result } = renderHook(() => useMission(ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.mission).toBeDefined())
    // Une seconde route serveur recomposerait la ligne ailleurs — second
    // `SELECT`, seconde décoration, seconde vérité.
    expect(apiFetchMock).toHaveBeenCalledWith({ path: `/delivery/missions?id=${ID}` })
    expect(result.current.mission?.id).toBe(ID)
    expect(result.current.canReadFinance).toBe(true)
    expect(result.current.notFound).toBe(false)
  })

  /**
   * ⚠️ LE TEST QUI TIENT LE LOT. Le serveur IGNORE un `?id=` qu'il ne sait pas
   * lire et rend alors la liste ENTIÈRE — c'est son arbitrage, et il est bon :
   * un lien collé de travers doit montrer quelque chose. Lire `missions[0]`
   * afficherait donc la mission d'un AUTRE sous le titre de celle qu'on croyait
   * ouvrir, ce qui est pire qu'une page vide.
   */
  it('RETROUVE sa mission — elle ne prend jamais la première ligne rendue', async () => {
    apiFetchMock.mockResolvedValueOnce({ missions: [row(OTHER), row(ID)], canReadFinance: false })

    const { result } = renderHook(() => useMission(ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.mission?.id).toBe(ID)
  })

  it('dit INTROUVABLE quand la lecture a abouti sans la trouver — pas « ça charge »', async () => {
    apiFetchMock.mockResolvedValueOnce({ missions: [row(OTHER)], canReadFinance: false })

    const { result } = renderHook(() => useMission(ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.notFound).toBe(true))
    // Une vraie réponse : elle envoie chercher ailleurs, pas réessayer.
    expect(result.current.isError).toBe(false)
    expect(result.current.mission).toBeUndefined()
  })

  it('dit ÉCHEC quand la lecture échoue — l’autre phrase, l’autre geste', async () => {
    apiFetchMock.mockRejectedValueOnce(new Error('réseau'))

    const { result } = renderHook(() => useMission(ID), { wrapper: wrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    // ⚠️ « Cassé » ne doit JAMAIS se rendre comme « introuvable » : la première
    // envoie réessayer, la seconde envoie chercher ailleurs.
    expect(result.current.notFound).toBe(false)
  })

  /**
   * L'identité entre dans la CLÉ de cache. Sans elle, la réponse à UNE mission
   * et la liste entière partagent une entrée : le premier écran ouvert décide
   * de ce que le second affiche. « Une clé de cache recopiée à la main » est
   * une cause racine du dépôt.
   */
  it('n’écrase pas le cache de la liste — l’identité est dans la clé', () => {
    expect(missionKeys.list({ id: ID })).not.toEqual(missionKeys.list())
    expect(missionKeys.list({ id: ID })).not.toEqual(missionKeys.list({ id: OTHER }))
  })
})
