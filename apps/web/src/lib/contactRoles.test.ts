import { describe, expect, it } from 'vitest'
import { CURRENT_DECISION_ROLES, getRoleUtility } from './contactRoles'

/**
 * #3401 (retour bêta #3401) — `getRoleUtility` dérive, depuis la MÊME
 * taxonomie MEDDIC que `decisionRoleSchema`, ce qu'un rôle peut CONFIRMER,
 * faire AVANCER, et s'il décide probablement seul (`economic`, exclusif).
 */
describe('getRoleUtility', () => {
  it('rend null sans rôle, ou sur "unknown" — rien à déduire (GA-18/19)', () => {
    expect(getRoleUtility(null)).toBeNull()
    expect(getRoleUtility(undefined)).toBeNull()
    expect(getRoleUtility('unknown')).toBeNull()
  })

  it('seul "economic" décide probablement seul', () => {
    for (const role of CURRENT_DECISION_ROLES) {
      expect(getRoleUtility(role)?.canProbablyDecideAlone).toBe(role === 'economic')
    }
  })

  it('"technical"/"user"/"procurement"/"blocker" confirment le terrain, "champion"/"influencer" le font avancer', () => {
    expect(getRoleUtility('technical')).toEqual({
      canConfirmGroundTruth: true,
      canAdvanceInternally: false,
      canProbablyDecideAlone: false,
    })
    expect(getRoleUtility('champion')).toEqual({
      canConfirmGroundTruth: false,
      canAdvanceInternally: true,
      canProbablyDecideAlone: false,
    })
  })

  it('les 7 rôles courants sont tous couverts par les 3 capacités (aucune ne reste indéfinie)', () => {
    for (const role of CURRENT_DECISION_ROLES) {
      const utility = getRoleUtility(role)
      expect(utility).not.toBeNull()
      expect(typeof utility?.canConfirmGroundTruth).toBe('boolean')
      expect(typeof utility?.canAdvanceInternally).toBe('boolean')
      expect(typeof utility?.canProbablyDecideAlone).toBe('boolean')
    }
  })
})
