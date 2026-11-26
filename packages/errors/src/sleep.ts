import { AbortedError } from './error.js'

export type SignalParams = {
  signal?: AbortSignal | undefined
}

export async function sleep(ms: number, params: SignalParams = {}): Promise<void> {
  const { signal } = params

  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(signal?.reason ?? new AbortedError('Sleep already has signal aborted'))
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    signal?.addEventListener('abort', onAbort, { once: true })

    function onAbort() {
      clearTimeout(timer)
      reject(signal?.reason ?? new AbortedError('Sleep has been aborted'))
    }
  })
}
