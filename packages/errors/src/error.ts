export type Jsonable =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly Jsonable[]
  | { readonly [key: string]: Jsonable }
  | { toJSON(): Jsonable }

export type ErrorOptions = {
  cause?: Error
  context?: Jsonable
}

class BaseError extends Error {
  public readonly context?: Jsonable

  constructor(message: string, options: ErrorOptions = {}) {
    const { cause, context } = options
    super(message, { cause })
    this.name = this.constructor.name
    this.context = context
  }
}

export class TechnicalError extends BaseError {}

export class AbortedError extends BaseError {}

export class AssertionError extends BaseError {}

export class UnreachableCaseError extends TechnicalError {
  constructor(value: never) {
    super('Unreachable code reached', { context: value })
  }
}

export class NotYetImplementedError extends TechnicalError {
  constructor() {
    super('Not yet implemented')
  }
}

export type ServiceFailure = {
  type: 'not_found' | 'bad_request'
  message: string
}

export function checkDefinedAndNotNull<T>(value: T | undefined | null, context: Jsonable = {}): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new TechnicalError('Expected defined and not null value, got null or undefined', { context })
  }
  return value as NonNullable<T>
}
