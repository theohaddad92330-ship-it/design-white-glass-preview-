import { useCallback, useRef, useState, useSyncExternalStore } from 'react'

type Countdown = {
  value: number
  start: (seconds: number) => void
  isActive: boolean
}
export function useCountdown(): Countdown {
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const subscribersRef = useRef<Set<() => void>>(new Set())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const subscribe = useCallback((cb: () => void) => {
    const subscribers = subscribersRef.current
    subscribers.add(cb)
    if (intervalRef.current === null) {
      intervalRef.current = setInterval(() => {
        subscribers.forEach(s => s())
      }, 1000)
    }
    return () => {
      subscribers.delete(cb)
      if (subscribers.size === 0 && intervalRef.current !== null) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [])

  const getSnapshot = useCallback(
    () => (endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - Date.now()) / 1000))),
    [endsAt],
  )

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const start = useCallback((seconds: number) => {
    setEndsAt(Date.now() + seconds * 1000)
  }, [])

  return { value, start, isActive: value > 0 }
}
