import type { SingletonLockService } from '../locks/singleton-lock.service'
import { StatusMonitorService } from './status.monitor'
import type { StatusReport, StatusService } from './status.service'

function report(overrides: {
  status: StatusReport['status']
  database?: 'operational' | 'down'
  redis?: 'operational' | 'down'
  ia?: 'operational' | 'down'
}): StatusReport {
  return {
    status: overrides.status,
    components: {
      api: { status: 'operational', uptimeSeconds: 42, commit: 'abc1234' },
      database: { status: overrides.database ?? 'operational', latencyMs: 5 },
      redis: { status: overrides.redis ?? 'operational', latencyMs: 2 },
      ia_engine: { status: overrides.ia ?? 'operational', latencyMs: 40 },
    },
    checkedAt: new Date().toISOString(),
  }
}

type LoggerSpies = { error: jest.SpyInstance; warn: jest.SpyInstance; log: jest.SpyInstance }

function build(
  getStatus: jest.Mock,
  locks?: SingletonLockService,
): { monitor: StatusMonitorService; spies: LoggerSpies } {
  const monitor = new StatusMonitorService({ getStatus } as unknown as StatusService, locks)
  const logger = monitor['logger']
  return {
    monitor,
    spies: {
      error: jest.spyOn(logger, 'error').mockImplementation(() => {}),
      warn: jest.spyOn(logger, 'warn').mockImplementation(() => {}),
      log: jest.spyOn(logger, 'log').mockImplementation(() => {}),
    },
  }
}

describe('StatusMonitorService', () => {
  it('stays silent while everything is operational', async () => {
    const { monitor, spies } = build(jest.fn().mockResolvedValue(report({ status: 'operational' })))

    await monitor.run()

    expect(spies.error).not.toHaveBeenCalled()
    expect(spies.warn).not.toHaveBeenCalled()
  })

  it('logs a structured ERROR (→ Sentry via the logger convention) on a down transition', async () => {
    const { monitor, spies } = build(jest.fn().mockResolvedValue(report({ status: 'degraded', ia: 'down' })))

    await monitor.run()

    expect(spies.error).toHaveBeenCalledTimes(1)
    const [message, meta] = spies.error.mock.calls[0] as [string, Record<string, unknown>]
    expect(message).toContain('degraded')
    expect(message).toContain('ia_engine')
    expect(meta['tags']).toMatchObject({ feature: 'status-monitor', status: 'degraded' })
  })

  it('does not re-alert while the same failure persists (no Sentry spam)', async () => {
    const { monitor, spies } = build(jest.fn().mockResolvedValue(report({ status: 'degraded', ia: 'down' })))

    await monitor.run()
    await monitor.run()
    await monitor.run()

    expect(spies.error).toHaveBeenCalledTimes(1)
    // Follow-up ticks still leave a trace, at warn level.
    expect(spies.warn).toHaveBeenCalledTimes(2)
  })

  it('re-alerts when the failure signature changes (degraded → down)', async () => {
    const getStatus = jest
      .fn()
      .mockResolvedValueOnce(report({ status: 'degraded', ia: 'down' }))
      .mockResolvedValueOnce(report({ status: 'down', database: 'down', ia: 'down' }))
    const { monitor, spies } = build(getStatus)

    await monitor.run()
    await monitor.run()

    expect(spies.error).toHaveBeenCalledTimes(2)
  })

  it('logs the recovery and alerts again on the next incident', async () => {
    const getStatus = jest
      .fn()
      .mockResolvedValueOnce(report({ status: 'degraded', redis: 'down' }))
      .mockResolvedValueOnce(report({ status: 'operational' }))
      .mockResolvedValueOnce(report({ status: 'degraded', redis: 'down' }))
    const { monitor, spies } = build(getStatus)

    await monitor.run()
    await monitor.run()
    await monitor.run()

    expect(spies.error).toHaveBeenCalledTimes(2)
    expect(spies.log.mock.calls.some(call => String(call[0]).includes('recovered'))).toBe(true)
  })

  it('never throws out of the cron tick when the check itself fails', async () => {
    const { monitor, spies } = build(jest.fn().mockRejectedValue(new Error('boom')))

    await expect(monitor.run()).resolves.toBeUndefined()
    expect(spies.warn).toHaveBeenCalled()
  })

  it('runs under the singleton lock when one is wired', async () => {
    const withLock = jest.fn(async (_name: string, fn: () => Promise<void>, _ttlSeconds?: number) => {
      await fn()
      return true
    })
    const locks = { withLock } as unknown as SingletonLockService
    const getStatus = jest.fn().mockResolvedValue(report({ status: 'operational' }))
    const { monitor } = build(getStatus, locks)

    await monitor.run()

    expect(withLock).toHaveBeenCalledWith('status-monitor', expect.any(Function), expect.any(Number))
    // The lock TTL must sit BELOW the 5-min schedule so the next tick can acquire it.
    const ttlSeconds = withLock.mock.calls[0]?.[2]
    expect(ttlSeconds).toBeDefined()
    expect(ttlSeconds as number).toBeLessThan(5 * 60)
    expect(getStatus).toHaveBeenCalledTimes(1)
  })
})
