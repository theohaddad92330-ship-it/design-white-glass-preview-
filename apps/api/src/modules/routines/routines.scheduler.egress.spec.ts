import { Cron } from '@nestjs/schedule'
import { RoutinesScheduler } from './routines.scheduler'
import type { EgressIpProbe } from './egress-ip-probe'
import type { RoutinesService } from './routines.service'

describe('RoutinesScheduler — la sonde d’IP sortante (#4694)', () => {
  const probe = (): { run: jest.Mock } => ({ run: jest.fn().mockResolvedValue({ verdict: 'ok' }) })

  it('passe par l’ordonnanceur des routines, une fois par heure (une IP ne change pas à la minute)', () => {
    const cron = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', RoutinesScheduler.prototype.probeEgressIp) as
      { cronTime: string; name: string } | undefined
    expect(cron?.cronTime).toBe('0 * * * *')
    expect(cron?.name).toBe('egress-ip-probe')
    expect(typeof Cron).toBe('function')
  })

  it('lance la sonde', async () => {
    const p = probe()
    const scheduler = new RoutinesScheduler({} as RoutinesService, undefined, p as unknown as EgressIpProbe)
    await scheduler.probeEgressIp()
    expect(p.run).toHaveBeenCalledTimes(1)
  })

  it('sans sonde câblée, rien ne se passe', async () => {
    const scheduler = new RoutinesScheduler({} as RoutinesService)
    await expect(scheduler.probeEgressIp()).resolves.toBeUndefined()
  })

  it('une sonde qui lève ne fait pas tomber l’ordonnanceur', async () => {
    const p = { run: jest.fn().mockRejectedValue(new Error('boom')) }
    const scheduler = new RoutinesScheduler({} as RoutinesService, undefined, p as unknown as EgressIpProbe)
    await expect(scheduler.probeEgressIp()).resolves.toBeUndefined()
  })
})
