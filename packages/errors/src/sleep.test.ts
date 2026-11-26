import { describe, expect, it, vi } from 'vitest'
import { sleep } from './sleep.js'
import { AbortedError } from './error.js'

describe('sleep', () => {
  it('resolves after the given delay', async () => {
    vi.useFakeTimers()
    try {
      const promise = sleep(1000)
      vi.advanceTimersByTime(999)
      let resolved = false
      promise.then(() => {
        resolved = true
      })
      await Promise.resolve()
      expect(resolved).toBe(false)
      vi.advanceTimersByTime(1)
      await promise
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects immediately when the signal is already aborted (uses signal.reason)', async () => {
    const controller = new AbortController()
    controller.abort()
    // AbortController.abort() without args sets signal.reason to a DOMException('AbortError').
    // sleep() prefers signal.reason over a synthetic AbortedError, so we expect the DOMException.
    await expect(sleep(1000, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('uses a custom signal reason when already aborted', async () => {
    const reason = new Error('custom reason')
    const controller = new AbortController()
    controller.abort(reason)
    await expect(sleep(1000, { signal: controller.signal })).rejects.toBe(reason)
  })

  it('rejects when aborted during the wait (with signal.reason)', async () => {
    const controller = new AbortController()
    const promise = sleep(10_000, { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('uses a custom signal reason when aborted during the wait', async () => {
    const controller = new AbortController()
    const reason = new Error('user cancelled')
    const promise = sleep(10_000, { signal: controller.signal })
    controller.abort(reason)
    await expect(promise).rejects.toBe(reason)
  })

  it('falls back to AbortedError when aborted without a reason (forced)', async () => {
    // Simulate a signal whose reason is explicitly nullish — the only path that reaches the fallback.
    const stub = {
      aborted: true,
      reason: undefined,
      addEventListener() {},
      removeEventListener() {},
    } as unknown as AbortSignal
    await expect(sleep(1000, { signal: stub })).rejects.toBeInstanceOf(AbortedError)
  })

  it('does not throw when the signal is absent', async () => {
    vi.useFakeTimers()
    try {
      const promise = sleep(5)
      vi.advanceTimersByTime(5)
      await expect(promise).resolves.toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })
})
