import { runContactsRulesCatchUp } from './contacts-rules-catch-up.runner'

// LUDOVIC-C LC.1 — le script opérateur : CIBLÉ (un espace ou un compte), simulation par défaut.
const repos = (accounts: Record<string, unknown>[], contacts: Record<string, unknown>[]) => {
  const update = jest.fn()
  const accountUpdate = jest.fn()
  return {
    accounts: { find: jest.fn().mockResolvedValue(accounts), update: accountUpdate },
    contacts: { find: jest.fn().mockResolvedValue(contacts), update },
    update,
    accountUpdate,
  }
}
const STILL = {
  id: 'acc-still',
  company_name: 'STILL',
  website: 'still.fr',
  contacts_collected_at: new Date('2026-10-12T08:00:00Z'),
  contacts_rules_applied_at: null,
}
const FRONT = {
  id: 'c1',
  full_name: 'A',
  email: 'a@stillfront.com',
  source: 'apollo',
  identity_confirmed_at: null,
  excluded_at: null,
}

describe('LC.1 — runContactsRulesCatchUp', () => {
  it('refuse de tourner sans cible (jamais tout le parc)', async () => {
    const r = repos([STILL], [FRONT])
    await expect(runContactsRulesCatchUp({ ...r, apply: false })).rejects.toThrow(/--espace|--compte/)
  })
  it('simulation par défaut : nomme, n’écrit rien', async () => {
    const r = repos([STILL], [FRONT])
    const report = await runContactsRulesCatchUp({ ...r, apply: false, accountId: 'acc-still' })
    expect(report).toEqual({ apply: false, concerned: 1, archived: 1, lines: ['STILL — 1 homonyme(s) : A'] })
    expect(r.update).not.toHaveBeenCalled()
    expect(r.accountUpdate).not.toHaveBeenCalled()
  })
  it('avec --appliquer : archive avec raison et date la remise ; un compte déjà remis aux règles est sauté', async () => {
    const r = repos(
      [STILL, { ...STILL, id: 'acc-done', contacts_rules_applied_at: new Date('2026-10-20T00:00:00Z') }],
      [FRONT],
    )
    const report = await runContactsRulesCatchUp({ ...r, apply: true, workspaceId: 'ws-1' })
    expect(report.concerned).toBe(1)
    expect(r.update).toHaveBeenCalledTimes(1)
    expect(r.accountUpdate).toHaveBeenCalledWith(
      { id: 'acc-still' },
      expect.objectContaining({ contacts_rules_applied_at: expect.any(Date) }),
    )
  })
})
