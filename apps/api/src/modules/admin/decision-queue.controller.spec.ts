import { DecisionQueueController } from './decision-queue.controller'
import type { DecisionQueueService } from './decision-queue.service'
import { buildDecisionQueue, emptyDecisionQueueInput } from './decision-queue'

/**
 * La porte de la file (#1647) — et surtout : l'HORLOGE est lue ICI.
 *
 * Le contrôleur est la seule couche qui appelle `new Date()`. Le service et le
 * calcul la reçoivent en paramètre, sans quoi une spec verte à Paris tomberait
 * dans une CI en UTC.
 */
describe('DecisionQueueController', () => {
  it('passe l’horloge au service, et rend ce qu’il calcule', async () => {
    const vide = buildDecisionQueue(emptyDecisionQueueInput(), new Date('2026-09-07T10:00:00.000Z'))
    const list = jest.fn().mockResolvedValue(vide)
    const controller = new DecisionQueueController({ list } as unknown as DecisionQueueService)

    const avant = Date.now()
    const result = await controller.list()
    const apres = Date.now()

    expect(list).toHaveBeenCalledTimes(1)
    const passe = list.mock.calls[0]?.[0] as Date
    expect(passe).toBeInstanceOf(Date)
    expect(passe.getTime()).toBeGreaterThanOrEqual(avant)
    expect(passe.getTime()).toBeLessThanOrEqual(apres)

    // Une file vide reste une file vide : le contrôleur n'invente rien, et les
    // douze natures voyagent avec, chacune avec sa raison de se taire.
    expect(result.items).toEqual([])
    expect(result.natures).toHaveLength(12)
  })
})
