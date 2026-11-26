import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * #5042 R2 (recette 01/11) — « mêmes données ⇒ mêmes cartes au rechargement ». Les cartes se figent dès que
 * `settled` passe vrai : si `settled` ne couvre pas TOUTES les lectures dont dépendent l'ENSEMBLE (outils branchés)
 * et l'ORDRE (rôle) des cartes, le gel capture un état partiel différent à chaque chargement.
 */
const state = vi.hoisted(() => ({
  registryLoading: false,
  teamLoading: false,
  teamAbsent: false,
  teamError: false,
  teamNoRole: false,
}))

vi.mock('@/features/consultants/hooks', () => ({ useConsultants: () => ({ data: [] }) }))
vi.mock('@tanstack/react-query', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: [] }),
}))
vi.mock('@/features/chat/hooks/useConnectedCapabilities', () => ({
  useConnectedCapabilities: () => ({
    families: ['crm'],
    isLoading: state.registryLoading,
    arrived: !state.registryLoading,
  }),
}))
vi.mock('@/features/team/hooks/useTeam', () => ({
  useTeam: () => ({
    team: state.teamLoading || state.teamAbsent ? undefined : { workspace: state.teamNoRole ? {} : { role: 'member' } },
    isLoading: state.teamLoading,
    isError: state.teamError,
  }),
}))

import { useLauraHomeContext } from './laura-home-suggestions'

describe('useLauraHomeContext — settled attend TOUTES les lectures', () => {
  beforeEach(() => {
    state.registryLoading = false
    state.teamLoading = false
    state.teamAbsent = false
    state.teamError = false
    state.teamNoRole = false
  })

  it('tout est lu ⇒ settled', () => {
    expect(renderHook(() => useLauraHomeContext(3)).result.current.settled).toBe(true)
  })

  it('le registre des outils charge encore (il change l’ENSEMBLE des cartes) ⇒ pas settled', () => {
    state.registryLoading = true
    expect(renderHook(() => useLauraHomeContext(3)).result.current.settled).toBe(false)
  })

  it('l’équipe charge encore (le rôle change l’ORDRE des cartes) ⇒ pas settled', () => {
    state.teamLoading = true
    expect(renderHook(() => useLauraHomeContext(3)).result.current.settled).toBe(false)
  })

  it('l’équipe n’est pas encore demandée (session pas prête : isLoading=false, team absente) ⇒ pas settled', () => {
    state.teamAbsent = true
    expect(renderHook(() => useLauraHomeContext(3)).result.current.settled).toBe(false)
  })

  it('#5042 R5 — équipe arrivée SANS rôle (réponse partielle) ⇒ pas settled : le rôle décide de l’ORDRE figé', () => {
    state.teamNoRole = true
    expect(renderHook(() => useLauraHomeContext(3)).result.current.settled).toBe(false)
  })

  it('la lecture de l’équipe a ÉCHOUÉ ⇒ settled (rôle inconnu = ordre par défaut, les cartes ne restent pas muettes)', () => {
    state.teamAbsent = true
    state.teamError = true
    expect(renderHook(() => useLauraHomeContext(3)).result.current.settled).toBe(true)
  })
})
