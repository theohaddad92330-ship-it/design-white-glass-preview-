/**
 * The types below help implementing type-safe error management
 *
 * Why not a class ? So we can serialize it
 *
 * Wht not a boolean "ok" or "success" property ? For historial reasons, from the time we used
 * tsoa.
 */

/**
 * Wraps an arbitrary type to convey the information that it's the result of a successful operation
 */
export type Success<OUTPUT> = {
  readonly type: 'success'
  readonly output: OUTPUT
}

/**
 * Wraps an arbitrary type to convey the information that it's the description of a problem that occurred during a previous operation
 */
export type Failure<PROBLEM> = {
  readonly type: 'failure'
  readonly problem: PROBLEM
}

/**
 * Typesafe way to represent the successful or failed outcome of an operation
 */
export type Result<OUTPUT, PROBLEM> = Success<OUTPUT> | Failure<PROBLEM>

export function success(): Success<undefined>
export function success<OUTPUT>(output: OUTPUT): Success<OUTPUT>
export function success<OUTPUT>(output?: OUTPUT): Success<OUTPUT> | Success<undefined> {
  if (output === undefined) return { type: 'success', output: undefined }
  return { type: 'success', output }
}

export function failure(): Failure<undefined>
export function failure<PROBLEM>(problem: PROBLEM): Failure<PROBLEM>
export function failure<PROBLEM>(problem?: PROBLEM): Failure<PROBLEM> | Failure<undefined> {
  if (problem === undefined) return { type: 'failure', problem: undefined }
  return { type: 'failure', problem }
}

export function isSuccess<OUTPUT>(result: Result<OUTPUT, unknown>): result is Success<OUTPUT> {
  return result.type === 'success'
}

/**
 * Assumes that the result is a success and returns the output. Throws an exception if the result wasn't a success.
 * Use this function when the result can only be a success.
 */
export function assertSuccess<OUTPUT>(result: Result<OUTPUT, unknown>): OUTPUT {
  if (result.type !== 'success') {
    throw new Error(`Failed success assertion: ${JSON.stringify(result.problem)}`)
  }
  return result.output
}

export function isFailure<PROBLEM>(result: Result<unknown, PROBLEM>): result is Failure<PROBLEM> {
  return result.type === 'failure'
}

/**
 * Unwraps a `Result` into its success value, delegating failure handling to
 * the caller. `onFailure` is typed as returning `never` so controllers can
 * throw the domain-appropriate exception (e.g. `NotFoundException`,
 * `UnauthorizedException`) and TypeScript understands control flow ends there.
 */
export function unwrap<OUTPUT, PROBLEM>(
  result: Result<OUTPUT, PROBLEM>,
  onFailure: (problem: PROBLEM) => never,
): OUTPUT {
  if (result.type === 'success') return result.output
  return onFailure(result.problem)
}
