import { describe, expect, it } from 'vitest'
import { estimateAccessCost, type AccessCostCandidate } from './access-cost-estimate.js'

// #4016.L4 — « coût d'accès estimé » : sur la seule base de ce que TON espace a déclaré ailleurs.
const NOW = new Date('2026-10-17T00:00:00.000Z')
const candidate = (over: Partial<AccessCostCandidate> = {}): AccessCostCandidate => ({
  accountId: 'acc-2',
  companyName: 'Thales',
  cost: '3 % de commission via le porteur',
  costObservedAt: '2026-09-01',
  lock: 'verrouille',
  ...over,
})

describe('estimateAccessCost — le coût déclaré par l’espace sur un compte au MÊME verrou', () => {
  it('rend la déclaration la plus récente, avec sa base (compte, date, verrou)', () => {
    const older = candidate({ accountId: 'acc-3', companyName: 'EDF', cost: '5 %', costObservedAt: '2026-06-01' })
    expect(estimateAccessCost({ lock: 'verrouille', candidates: [older, candidate()], now: NOW })).toEqual({
      value: '3 % de commission via le porteur',
      basis: { companyName: 'Thales', observedAt: '2026-09-01', lock: 'verrouille' },
    })
  })

  it('sait dire NON : verrou inconnu, aucun compte au même verrou, ou déclaration périmée → aucune estimation', () => {
    expect(estimateAccessCost({ lock: 'inconnu', candidates: [candidate({ lock: 'inconnu' })], now: NOW })).toBeNull()
    expect(estimateAccessCost({ lock: 'ouvert', candidates: [candidate()], now: NOW })).toBeNull()
    expect(
      estimateAccessCost({ lock: 'verrouille', candidates: [candidate({ costObservedAt: '2024-01-01' })], now: NOW }),
    ).toBeNull()
    expect(
      estimateAccessCost({ lock: 'verrouille', candidates: [candidate({ costObservedAt: null })], now: NOW }),
    ).toBeNull()
    expect(estimateAccessCost({ lock: 'verrouille', candidates: [], now: NOW })).toBeNull()
  })
})
