import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #5042 R4 (recette prod 02/11) — mêmes données, trois chargements, trois jeux de cartes. Invariant testé à la
 * FRONTIÈRE du hook : tout rendu où `settled` vaut vrai porte déjà le contexte FINAL (outils, rôle, vivier,
 * partenaires), quel que soit l'ordre ou le délai d'arrivée des lectures — y compris des lectures d'abord
 * désactivées (session pas prête : `isLoading=false`, `data` absent).
 */
const h = vi.hoisted(() => ({
  user: null as { id: string } | null,
  delays: { registry: 0, team: 0, consultants: 0, partners: 0 },
}))

const later = <T,>(ms: number, value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), ms))

vi.mock('@/lib/hooks/use-session', () => ({ useSession: () => ({ user: h.user }) }))
vi.mock('@/features/integration-center/api', () => ({
  TOOL_REGISTRY_KEY: ['tool-registry'],
  integrationCenterApi: {
    registry: () => later(h.delays.registry, [{ id: 'crm1', status: 'connected', families: ['crm'], family: 'crm' }]),
  },
}))
vi.mock('@/features/team/api', () => ({
  teamApi: { getTeam: () => later(h.delays.team, { workspace: { role: 'admin' } }) },
}))
vi.mock('@/features/consultants/api', () => ({
  consultantsApi: { list: () => later(h.delays.consultants, [{ id: 'c1' }]) },
}))
vi.mock('@/features/partner-pipeline/api/partner-pipeline-api', () => ({
  PARTNER_PIPELINE_KEY: ['partners'],
  fetchPartnerRelations: () => later(h.delays.partners, [{ id: 'p1' }]),
}))

import { useLauraHomeContext } from './laura-home-suggestions'

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

const ORDERS: Array<[string, typeof h.delays, number]> = [
  ['registre le dernier', { registry: 60, team: 5, consultants: 10, partners: 20 }, 0],
  ['équipe la dernière', { registry: 5, team: 60, consultants: 10, partners: 20 }, 0],
  ['session prête APRÈS les premiers rendus', { registry: 5, team: 5, consultants: 5, partners: 5 }, 40],
  ['session prête tard + registre lent', { registry: 50, team: 5, consultants: 5, partners: 5 }, 40],
]

describe('useLauraHomeContext — settled ⇒ contexte final, quel que soit l’ordre d’arrivée', () => {
  beforeEach(() => {
    h.user = null
  })

  it.each(ORDERS)('%s', async (_name, delays, sessionDelay) => {
    h.delays = delays
    h.user = sessionDelay === 0 ? { id: 'u1' } : null
    const seen: Array<ReturnType<typeof useLauraHomeContext>> = []
    const { rerender } = renderHook(
      () => {
        const ctx = useLauraHomeContext(3)
        seen.push(ctx)
        return ctx
      },
      { wrapper },
    )
    if (sessionDelay > 0) {
      await act(() => new Promise(resolve => setTimeout(resolve, sessionDelay)))
      h.user = { id: 'u1' }
      rerender()
    }
    await waitFor(() => expect(seen.at(-1)?.settled).toBe(true), { timeout: 2_000 })
    const final = seen.at(-1)!
    expect(final.connectedFamilies).toEqual(['crm'])
    expect(final.role).toBe('admin')
    expect(final.hasVivier && final.hasPartners).toBe(true)
    for (const ctx of seen.filter(c => c.settled)) {
      expect(ctx.connectedFamilies).toEqual(final.connectedFamilies)
      expect(ctx.role).toBe(final.role)
      expect(ctx.hasVivier).toBe(final.hasVivier)
      expect(ctx.hasPartners).toBe(final.hasPartners)
    }
  })
})
