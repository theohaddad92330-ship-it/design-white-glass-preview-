import { RoutineExecutors } from './routine-executors'
import type { CrmRoutinesService } from './crm-routines.service'

// #4016.L2 — la routine `contact_job_change` relit l'employeur des champions
// (annuaire sous contrat) AVANT de chercher les changements de poste.
const WS = 'ws-1'
const move = {
  full_name: 'Camille Roux',
  company_name: 'Ancien Client SA',
  new_employer: 'Nouvelle SA',
  known_since: '2024-03-01T00:00:00.000Z',
  new_account_id: null,
  contact_id: 'c-1',
  account_id: 'a-1',
}
const target = {
  contact_id: 'c-1',
  full_name: 'Camille Roux',
  apollo_id: 'p1',
  organization: 'Ancien Client SA',
  is_champion: true,
}

function build(crm: Partial<CrmRoutinesService>, ia?: unknown): RoutineExecutors {
  const args: unknown[] = Array.from({ length: 21 }, () => undefined)
  args[6] = crm
  args[13] = ia
  return new (RoutineExecutors as unknown as new (...a: unknown[]) => RoutineExecutors)(...args)
}

describe('contact_job_change — relecture de l’employeur des champions', () => {
  const OLD = process.env['CHAMPION_EMPLOYMENT_CHECK_PER_RUN']
  afterEach(() => {
    if (OLD === undefined) delete process.env['CHAMPION_EMPLOYMENT_CHECK_PER_RUN']
    else process.env['CHAMPION_EMPLOYMENT_CHECK_PER_RUN'] = OLD
  })

  it('sans réglage : aucun appel fournisseur, aucune lecture (no-op strict)', async () => {
    delete process.env['CHAMPION_EMPLOYMENT_CHECK_PER_RUN']
    const employmentFreshness = jest.fn()
    const due = jest.fn()
    await build(
      { championsDueForEmploymentCheck: due, contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [] }) },
      { employmentFreshness },
    ).run('contact_job_change', 'u1', new Date(), WS)
    expect(employmentFreshness).not.toHaveBeenCalled()
    expect(due).not.toHaveBeenCalled()
  })

  it('réglé : relit chaque champion par identifiant (People-Match), consigne l’état daté, et nomme le champion qui a bougé', async () => {
    process.env['CHAMPION_EMPLOYMENT_CHECK_PER_RUN'] = '5'
    const employmentFreshness = jest.fn().mockResolvedValue({
      status: 'ok',
      state: 'left',
      organization: 'Nouvelle SA',
      leftOn: '2026-09-30',
      credits: 1,
    })
    const recordEmploymentCheck = jest.fn().mockResolvedValue(undefined)
    const now = new Date('2026-10-11T08:00:00Z')
    const outcome = await build(
      {
        championsDueForEmploymentCheck: async () => [{ ...target, account_name: 'Ancien Client SA' }],
        recordEmploymentCheck,
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [move] }),
        openDoorFromMove: async () => false,
        pauseSequencesForJobChange: async () => 0,
      },
      { employmentFreshness },
    ).run('contact_job_change', 'u1', now, WS)
    expect(employmentFreshness).toHaveBeenCalledWith({ apolloId: 'p1', employerRef: 'Ancien Client SA' })
    expect(recordEmploymentCheck).toHaveBeenCalledWith(
      WS,
      'c-1',
      { organization: 'Nouvelle SA', title: '' },
      now,
      'Ancien Client SA',
      { state: 'left', leftOn: '2026-09-30' },
    )
    expect(outcome.notification?.title).toBe('Ton champion a changé de boîte')
    expect(outcome.notification?.body).toContain('Camille Roux')
    expect(JSON.stringify(outcome)).not.toMatch(/apollo|linkedin/i)
  })

  it('en poste prouvé par le parcours : état « confirmed » consigné, aucun mouvement', async () => {
    process.env['CHAMPION_EMPLOYMENT_CHECK_PER_RUN'] = '5'
    const recordEmploymentCheck = jest.fn().mockResolvedValue(undefined)
    const now = new Date('2026-10-11T08:00:00Z')
    const outcome = await build(
      {
        championsDueForEmploymentCheck: async () => [{ ...target, account_name: 'Ancien Client SA' }],
        recordEmploymentCheck,
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [] }),
      },
      {
        employmentFreshness: jest.fn().mockResolvedValue({
          status: 'ok',
          state: 'in_post',
          organization: 'Ancien Client SA',
          leftOn: null,
          credits: 1,
        }),
      },
    ).run('contact_job_change', 'u1', now, WS)
    expect(recordEmploymentCheck).toHaveBeenCalledWith(
      WS,
      'c-1',
      { organization: 'Ancien Client SA', title: '' },
      now,
      'Ancien Client SA',
      { state: 'confirmed' },
    )
    expect(outcome.outcome).toBe('Aucun changement de poste repéré.')
  })

  it('parcours muet (inconnu) : le passage est daté « non retrouvé », jamais « parti »', async () => {
    process.env['CHAMPION_EMPLOYMENT_CHECK_PER_RUN'] = '5'
    const recordEmploymentCheck = jest.fn().mockResolvedValue(undefined)
    const now = new Date('2026-10-11T08:00:00Z')
    await build(
      {
        championsDueForEmploymentCheck: async () => [{ ...target, account_name: 'Ancien Client SA' }],
        recordEmploymentCheck,
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [] }),
      },
      {
        employmentFreshness: jest
          .fn()
          .mockResolvedValue({ status: 'ok', state: 'unknown', organization: null, leftOn: null, credits: 1 }),
      },
    ).run('contact_job_change', 'u1', now, WS)
    expect(recordEmploymentCheck).toHaveBeenCalledWith(WS, 'c-1', null, now, 'Ancien Client SA', { state: 'not_found' })
  })

  it('annuaire muet ou statut non « ok » : le passage est daté, l’employeur connu intact', async () => {
    process.env['CHAMPION_EMPLOYMENT_CHECK_PER_RUN'] = '5'
    const recordEmploymentCheck = jest.fn().mockResolvedValue(undefined)
    await build(
      {
        championsDueForEmploymentCheck: async () => [target],
        recordEmploymentCheck,
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [] }),
      },
      {
        employmentFreshness: jest
          .fn()
          .mockResolvedValue({ status: 'unavailable', state: 'unknown', organization: null, leftOn: null, credits: 0 }),
      },
    ).run('contact_job_change', 'u1', new Date(), WS)
    // Fournisseur non configuré / en panne : on ne date PAS le passage (il sera retenté).
    expect(recordEmploymentCheck).not.toHaveBeenCalled()
  })

  it('un appel qui lève ne fait jamais taire la routine', async () => {
    process.env['CHAMPION_EMPLOYMENT_CHECK_PER_RUN'] = '5'
    const outcome = await build(
      {
        championsDueForEmploymentCheck: async () => [target],
        recordEmploymentCheck: jest.fn(),
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [] }),
      },
      { employmentFreshness: jest.fn().mockRejectedValue(new Error('réseau')) },
    ).run('contact_job_change', 'u1', new Date(), WS)
    expect(outcome.outcome).toBe('Aucun changement de poste repéré.')
  })

  // #4016.2c — les contacts qui ne sont pas champions sont relus aussi (après eux).
  it('un contact non champion est relu et daté, mais ne fait jamais dire « ton champion a changé de boîte »', async () => {
    process.env['CHAMPION_EMPLOYMENT_CHECK_PER_RUN'] = '5'
    const other = { ...target, contact_id: 'c-1', is_champion: false }
    const employmentFreshness = jest
      .fn()
      .mockResolvedValue({ status: 'ok', state: 'left', organization: 'Nouvelle SA', leftOn: null, credits: 1 })
    const recordEmploymentCheck = jest.fn().mockResolvedValue(undefined)
    const outcome = await build(
      {
        championsDueForEmploymentCheck: async () => [other],
        recordEmploymentCheck,
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [move] }),
        openDoorFromMove: async () => false,
        pauseSequencesForJobChange: async () => 0,
      },
      { employmentFreshness },
    ).run('contact_job_change', 'u1', new Date(), WS)
    expect(recordEmploymentCheck).toHaveBeenCalledTimes(1)
    expect(outcome.notification?.title).not.toBe('Ton champion a changé de boîte')
  })
})
