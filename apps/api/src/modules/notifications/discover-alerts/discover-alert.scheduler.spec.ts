import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DiscoverAlertScheduler } from './discover-alert.scheduler'

describe('l’exécuteur de cadence — l’APPELANT qui manquait', () => {
  it('appelle réellement l’émetteur', async () => {
    // Le défaut n°1 du dépôt : du code juste que personne n'appelle.
    // `saved_views.last_run_at` n'avait aucun écrivain avant ce lot.
    const alerts = { run: jest.fn(async () => ({ scanned: 0, inApp: 0, outbound: 0, skipped: {} })) }
    const scheduler = new DiscoverAlertScheduler(alerts as never)
    await scheduler.runDiscoverAlerts()
    expect(alerts.run).toHaveBeenCalledTimes(1)
  })

  it('ne fait pas échouer le tick quand l’émetteur lève', async () => {
    const alerts = { run: jest.fn(async () => Promise.reject(new Error('base injoignable'))) }
    const scheduler = new DiscoverAlertScheduler(alerts as never)
    await expect(scheduler.runDiscoverAlerts()).resolves.toBeUndefined()
  })

  it('prend le verrou de tick — à N répliques, le cron part N fois (GA-76)', () => {
    const source = readFileSync(join(__dirname, 'discover-alert.scheduler.ts'), 'utf8')
    // Preuve de lecture : le fichier existe et porte bien un cron.
    expect(source.length).toBeGreaterThan(500)
    expect(source).toContain('@Cron(')
    expect(source).toContain('withSingletonLock(this.locks')
  })
})
