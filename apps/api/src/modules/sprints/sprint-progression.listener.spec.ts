import { Logger } from '@nestjs/common'
import { SprintProgressionBus } from './sprint-progression.bus'
import { SprintProgressionListener } from './sprint-progression.listener'
import type { SprintsService } from './sprints.service'

/**
 * m18 — l'écouteur qui remplace l'import direct `ContactsService →
 * SprintsService`. Il s'abonne au bus à l'initialisation du module et
 * délègue à `SprintsService.applyEvent`, en attrapant SES PROPRES erreurs :
 * un échec de bascule ne doit jamais remonter jusqu'à l'émetteur.
 */
describe('SprintProgressionListener', () => {
  const event = {
    workspaceId: 'ws-1',
    accountId: 'acc-1',
    event: 'meeting_booked' as const,
    sourceRef: 'action-1',
  }

  function make() {
    const bus = new SprintProgressionBus()
    const sprints = { applyEvent: jest.fn().mockResolvedValue({ applied: true, switch: null, level: 'focus' }) }
    const listener = new SprintProgressionListener(bus, sprints as unknown as SprintsService)
    return { bus, sprints, listener }
  }

  it('s’abonne au bus dès l’initialisation du module', async () => {
    const { bus, sprints, listener } = make()
    listener.onModuleInit()

    await bus.emit(event)

    expect(sprints.applyEvent).toHaveBeenCalledWith('ws-1', 'acc-1', 'meeting_booked', 'action-1')
  })

  it('un échec de SprintsService.applyEvent ne remonte pas à l’émetteur', async () => {
    const { bus, sprints, listener } = make()
    sprints.applyEvent.mockRejectedValueOnce(new Error('sprints db down'))
    listener.onModuleInit()

    await expect(bus.emit(event)).resolves.toBeUndefined()
  })

  it('journalise l’échec plutôt que de le taire en silence', async () => {
    const { bus, sprints, listener } = make()
    sprints.applyEvent.mockRejectedValueOnce(new Error('sprints db down'))
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    listener.onModuleInit()

    await bus.emit(event)

    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
