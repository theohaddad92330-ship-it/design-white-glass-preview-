import { InFlight, ShortTtlCache } from './short-ttl-cache'

describe('ShortTtlCache', () => {
  it('ne relit pas dans le TTL, relit après', async () => {
    let t = 1000
    const cache = new ShortTtlCache<number>(60_000, 10, () => t)
    const load = jest.fn().mockResolvedValue(7)
    await cache.getOrLoad('u1:w1', load)
    await cache.getOrLoad('u1:w1', load)
    expect(load).toHaveBeenCalledTimes(1)
    t += 60_001
    await cache.getOrLoad('u1:w1', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('deux clés différentes ne se mélangent jamais', async () => {
    const cache = new ShortTtlCache<string>(60_000)
    const a = await cache.getOrLoad('u1:w1', async () => 'a')
    const b = await cache.getOrLoad('u2:w1', async () => 'b')
    expect([a, b]).toEqual(['a', 'b'])
  })

  it('les appels concurrents partagent une seule lecture', async () => {
    const cache = new ShortTtlCache<number>(60_000)
    const load = jest.fn().mockResolvedValue(1)
    await Promise.all([cache.getOrLoad('k', load), cache.getOrLoad('k', load), cache.getOrLoad('k', load)])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("n'enregistre jamais un échec", async () => {
    const cache = new ShortTtlCache<number>(60_000)
    const load = jest.fn().mockRejectedValueOnce(new Error('panne')).mockResolvedValueOnce(2)
    await expect(cache.getOrLoad('k', load)).rejects.toThrow('panne')
    await expect(cache.getOrLoad('k', load)).resolves.toBe(2)
  })

  it('shouldCache=false : un résultat dégradé est relu', async () => {
    const cache = new ShortTtlCache<{ ok: boolean }>(60_000)
    const load = jest.fn().mockResolvedValue({ ok: false })
    await cache.getOrLoad('k', load, v => v.ok)
    await cache.getOrLoad('k', load, v => v.ok)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('invalidate vide la portée', async () => {
    const cache = new ShortTtlCache<number>(60_000)
    const load = jest.fn().mockResolvedValue(1)
    await cache.getOrLoad('u1:a', load)
    cache.invalidate('u1:')
    await cache.getOrLoad('u1:a', load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('peek rend la valeur chaude sans jamais appeler load', async () => {
    let t = 1000
    const cache = new ShortTtlCache<number>(60_000, 10, () => t)
    expect(cache.peek('k')).toBeUndefined()
    await cache.getOrLoad('k', async () => 7)
    await expect(cache.peek('k')).resolves.toBe(7)
    t += 60_001
    expect(cache.peek('k')).toBeUndefined()
  })
})

describe('InFlight', () => {
  it('partage les appels concurrents et ne retient rien ensuite', async () => {
    const flight = new InFlight<number>()
    const load = jest.fn().mockResolvedValue(1)
    await Promise.all([flight.run('k', load), flight.run('k', load)])
    expect(load).toHaveBeenCalledTimes(1)
    await flight.run('k', load)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
