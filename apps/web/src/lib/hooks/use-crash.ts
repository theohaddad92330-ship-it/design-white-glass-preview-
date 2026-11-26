import type { ApiErrorCode } from '@bellum/contracts'
import { createContext, useContext } from 'react'

/**
 * The useCrash() hook allows sending errors to the error boundary from outside
 * React component render functions (the error boundary only catches errors
 * thrown during render). Pair with <CrashHandler> which re-throws the crash
 * reason on the next render.
 */
export function useCrash(): (error: Error) => void {
  return useContext(CrashContext)
}

/**
 * Use TemporaryProblemError for transient failures (network, 3rd party down).
 * The boundary shows a retry screen.
 */
export class TemporaryProblemError extends Error {
  readonly name = 'TemporaryProblemError'
}

/**
 * Use NotFoundError when a resource cannot be found outside of an API call.
 */
export class NotFoundError extends Error {
  readonly name = 'NotFoundError'
}

/**
 * Use FunctionnalProblemError to surface an expected business-level problem
 * with a fully customised screen.
 */
export class FunctionnalProblemError extends Error {
  readonly name = 'FunctionnalProblemError'
  readonly params: FunctionnalProblemErrorParams

  constructor(params: FunctionnalProblemErrorParams) {
    super(params.principalMessage)
    this.params = params
  }
}

type FunctionnalProblemErrorParams = {
  title: string
  principalMessage: string
  firstSubText: string
  secondSubText?: string
  trackingId?: string
  buttonText?: string
  onButtonClick?: () => void
}

/**
 * Use InvalidLinkError when the link the user clicked is invalid or expired.
 */
export class InvalidLinkError extends Error {
  readonly name = 'InvalidLinkError'
}

/**
 * Use ApiError to surface an expected HTTP/API failure as a crash page.
 */
export class ApiError extends Error {
  readonly name = 'ApiError'
  readonly code: ApiErrorCode
  readonly data?: unknown

  constructor(code: ApiErrorCode, message: string, data?: unknown) {
    super(message)
    this.code = code
    this.data = data
  }
}

export function mapStatusToCode(status: number): ApiErrorCode {
  switch (status) {
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 408:
      return 'TIMEOUT'
    case 409:
      return 'CONFLICT'
    case 412:
      return 'PRECONDITION_FAILED'
    case 413:
      return 'PAYLOAD_TOO_LARGE'
    case 422:
      return 'UNPROCESSABLE_ENTITY'
    case 429:
      return 'TOO_MANY_REQUESTS'
    case 499:
      return 'CLIENT_CLOSED_REQUEST'
    case 503:
      return 'SERVICE_UNAVAILABLE'
    default:
      return 'INTERNAL_ERROR'
  }
}

export const SHOULD_REPORT_SENTRY_PER_CODE: Record<ApiErrorCode, boolean> = {
  INTERNAL_ERROR: true,
  SERVICE_UNAVAILABLE: true,
  UNPROCESSABLE_ENTITY: true,
  TOO_MANY_REQUESTS: true,
  PAYLOAD_TOO_LARGE: true,
  NOT_FOUND: false,
  UNAUTHORIZED: false,
  FORBIDDEN: false,
  TIMEOUT: false,
  CONFLICT: false,
  PRECONDITION_FAILED: false,
  CLIENT_CLOSED_REQUEST: false,
}

export const CrashContext = createContext<(err: Error) => void>(err => {
  console.error('useCrash was called but CrashContext is not available', err)
})
