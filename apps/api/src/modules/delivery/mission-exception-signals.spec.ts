import { missionExceptionSignals } from './mission-exception-signals'

const WS = 'w0000000-0000-4000-8000-000000000001'
const M1 = 'm0000000-0000-4000-8000-000000000001'
const M2 = 'm0000000-0000-4000-8000-000000000002'
const ACC = 'a0000000-0000-4000-8000-000000000001'
const C1 = 'c0000000-0000-4000-8000-000000000001'
const C2 = 'c0000000-0000-4000-8000-000000000002'
const LE = 'e0000000-0000-4000-8000-000000000001'

/** Une base factice qui répond selon la TABLE lue — aucune base réelle. */
function fakeManager(tables: Partial<Record<string, unknown[]>>) {
  const query = jest.fn(async (sql: string) => {
    for (const [table, rows] of Object.entries(tables)) if (sql.includes(`FROM ${table}`)) return rows
    return []
  })
  return { query }
}

const missions = [
  { id: M1, account_id: ACC, ends_on: '2026-11-20', legal_entity_id: LE },
  { id: M2, account_id: null, ends_on: '2027-06-30', legal_entity_id: null },
]

describe('missionExceptionSignals (#2408.3/.16/.17/.20/.21/.40)', () => {
  it('lit chaque signal MESURÉ, en lots, jamais une requête par ligne', async () => {
    const manager = fakeManager({
      mission_feedback: [
        { mission_id: M1, rail: 'client', level: 'low', private: false, created_at: '2026-10-20T09:00:00Z' },
      ],
      activities: [{ account_id: ACC, last_at: '2026-08-01T09:00:00Z' }],
      consultant_absences: [{ consultant_id: C1, starts_on: '2026-10-25', ends_on: '2026-11-15' }],
      mission_assignments: [{ consultant_id: C1, mission_id: M1, ends_on: '2026-11-20' }],
      'tasks t': [{ account_id: ACC }],
      legal_entities: [{ id: LE, name: 'Bellum Conseil SAS' }],
    })
    const signals = await missionExceptionSignals(manager, WS, missions, new Map([[M1, [{ id: C1 }]]]), '2026-11-01')
    expect(manager.query).toHaveBeenCalledTimes(6)
    expect(signals.get(M1)).toEqual({
      satisfaction: { client: 'low', consultant: null },
      lastAccountContactAt: '2026-08-01T09:00:00.000Z',
      assigneeOnProlongedAbsence: true,
      assigneeWithoutNextPlacement: true,
      ownerlessOpenAction: true,
      legalEntityName: 'Bellum Conseil SAS',
    })
  })

  it('dit NON : affecté placé après, absence courte, aucune tâche sans porteur', async () => {
    const manager = fakeManager({
      consultant_absences: [{ consultant_id: C2, starts_on: '2026-10-31', ends_on: '2026-11-02' }],
      mission_assignments: [
        { consultant_id: C2, mission_id: M1, ends_on: '2026-11-20' },
        { consultant_id: C2, mission_id: 'm-next', ends_on: '2027-03-31' },
      ],
    })
    const signals = await missionExceptionSignals(manager, WS, missions, new Map([[M1, [{ id: C2 }]]]), '2026-11-01')
    const m1 = signals.get(M1)
    expect(m1?.assigneeOnProlongedAbsence).toBe(false)
    expect(m1?.assigneeWithoutNextPlacement).toBe(false)
    expect(m1?.ownerlessOpenAction).toBe(false)
    // Aucun contact JAMAIS avec le compte : `null` mesuré, pas « non lu ».
    expect(m1?.lastAccountContactAt).toBeNull()
    // Aucun niveau déclaré : « non mesuré » sur les deux rails, jamais un niveau.
    expect(m1?.satisfaction).toEqual({ client: null, consultant: null })
  })

  it('un silence reste MUET : affectés illisibles, mission sans compte', async () => {
    const signals = await missionExceptionSignals(fakeManager({}), WS, missions, null, '2026-11-01')
    const m2 = signals.get(M2)
    expect(m2?.assigneeOnProlongedAbsence).toBeUndefined()
    expect(m2?.assigneeWithoutNextPlacement).toBeUndefined()
    expect(m2?.lastAccountContactAt).toBeUndefined()
    expect(m2?.ownerlessOpenAction).toBeUndefined()
    expect(m2?.legalEntityName).toBeNull()
  })

  it('une mission sans affecté n’a pas de consultant à sécuriser', async () => {
    const signals = await missionExceptionSignals(fakeManager({}), WS, missions, new Map(), '2026-11-01')
    expect(signals.get(M1)?.assigneeWithoutNextPlacement).toBe(false)
  })
})
