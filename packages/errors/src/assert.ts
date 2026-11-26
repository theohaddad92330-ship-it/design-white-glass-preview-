import { AssertionError } from './error.js'

export function assert(condition: unknown, message = 'The assertion failed'): asserts condition {
  if (!condition) {
    throw new AssertionError(message)
  }
}
