import { BackgroundDbBudget, backgroundPoolMax, buildBackgroundDbBudget } from './background-pool-budget'

describe('#4616.4 — le travail de fond prend AU PLUS 50 % de DB_POOL_MAX', () => {
  const OLD = process.env
  beforeEach(() => {
    process.env = { ...OLD }
    delete process.env['DB_POOLER_POOL_SIZE']
    delete process.env['DB_REPLICAS']
  })
  afterEach(() => {
    process.env = OLD
  })

  it('DB_POOL_MAX=20 ⇒ le fond est plafonné à 10', () => {
    process.env['DB_POOL_MAX'] = '20'
    expect(buildBackgroundDbBudget().limit).toBe(10)
  })

  it('sait dire NON : pas 11, et jamais plus de la moitié quelle que soit la taille', () => {
    expect(backgroundPoolMax(20)).not.toBe(11)
    for (const max of [1, 2, 3, 5, 10, 15, 21, 40])
      expect(backgroundPoolMax(max)).toBeLessThanOrEqual(Math.max(1, max / 2))
  })

  it('un pool d’une connexion garde quand même un créneau au fond (jamais zéro, sinon le fond ne tourne plus)', () => {
    expect(backgroundPoolMax(1)).toBe(1)
  })

  it('le défaut (DB_POOL_MAX absent = 10) donne 5', () => {
    delete process.env['DB_POOL_MAX']
    expect(buildBackgroundDbBudget().limit).toBe(5)
  })

  it('le plafond suit le pool APRÈS le clamp de la garde de dimensionnement', () => {
    process.env['DB_POOL_MAX'] = '20'
    process.env['DB_POOLER_POOL_SIZE'] = '20' // 70 % = 14 ⇒ pool ramené à 14 ⇒ fond 7
    expect(buildBackgroundDbBudget().limit).toBe(7)
  })

  it('le budget fait attendre : jamais plus de `limit` tâches de fond en vol, l’autre moitié reste aux écrans', async () => {
    const budget = new BackgroundDbBudget(2)
    let inFlight = 0
    let peak = 0
    const gates: Array<() => void> = []
    const task = () =>
      budget.run(async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise<void>(resolve => gates.push(resolve))
        inFlight -= 1
      })
    const all = [task(), task(), task(), task()]
    await Promise.resolve()
    await Promise.resolve()
    expect(peak).toBe(2)
    while (gates.length) {
      gates.shift()?.()
      await new Promise(r => setImmediate(r))
    }
    await Promise.all(all)
    expect(peak).toBe(2)
  })

  it('libère le créneau même quand la tâche échoue', async () => {
    const budget = new BackgroundDbBudget(1)
    await expect(budget.run(async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    await expect(budget.run(async () => 'ok')).resolves.toBe('ok')
  })
})
