import { describe, expect, it } from 'vitest'
import type { UserConsumptionRow, WorkspaceConsumptionRow } from '@/lib/credit-consumption'
import { libelleConsomme, libelleRenouvellement, libelleSolde, trierEpuises, trierEspaces } from './consommation.logic'

/**
 * #4467 — la consommation de crédits ne se voit QUE dans le back-office. Les trois
 * règles de ce qu'on écrit : « non mesuré » n'est jamais « 0 », un pool illimité
 * n'a pas de solde, et un solde épuisé se dit en toutes lettres.
 */

function espace(over: Partial<WorkspaceConsumptionRow> = {}): WorkspaceConsumptionRow {
  return {
    workspaceId: 'w1',
    name: 'Acme',
    ownerUserId: 'u1',
    plan: 'growth',
    memberCount: 2,
    capacity: 100,
    remaining: 60,
    consumed: 12,
    renewsAt: '2026-11-05T00:00:00.000Z',
    exhausted: false,
    unlimited: false,
    ...over,
  }
}

function membre(over: Partial<UserConsumptionRow> = {}): UserConsumptionRow {
  return {
    userId: 'u1',
    email: 'a@acme.fr',
    workspaceId: 'w1',
    workspaceName: 'Acme',
    consumed: 3,
    remaining: 60,
    renewsAt: '2026-11-05T00:00:00.000Z',
    exhausted: false,
    ...over,
  }
}

describe('libelleSolde', () => {
  it('écrit le solde sur la capacité', () => {
    expect(libelleSolde(espace())).toBe('60 / 100')
  })
  it('dit « épuisé » à zéro — un zéro mesuré, pas une absence', () => {
    expect(libelleSolde(espace({ remaining: 0, exhausted: true }))).toBe('0 / 100 — épuisé')
  })
  it('dit « illimité » pour un pool illimité, jamais un solde', () => {
    expect(libelleSolde(espace({ unlimited: true, capacity: null, remaining: null }))).toBe('illimité')
  })
  it('écrit « — » quand rien n’est mesurable, jamais « 0 »', () => {
    expect(libelleSolde(espace({ capacity: null, remaining: null }))).toBe('—')
  })
})

describe('libelleConsomme', () => {
  it('écrit le nombre mesuré, zéro compris', () => {
    expect(libelleConsomme(12)).toBe('12')
    expect(libelleConsomme(0)).toBe('0')
  })
  it('écrit « — » pour non mesuré', () => {
    expect(libelleConsomme(null)).toBe('—')
  })
})

describe('libelleRenouvellement', () => {
  it('écrit la date', () => {
    expect(libelleRenouvellement('2026-11-05T12:00:00.000Z')).toMatch(/05\/11\/26/)
  })
  it('écrit « — » sans date (essai, pool sans abonnement)', () => {
    expect(libelleRenouvellement(null)).toBe('—')
  })
})

describe('tris', () => {
  it('les espaces : épuisés d’abord, puis par solde croissant, sans solde à la fin', () => {
    const rows = [
      espace({ workspaceId: 'a', name: 'A', remaining: 50 }),
      espace({ workspaceId: 'b', name: 'B', remaining: null, capacity: null }),
      espace({ workspaceId: 'c', name: 'C', remaining: 0, exhausted: true }),
      espace({ workspaceId: 'd', name: 'D', remaining: 5 }),
    ]
    expect(trierEspaces(rows).map(row => row.workspaceId)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('les comptes épuisés : par espace puis par e-mail, stable', () => {
    const rows = [
      membre({ userId: '3', workspaceName: 'Zeta', email: 'z@z.fr' }),
      membre({ userId: '2', workspaceName: 'Acme', email: 'b@acme.fr' }),
      membre({ userId: '1', workspaceName: 'Acme', email: 'a@acme.fr' }),
    ]
    expect(trierEpuises(rows).map(row => row.userId)).toEqual(['1', '2', '3'])
  })
})
