import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The `useDebounce` hook is used to debounce a value.
 * "Debouncing a value" means that the value is only updated after a certain amount of time has passed without
 * it being changed.
 *
 * @param value The value to debounce
 * @param delayInMs The delay in milliseconds. Defaults to 500ms
 *
 * @returns An array with the debounced value as the first value, and a function to override the value as the second value
 */
export function useDebounce<T>(value: T, delayInMs = 500): [T, (value: T) => void] {
  const [debouncedValue, setDebouncedValue] = useState(value)
  const timeoutIdRef = useRef<null | number>(null)

  const cancelTimeout = useCallback(() => {
    if (timeoutIdRef.current !== null) clearTimeout(timeoutIdRef.current)
  }, [])

  const overrideValue = useCallback(
    (forcedValue: T) => {
      cancelTimeout()
      setDebouncedValue(forcedValue)
    },
    [cancelTimeout],
  )

  useEffect(() => {
    timeoutIdRef.current = window.setTimeout(() => setDebouncedValue(value), delayInMs)

    return () => cancelTimeout()
  }, [value, delayInMs, cancelTimeout])

  return [debouncedValue, overrideValue]
}
