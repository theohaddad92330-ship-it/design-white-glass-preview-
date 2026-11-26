import { timedDiscoverSource } from './discover-source-timing'

describe('timedDiscoverSource (#5212)', () => {
  it('journalise une ligne par source avec sa durée et rend la valeur', async () => {
    const lines: string[] = []
    const ticks = [1000, 1250]
    const value = await timedDiscoverSource(
      'space_sirens',
      async () => 42,
      line => lines.push(line),
      () => ticks.shift() ?? 0,
    )
    expect(value).toBe(42)
    expect(lines).toEqual(['discover source=space_sirens ms=250 ok'])
  })

  it('journalise aussi l’échec, sans le message de l’erreur (pas de donnée), et relance', async () => {
    const lines: string[] = []
    const ticks = [0, 40]
    await expect(
      timedDiscoverSource(
        'base',
        () => Promise.reject(new Error('jean@dupont.fr')),
        line => lines.push(line),
        () => ticks.shift() ?? 0,
      ),
    ).rejects.toThrow('jean@dupont.fr')
    expect(lines).toEqual(['discover source=base ms=40 failed'])
  })

  it('les lectures lancées ensemble durent le plus long, pas la somme (parallèle)', async () => {
    const lines: string[] = []
    const slow = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
    const started = Date.now()
    await Promise.all([
      timedDiscoverSource(
        'a',
        () => slow(60),
        line => lines.push(line),
      ),
      timedDiscoverSource(
        'b',
        () => slow(60),
        line => lines.push(line),
      ),
    ])
    expect(Date.now() - started).toBeLessThan(110)
    expect(lines).toHaveLength(2)
  })
})
