import { RoutineExecutors } from './routine-executors'
import type { CrmRoutinesService } from './crm-routines.service'

// #4286.13 — la relecture déclenchée par l'OUVERTURE d'une fiche passe par la MÊME fonction que la routine.
const WS = 'ws-1'
const NOW = new Date('2026-10-22T10:00:00Z')
const move = (contact_id: string) => ({
  full_name: 'Camille Roux',
  company_name: 'Ancien Client SA',
  new_employer: 'Nouvelle SA',
  known_since: '2024-03-01T00:00:00.000Z',
  new_account_id: 'a-new',
  contact_id,
  account_id: 'a-1',
})
const target = {
  contact_id: 'c-1',
  full_name: 'Camille Roux',
  apollo_id: 'p1',
  organization: 'Ancien Client SA',
  is_champion: false,
  account_name: 'Ancien Client SA',
}
const left = {
  status: 'ok',
  state: 'left',
  organization: 'Nouvelle SA',
  leftOn: null,
  credits: 1,
}

function build(crm: Partial<CrmRoutinesService>, ia?: unknown, recordTrigger?: unknown): RoutineExecutors {
  const args: unknown[] = Array.from({ length: 21 }, () => undefined)
  args[6] = crm
  args[13] = ia
  args[args.length - 1] = recordTrigger
  return new (RoutineExecutors as unknown as new (...a: unknown[]) => RoutineExecutors)(...args)
}

describe('RoutineExecutors.recheckContactEmployment (#4286.13)', () => {
  it('relit UN contact dû : même appel annuaire, contrôle consigné, même porte et même pause', async () => {
    const employmentFreshness = jest.fn().mockResolvedValue(left)
    const recordEmploymentCheck = jest.fn().mockResolvedValue(undefined)
    const openDoorFromMove = jest.fn().mockResolvedValue(true)
    const pauseSequencesForJobChange = jest.fn().mockResolvedValue(1)
    const executors = build(
      {
        employmentCheckTargetFor: async () => target,
        recordEmploymentCheck,
        // Un AUTRE contact a aussi bougé : la relecture d'une fiche ne le traite pas.
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [move('c-1'), move('c-other')] }),
        openDoorFromMove,
        pauseSequencesForJobChange,
      },
      { employmentFreshness },
    )
    await executors.recheckContactEmployment(WS, 'c-1', NOW)
    // Apollo Pro : People-Match (par identifiant), plus la recherche par nom.
    expect(employmentFreshness).toHaveBeenCalledTimes(1)
    expect(employmentFreshness).toHaveBeenCalledWith({ apolloId: 'p1', employerRef: 'Ancien Client SA' })
    expect(recordEmploymentCheck).toHaveBeenCalledWith(
      WS,
      'c-1',
      { organization: 'Nouvelle SA', title: '' },
      NOW,
      'Ancien Client SA',
      { state: 'left' },
    )
    expect(openDoorFromMove).toHaveBeenCalledTimes(1)
    expect(openDoorFromMove).toHaveBeenCalledWith(WS, expect.objectContaining({ contact_id: 'c-1' }))
    expect(pauseSequencesForJobChange).toHaveBeenCalledTimes(1)
    expect(pauseSequencesForJobChange).toHaveBeenCalledWith(WS, 'c-1')
  })

  it('contact pas (ou plus) dû : aucune recherche', async () => {
    const employmentFreshness = jest.fn()
    await build({ employmentCheckTargetFor: async () => null }, { employmentFreshness }).recheckContactEmployment(
      WS,
      'c-1',
      NOW,
    )
    expect(employmentFreshness).not.toHaveBeenCalled()
  })

  it('sans client IA : aucun appel (no-op strict)', async () => {
    const employmentCheckTargetFor = jest.fn()
    await build({ employmentCheckTargetFor }, undefined).recheckContactEmployment(WS, 'c-1', NOW)
    expect(employmentCheckTargetFor).not.toHaveBeenCalled()
  })

  it('sans clé côté annuaire (« unconfigured ») : rien n’est consigné, ni porte ni pause', async () => {
    const recordEmploymentCheck = jest.fn()
    const openDoorFromMove = jest.fn()
    await build(
      {
        employmentCheckTargetFor: async () => target,
        recordEmploymentCheck,
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [move('c-1')] }),
        openDoorFromMove,
      },
      { employmentFreshness: jest.fn().mockResolvedValue({ ...left, status: 'unavailable', state: 'unknown' }) },
    ).recheckContactEmployment(WS, 'c-1', NOW)
    expect(recordEmploymentCheck).not.toHaveBeenCalled()
    expect(openDoorFromMove).not.toHaveBeenCalled()
  })

  it('même employeur observé : consigné « vu le », mais ni porte ni pause', async () => {
    const recordEmploymentCheck = jest.fn().mockResolvedValue(undefined)
    const openDoorFromMove = jest.fn()
    await build(
      {
        employmentCheckTargetFor: async () => target,
        recordEmploymentCheck,
        contactsWhoMayHaveMoved: async () => ({ measured: true, rows: [] }),
        openDoorFromMove,
      },
      {
        employmentFreshness: jest
          .fn()
          .mockResolvedValue({ ...left, state: 'in_post', organization: 'Ancien Client SA', leftOn: null }),
      },
    ).recheckContactEmployment(WS, 'c-1', NOW)
    expect(recordEmploymentCheck).toHaveBeenCalledTimes(1)
    expect(recordEmploymentCheck).toHaveBeenCalledWith(
      WS,
      'c-1',
      { organization: 'Ancien Client SA', title: '' },
      NOW,
      'Ancien Client SA',
      { state: 'confirmed' },
    )
    expect(openDoorFromMove).not.toHaveBeenCalled()
  })

  it('un appel qui lève n’échappe jamais', async () => {
    await expect(
      build(
        { employmentCheckTargetFor: async () => target },
        { employmentFreshness: jest.fn().mockRejectedValue(new Error('réseau')) },
      ).recheckContactEmployment(WS, 'c-1', NOW),
    ).resolves.toBeUndefined()
  })
})
