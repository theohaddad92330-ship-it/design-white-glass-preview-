import { SprintProgressionBus } from './sprint-progression.bus'

/**
 * m18 — le canal « l'issue d'un contact a été enregistrée », en mémoire.
 *
 * Remplace l'import direct `ContactsService → SprintsService` (GA-07) : le
 * contact ÉMET, le module sprints ÉCOUTE. `emit` ATTEND ses écouteurs — comme
 * `EventEmitter2.emitAsync` — parce que `ContactsService.updateStatus` doit
 * pouvoir répondre après que la bascule a eu lieu (le test de bout en bout
 * dans `contacts.service.spec.ts` lit le compte juste après l'`await`).
 */
describe('SprintProgressionBus', () => {
  const event = {
    workspaceId: 'ws-1',
    accountId: 'acc-1',
    event: 'positive_reply' as const,
    sourceRef: 'action-1',
  }

  it('livre l’événement à un écouteur abonné', async () => {
    const bus = new SprintProgressionBus()
    const handler = jest.fn().mockResolvedValue(undefined)
    bus.subscribe(handler)

    await bus.emit(event)

    expect(handler).toHaveBeenCalledWith(event)
  })

  it('attend la résolution de l’écouteur avant de résoudre — sinon le geste utilisateur répondrait avant la bascule', async () => {
    const bus = new SprintProgressionBus()
    let resolved = false
    bus.subscribe(async () => {
      await Promise.resolve()
      resolved = true
    })

    await bus.emit(event)

    expect(resolved).toBe(true)
  })

  it('n’a aucun écouteur sans abonné : émettre reste sans effet, jamais une erreur', async () => {
    const bus = new SprintProgressionBus()
    await expect(bus.emit(event)).resolves.toBeUndefined()
  })

  it('prévient plusieurs écouteurs, tous appelés', async () => {
    const bus = new SprintProgressionBus()
    const first = jest.fn().mockResolvedValue(undefined)
    const second = jest.fn().mockResolvedValue(undefined)
    bus.subscribe(first)
    bus.subscribe(second)

    await bus.emit(event)

    expect(first).toHaveBeenCalledWith(event)
    expect(second).toHaveBeenCalledWith(event)
  })
})
