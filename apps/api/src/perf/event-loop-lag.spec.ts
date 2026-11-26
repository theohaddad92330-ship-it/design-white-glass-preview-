import { Logger } from '@nestjs/common'
import {
  EVENT_LOOP_LAG_WARN_P99_MS,
  EventLoopLagMonitor,
  currentEventLoopLagP99Ms,
  eventLoopLagWarning,
} from './event-loop-lag'

/**
 * Incident boucle API (05/10/2026) — un job d'import ZIP affamait la boucle
 * Node ; les journaux ne montraient que des « timeout exceeded when trying to
 * connect » (pg-pool) et accusaient la base, qui était au repos. Ce moniteur
 * dit ce qui se passe VRAIMENT : le retard de la boucle, au p99.
 */
describe('EventLoopLagMonitor (incident 05/10/2026)', () => {
  afterEach(() => jest.restoreAllMocks())

  it('(i) seuil à 200 ms', () => {
    expect(EVENT_LOOP_LAG_WARN_P99_MS).toBe(200)
  })

  it('(i) ne dit RIEN au seuil ou en dessous', () => {
    expect(eventLoopLagWarning(150)).toBeNull()
    expect(eventLoopLagWarning(200)).toBeNull()
    expect(eventLoopLagWarning(null)).toBeNull()
  })

  it('(i) nomme le retard au-dessus du seuil', () => {
    expect(eventLoopLagWarning(1860.4)).toBe('event loop lag p99=1860ms (seuil 200ms)')
  })

  it('(i) le moniteur ne logge un WARN qu’au-dessus du seuil', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    const monitor = new EventLoopLagMonitor()
    monitor.report(150)
    expect(warn).not.toHaveBeenCalled()
    monitor.report(250)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('event loop lag p99=250ms (seuil 200ms)')
  })

  it('mesure réellement la boucle : un blocage synchrone de 300 ms se voit au p99', async () => {
    const monitor = new EventLoopLagMonitor()
    monitor.onApplicationBootstrap()
    try {
      await new Promise(resolve => setTimeout(resolve, 60))
      const until = Date.now() + 300
      while (Date.now() < until) {
        // blocage volontaire de la boucle
      }
      await new Promise(resolve => setTimeout(resolve, 60))
      expect(currentEventLoopLagP99Ms()).toBeGreaterThan(200)
    } finally {
      monitor.onModuleDestroy()
    }
  })
})
