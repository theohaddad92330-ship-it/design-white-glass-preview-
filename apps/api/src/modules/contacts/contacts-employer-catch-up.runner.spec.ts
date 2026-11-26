import { nameMatchesAccount } from './contact-employer'
import { EMPLOYER_GUARD_CAPABILITY_AT, runContactsEmployerCatchUp } from './contacts-employer-catch-up.runner'

/**
 * #4928.4 — le RATTRAPAGE de la garde d'employeur sur les contacts DÉJÀ en base (décision Louis 18/09/2026) :
 * CIBLÉ (jamais tout le parc), par SEGMENT (les contacts seuls), « concerné » = collecte du segment AVANT la
 * capacité, SIMULATION par défaut (compte affiché avant d'écrire), idempotent, reprenable. Ne part jamais seul.
 */
const OLD = new Date('2026-10-01T08:00:00Z')
const NEW = new Date('2026-11-01T08:00:00Z')
const account = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  company_name: 'Boulanger',
  raw_analysis: { entities: ['Boulanger Services'] },
  contacts_collected_at: OLD,
  ...extra,
})
const contact = (id: string, entity: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  full_name: `P ${id}`,
  entity,
  source: 'apollo',
  identity_confirmed_at: null,
  excluded_at: null,
  ...extra,
})
const repos = (accounts: unknown[], contacts: unknown[]) => {
  const update = jest.fn().mockResolvedValue(undefined)
  return {
    accounts: { find: jest.fn().mockResolvedValue(accounts) },
    contacts: { find: jest.fn().mockResolvedValue(contacts), update },
    update,
  }
}

describe('#4928.4 — nameMatchesAccount (miroir de la garde IA)', () => {
  it('« Boulanger SA » est Boulanger ; « Boulangerie Ange » ne l’est pas', () => {
    expect(nameMatchesAccount('Boulanger SA', ['Boulanger'])).toBe(true)
    expect(nameMatchesAccount('Groupe Boulanger', ['Boulanger'])).toBe(true)
    expect(nameMatchesAccount('Boulangerie Ange', ['Boulanger'])).toBe(false)
  })
})

describe('#4928.4 — runContactsEmployerCatchUp', () => {
  it('refuse de tourner sans cible (jamais tout le parc)', async () => {
    const r = repos([account('a')], [])
    await expect(runContactsEmployerCatchUp({ ...r, apply: false })).rejects.toThrow(/--espace|--compte/)
  })

  it('SIMULATION : nomme et compte, n’écrit RIEN', async () => {
    const r = repos([account('a')], [contact('c1', 'Boulangerie Ange'), contact('c2', 'Boulanger SA')])
    const report = await runContactsEmployerCatchUp({ ...r, apply: false, accountId: 'a' })
    expect(report).toMatchObject({ apply: false, concerned: 1, toArchive: 1, archived: 0 })
    expect(report.lines.join('\n')).toContain('Boulangerie Ange')
    expect(r.update).not.toHaveBeenCalled()
  })

  it('« concerné » = collecte antérieure à la capacité : un compte collecté après est sauté', async () => {
    const r = repos(
      [account('old'), account('fresh', { contacts_collected_at: NEW })],
      [contact('c1', 'Boulangerie Ange')],
    )
    const report = await runContactsEmployerCatchUp({ ...r, apply: false, workspaceId: 'ws-1' })
    expect(report.concerned).toBe(1)
    expect(Date.parse(EMPLOYER_GUARD_CAPABILITY_AT)).toBeLessThan(NEW.getTime())
  })

  it('une absence ne rejette jamais, ni l’entité d’un compte, ni une correction humaine', async () => {
    const r = repos(
      [account('a')],
      [
        contact('none', null),
        contact('sub', 'Boulanger Services'),
        contact('human', 'Boulangerie Ange', { identity_confirmed_at: new Date() }),
        contact('manual', 'Boulangerie Ange', { source: 'manual' }),
        contact('done', 'Boulangerie Ange', { excluded_at: new Date() }),
      ],
    )
    const report = await runContactsEmployerCatchUp({ ...r, apply: false, accountId: 'a' })
    expect(report.toArchive).toBe(0)
  })

  it('--appliquer exige le compte affiché en simulation : un compte différent n’écrit rien', async () => {
    const r = repos([account('a')], [contact('c1', 'Boulangerie Ange')])
    await expect(runContactsEmployerCatchUp({ ...r, apply: true, accountId: 'a', confirmedCount: 5 })).rejects.toThrow(
      /compte/,
    )
    expect(r.update).not.toHaveBeenCalled()
  })

  it('--appliquer avec le bon compte : archive avec motif, sans toucher la date de collecte, et reprenable', async () => {
    const r = repos([account('a'), account('b')], [contact('c1', 'Boulangerie Ange')])
    const report = await runContactsEmployerCatchUp({ ...r, apply: true, workspaceId: 'ws-1', confirmedCount: 2 })
    expect(report.archived).toBe(2)
    expect(r.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        excluded_at: expect.any(Date),
        exclusion_reason: expect.stringContaining('employeur'),
      }),
    )
    expect(report.lastAccountId).toBe('b')
    const again = repos([account('a'), account('b')], [])
    await runContactsEmployerCatchUp({ ...again, apply: false, workspaceId: 'ws-1', afterAccountId: 'a' })
    expect(again.accounts.find).toHaveBeenCalledWith(expect.objectContaining({ order: { id: 'ASC' } }))
  })
})
