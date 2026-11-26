import { RoutineExecutors } from './routine-executors'

/**
 * #2392.2 (lot clôture c1, 26/09) — les 2 déclencheurs restants de la clôture
 * quotidienne qui touchent un moment daté plutôt qu'un geste : « fin de
 * semaine » et « avant une revue manager ». Même patron que
 * `evening-closure-prompt.spec.ts` : la clé ROUTE bien vers le même
 * compilateur (`BriefingService.dayClosure`, GA-26), et la méthode ne notifie
 * QUE s'il reste une boucle ouverte.
 */
function executorsWith(dayClosure: jest.Mock): RoutineExecutors {
  const briefing = { dayClosure } as unknown as ConstructorParameters<typeof RoutineExecutors>[0]
  return new RoutineExecutors(
    briefing,
    null as never, // mailbox
    null as never, // agenda
    null as never, // ats
    null as never, // crm
    null as never, // delivery
    null as never, // crmRoutines
    null as never, // talentRoutines
    null as never, // territories
    null as never, // territorySnapshots
  )
}

const EMPTY_CLOSURE = {
  date: '2026-09-26',
  timeZone: 'Europe/Paris',
  tasksState: 'ready' as const,
  tasksReason: null,
  results: [],
  commitments: [],
  waitingOn: { state: 'ready' as const, reason: null, threads: [] },
  blocked: [],
  toDecide: [],
  firstTomorrow: null,
}

const OPEN_LOOP_CLOSURE = {
  ...EMPTY_CLOSURE,
  toDecide: [
    {
      id: 't1',
      title: 'Relancer Acme',
      dueOn: '2026-09-26',
      priority: 'high' as const,
      ownerId: 'u1',
      ownerName: 'Moi',
      accountName: 'Acme',
      contactName: null,
      resultNote: null,
    },
  ],
}

describe.each([
  ['end_of_week_closure_prompt', 'fin de semaine'],
  ['pre_manager_review_closure_prompt', 'avant la revue manager'],
] as const)('l’exécuteur de clôture %s (#2392.2)', (key, _label) => {
  it('est ATTEINT par sa clé — une routine que le `switch` ne route pas est morte-née', async () => {
    const dayClosure = jest.fn().mockResolvedValue(EMPTY_CLOSURE)
    const executors = executorsWith(dayClosure)

    await executors.run(key, 'u1', new Date('2026-09-26T15:00:00Z'))

    expect(dayClosure).toHaveBeenCalledWith('u1', new Date('2026-09-26T15:00:00Z'))
  })

  it('se TAIT quand aucune boucle n’est ouverte', async () => {
    const dayClosure = jest.fn().mockResolvedValue(EMPTY_CLOSURE)
    const executors = executorsWith(dayClosure)

    const outcome = await executors.run(key, 'u1', new Date('2026-09-26T15:00:00Z'))

    expect(outcome.notified).toBe(false)
  })

  it('notifie quand une boucle reste ouverte', async () => {
    const dayClosure = jest.fn().mockResolvedValue(OPEN_LOOP_CLOSURE)
    const executors = executorsWith(dayClosure)

    const outcome = await executors.run(key, 'u1', new Date('2026-09-26T15:00:00Z'))

    expect(outcome.notified).toBe(true)
    expect(outcome.notification?.link).toBe('/chat')
  })
})
