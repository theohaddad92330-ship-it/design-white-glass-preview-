import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAccountRelaunch } from './useAccountRelaunch'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => navigate }))

/**
 * #3742 / #3744 — « Actualiser » reprend le périmètre ET la zone géographique
 * saisie au cadrage de la dernière analyse : la relance « France » ne retombe
 * plus sur le défaut.
 */
describe('useAccountRelaunch (#3742)', () => {
  const account = { id: '0b8a2f62-8f1e-4d43-9d1b-7d1b2c3d4e5f', company_name: 'Thales' }

  it('pré-remplit la recherche avec le mode, la zone et ses aires', () => {
    navigate.mockClear()
    const { result } = renderHook(() => useAccountRelaunch(account))
    result.current.relaunch({ scopeMode: 'groupe', geoPerimeter: 'region', geoAreas: ['Bourgogne-Franche-Comté'] })
    expect(navigate).toHaveBeenCalledWith({
      to: '/search',
      search: {
        accountId: account.id,
        company: 'Thales',
        scope: 'groupe',
        geo: 'region',
        geoAreas: ['Bourgogne-Franche-Comté'],
      },
    })
  })

  it('sait dire NON : un clic nu (événement) ou une zone inconnue n’ajoute rien', () => {
    navigate.mockClear()
    const { result } = renderHook(() => useAccountRelaunch(account))
    result.current.relaunch({ type: 'click' })
    result.current.relaunch({ geoPerimeter: 'lune' })
    for (const call of navigate.mock.calls) {
      expect(call[0]).toEqual({ to: '/search', search: { accountId: account.id, company: 'Thales' } })
    }
  })
})
