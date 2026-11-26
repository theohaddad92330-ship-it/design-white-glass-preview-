import { SLOW_SOURCE_MS, timedSource, withDeadline } from './briefing-source-timing'

describe('briefing-source-timing (#4293.11)', () => {
  afterEach(() => jest.useRealTimers())

  it('une source rapide est journalisée avec son nom et sa durée, sans alerte', async () => {
    const sink = { log: jest.fn(), warn: jest.fn() }
    await expect(timedSource(sink, 'tasks', Promise.resolve(42))).resolves.toBe(42)
    expect(sink.log).toHaveBeenCalledWith(expect.stringMatching(/^briefing\.source name=tasks ms=\d+$/))
    expect(sink.warn).not.toHaveBeenCalled()
  })

  it('une source lente est signalée en warn avec son nom — la plus lente se lit au journal', async () => {
    jest.useFakeTimers()
    const sink = { log: jest.fn(), warn: jest.fn() }
    const slow = new Promise<string>(resolve => setTimeout(() => resolve('ok'), SLOW_SOURCE_MS + 500))
    const pending = timedSource(sink, 'mail', slow)
    await jest.advanceTimersByTimeAsync(SLOW_SOURCE_MS + 500)
    await expect(pending).resolves.toBe('ok')
    expect(sink.warn).toHaveBeenCalledWith(expect.stringContaining('name=mail'))
    expect(sink.warn).toHaveBeenCalledWith(expect.stringContaining('slow=true'))
  })

  it('une source qui échoue est journalisée puis son erreur remonte inchangée', async () => {
    const sink = { log: jest.fn(), warn: jest.fn() }
    await expect(timedSource(sink, 'agenda', Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(sink.log).toHaveBeenCalledTimes(1)
  })

  it('une source externe qui dépasse son délai rend le repli honnête, sans attendre la fin', async () => {
    jest.useFakeTimers()
    const never = new Promise<string>(() => {})
    const pending = withDeadline(never, 12_000, () => 'unavailable')
    await jest.advanceTimersByTimeAsync(12_000)
    await expect(pending).resolves.toBe('unavailable')
  })

  it('une source qui répond à temps garde sa vraie valeur (le repli ne la remplace pas)', async () => {
    await expect(withDeadline(Promise.resolve('ready'), 12_000, () => 'unavailable')).resolves.toBe('ready')
  })
})
