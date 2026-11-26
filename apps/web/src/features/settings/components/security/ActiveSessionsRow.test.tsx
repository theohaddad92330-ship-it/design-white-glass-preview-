import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2091 — l'écran ANTI-PARTAGE DE MOT DE PASSE (plafond `MAX_ACTIVE_DEVICES`)
 * lisait `sessions?.length ?? 0` sans jamais brancher `isError` : un échec de
 * lecture affichait « Aucune session active », le pire des huit cas relevés —
 * l'utilisateur croit le plafond respecté alors qu'on n'a simplement pas pu
 * lire la liste.
 */

const useActiveSessionsMock = vi.fn()
const revokeMutate = vi.fn()
const useRevokeSessionMock = vi.fn((..._args: unknown[]) => ({
  mutate: revokeMutate,
  isPending: false,
  variables: undefined,
}))

vi.mock('@/features/settings/hooks/useActiveSessions', () => ({
  useActiveSessions: (...args: unknown[]) => useActiveSessionsMock(...args),
  useRevokeSession: (...args: unknown[]) => useRevokeSessionMock(...args),
}))

vi.mock('@/features/auth/hooks/useLogout', () => ({
  useLogout: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

import { ActiveSessionsRow } from './ActiveSessionsRow'

describe('ActiveSessionsRow', () => {
  it('#2091 — échec de lecture : dit l’échec, jamais « aucune session active »', () => {
    useActiveSessionsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    render(<ActiveSessionsRow />)

    expect(screen.queryByText('Aucune session active.')).not.toBeInTheDocument()
    expect(screen.getByText('Impossible de lire tes sessions actives.')).toBeInTheDocument()
  })

  it('liste vide MESURÉE (pas d’erreur) : dit bien « aucune session active »', () => {
    useActiveSessionsMock.mockReturnValue({ data: [], isLoading: false, isError: false })
    render(<ActiveSessionsRow />)

    expect(screen.getByText('Aucune session active.')).toBeInTheDocument()
  })

  it('Théo D settings-compte — un tableau (appareil · adresse · dernière activité · action), et « Déconnecter les autres »', async () => {
    useActiveSessionsMock.mockReturnValue({
      data: [
        {
          id: 's1',
          current: true,
          user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120',
          ip: '1.2.3.4',
          last_seen_at: new Date().toISOString(),
        },
        {
          id: 's2',
          current: false,
          user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS) Safari/605',
          ip: '5.6.7.8',
          last_seen_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
        },
      ],
      isLoading: false,
      isError: false,
    })
    render(<ActiveSessionsRow />)

    const table = screen.getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map(h => h.textContent),
    ).toEqual(['Appareil', 'Adresse', 'Dernière activité', 'Action'])
    expect(within(table).getByText('Chrome · macOS')).toBeInTheDocument()
    expect(within(table).getByText('Maintenant')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Déconnecter les autres' }))
    expect(revokeMutate).toHaveBeenCalledTimes(1)
    expect(revokeMutate).toHaveBeenCalledWith('s2')
  })
})
