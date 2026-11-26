import { describe, expect, it } from 'vitest'
import { Route as FinanceRoute } from './finance'
import { Route as PipeRoute } from './pipe'
import { Route as StaffingRoute } from './staffing'

/**
 * Théo D pilotage.A0 — « anciennes routes y pointent » : chaque adresse de l'ancien Pilotage mène à sa
 * section ancrée de la page unique. Les liens entrants (favoris, Laura, messages) continuent de marcher.
 */
function redirectOf(
  route: { options: { beforeLoad?: unknown } },
  hash = '',
): { to?: string; hash?: string; replace?: boolean } {
  const beforeLoad = route.options.beforeLoad as (context: { location: { hash: string } }) => void
  try {
    beforeLoad({ location: { hash } })
  } catch (thrown) {
    return (thrown as { options: { to?: string; hash?: string; replace?: boolean } }).options
  }
  throw new Error('la route devait rediriger')
}

describe('Pilotage — les anciennes routes pointent vers les sections ancrées', () => {
  it.each([
    ['/pilotage/pipe', PipeRoute, 'pipe'],
    ['/pilotage/staffing', StaffingRoute, 'staffing'],
    ['/pilotage/finance', FinanceRoute, 'finance'],
  ] as const)('%s → /pilotage#%s', (_path, route, hash) => {
    expect(redirectOf(route)).toMatchObject({ to: '/pilotage', hash, replace: true })
  })

  it('/pilotage/pipe#parcours garde son ancre (Parcours est une section de Pipe, #4163.2)', () => {
    expect(redirectOf(PipeRoute, 'parcours')).toMatchObject({ to: '/pilotage', hash: 'parcours' })
  })
})
