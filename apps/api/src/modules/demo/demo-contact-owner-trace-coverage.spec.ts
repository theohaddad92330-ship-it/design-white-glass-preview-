import { DEMO_CONTACT_OWNER_AND_APPROVAL_TRACE_COVERAGE } from './demo-coverage'

// #2160.9 / #2200.13 — craft rule n°9 : le classement existe et dit pourquoi (aucune ligne neuve à semer).
describe('#2160.9 / #2200.13 — responsable en en-tête et traçabilité des cartes à valider en démo', () => {
  it('est classé seedé, avec sa raison', () => {
    expect(DEMO_CONTACT_OWNER_AND_APPROVAL_TRACE_COVERAGE.state).toBe('seede')
    expect(DEMO_CONTACT_OWNER_AND_APPROVAL_TRACE_COVERAGE.reason).toContain('assigned_to')
    expect(DEMO_CONTACT_OWNER_AND_APPROVAL_TRACE_COVERAGE.reason).toContain('seedOutreachMessages')
  })
})
