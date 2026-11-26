import type { ApiError } from '@/lib/hooks/use-crash'
import { CrashPage } from '@/components/organisms/crash-page'
import { NotFound } from '@/components/organisms/not-found'
import { TemporaryFailureScreen } from '@/components/organisms/temporary-failure-screen'
import { Unauthorized } from '@/components/organisms/unauthorized'

export function ApiErrorHandler({ err }: { err: ApiError }) {
  switch (err.code) {
    case 'NOT_FOUND':
      return <NotFound message={err.message} />
    case 'FORBIDDEN':
    case 'UNAUTHORIZED':
      return <Unauthorized message={err.message} />
    case 'TIMEOUT':
    case 'CLIENT_CLOSED_REQUEST':
    case 'CONFLICT':
    case 'PRECONDITION_FAILED':
    case 'TOO_MANY_REQUESTS':
    case 'SERVICE_UNAVAILABLE':
      return <TemporaryFailureScreen />
    case 'PAYLOAD_TOO_LARGE':
    case 'UNPROCESSABLE_ENTITY':
    case 'INTERNAL_ERROR':
      return <CrashPage />
    default:
      return <CrashPage />
  }
}
