import { RoutineExecutors } from './routine-executors'

/**
 * #2392.2 — le déclencheur « routine du soir » de la clôture de fin de
 * journée.
 *
 * Même défaut à éviter que partout ailleurs dans ce module (voir
 * `availability-reconfirm.spec.ts`) : une routine inscrite au catalogue et
 * jamais atteinte. Deux niveaux : la clé ROUTE bien vers la méthode, et la
 * méthode ne notifie QUE s'il reste une boucle ouverte — jamais un
 * « bonne soirée » creux, jamais un silence sur une vraie boucle ouverte.
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
  date: '2026-09-23',
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

describe('l’exécuteur de la clôture de fin de journée (#2392.2)', () => {
  it('est ATTEINT par sa clé — une routine que le `switch` ne route pas est morte-née', async () => {
    const dayClosure = jest.fn().mockResolvedValue(EMPTY_CLOSURE)
    const executors = executorsWith(dayClosure)

    await executors.run('evening_closure_prompt', 'u1', new Date('2026-09-23T18:00:00Z'))

    expect(dayClosure).toHaveBeenCalledWith('u1', new Date('2026-09-23T18:00:00Z'))
  })

  it('se TAIT quand aucune boucle n’est ouverte — jamais un « bonne soirée » creux', async () => {
    const dayClosure = jest.fn().mockResolvedValue(EMPTY_CLOSURE)
    const executors = executorsWith(dayClosure)

    const outcome = await executors.run('evening_closure_prompt', 'u1', new Date('2026-09-23T18:00:00Z'))

    expect(outcome.notified).toBe(false)
  })

  it('notifie quand une tâche attend une décision', async () => {
    const dayClosure = jest.fn().mockResolvedValue({
      ...EMPTY_CLOSURE,
      toDecide: [
        {
          id: 't1',
          title: 'Relancer Acme',
          dueOn: '2026-09-23',
          priority: 'high',
          ownerId: 'u1',
          ownerName: 'Moi',
          accountName: 'Acme',
          contactName: null,
          resultNote: null,
        },
      ],
    })
    const executors = executorsWith(dayClosure)

    const outcome = await executors.run('evening_closure_prompt', 'u1', new Date('2026-09-23T18:00:00Z'))

    expect(outcome.notified).toBe(true)
    expect(outcome.notification?.link).toBe('/chat')
  })

  it('notifie quand un fil sortant reste sans réponse — pas seulement une tâche', async () => {
    const dayClosure = jest.fn().mockResolvedValue({
      ...EMPTY_CLOSURE,
      waitingOn: {
        state: 'ready' as const,
        reason: null,
        threads: [
          {
            id: 'th1',
            subject: 'Devis',
            contactName: 'Client',
            accountName: 'Acme',
            lastMessageAt: '2026-09-22T10:00:00Z',
          },
        ],
      },
    })
    const executors = executorsWith(dayClosure)

    const outcome = await executors.run('evening_closure_prompt', 'u1', new Date('2026-09-23T18:00:00Z'))

    expect(outcome.notified).toBe(true)
  })

  it('ne compte pas les résultats/engagements/abandons du jour comme des boucles ouvertes', async () => {
    const dayClosure = jest.fn().mockResolvedValue({
      ...EMPTY_CLOSURE,
      results: [
        {
          id: 't2',
          title: 'Fait',
          dueOn: '2026-09-23',
          priority: 'normal',
          ownerId: 'u1',
          ownerName: 'Moi',
          accountName: null,
          contactName: null,
          resultNote: 'ok',
        },
      ],
    })
    const executors = executorsWith(dayClosure)

    const outcome = await executors.run('evening_closure_prompt', 'u1', new Date('2026-09-23T18:00:00Z'))

    expect(outcome.notified).toBe(false)
  })
})
