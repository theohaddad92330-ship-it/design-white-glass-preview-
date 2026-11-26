import { ChatDeepenJobsReaper, STALE_AFTER_MS } from './chat-deepen-jobs.reaper'
import { ChatDeepenJobsService } from './chat-deepen-jobs.service'

describe('ChatDeepenJobsReaper', () => {
  let markStaleBefore: jest.Mock
  let reaper: ChatDeepenJobsReaper

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-07T12:00:00.000Z'))
    markStaleBefore = jest.fn().mockResolvedValue(0)
    reaper = new ChatDeepenJobsReaper({ markStaleBefore } as unknown as ChatDeepenJobsService)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('bascule les jobs plus vieux que STALE_AFTER_MS, jamais les plus récents', async () => {
    await reaper.sweep()

    expect(markStaleBefore).toHaveBeenCalledWith(new Date(Date.now() - STALE_AFTER_MS))
  })

  it('ne relance pas un balayage déjà en vol (ré-entrance)', async () => {
    let resolveFirst: () => void = () => {}
    markStaleBefore.mockImplementationOnce(
      () =>
        new Promise<number>(resolve => {
          resolveFirst = () => resolve(0)
        }),
    )

    const first = reaper.tick()
    const second = reaper.tick()
    resolveFirst()
    await Promise.all([first, second])

    expect(markStaleBefore).toHaveBeenCalledTimes(1)
  })
})
