import { newSubscribable } from '@bellum/observable'
import type { Observable } from '@bellum/observable'

export type ThrownValue = {
  value: unknown
  stringified: string
  error: Error
}

const thrownValuesSubscribable = newSubscribable<ThrownValue>({
  value: undefined,
  stringified: 'undefined',
  error: new Error(),
})

export const thrownValuesObservable: Observable<ThrownValue> = thrownValuesSubscribable

export function ensureError(value: unknown): Error {
  if (value instanceof Error) return value

  let stringified = '[Unable to stringify the thrown value]'
  try {
    stringified = JSON.stringify(value)
  } catch {
    // ignore stringify failures
  }

  const error = new Error(`This value was thrown as is, not through an Error: ${stringified}`)
  thrownValuesSubscribable.setValue({ value, stringified, error })
  return error
}
