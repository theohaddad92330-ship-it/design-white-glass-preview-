import { useMutation } from '@tanstack/react-query'
import type { SessionResponse } from '@bellum/contracts'
import { authApi } from '@/features/auth/api'
import { sessionManager } from '@/features/auth/session-manager'

type VerifyPayload = { userId: string; code: string }

export function useVerifyEmailOtp() {
  return useMutation<SessionResponse, Error, VerifyPayload>({
    mutationKey: ['auth', 'verifyEmailOtp'],
    mutationFn: ({ userId, code }) => authApi.verifyEmailOtp(userId, code),
    onSuccess: session => {
      sessionManager.applySession(session)
    },
  })
}
