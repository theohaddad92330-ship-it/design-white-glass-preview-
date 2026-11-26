import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/features/auth/api'

/** Triggers /auth/resend-email-otp/:userId. Subject to a 60s cooldown per
 *  email enforced by the API (`OtpService` throttle key). */
export function useResendEmailOtp() {
  return useMutation<{ ok: true }, Error, string>({
    mutationKey: ['auth', 'resendEmailOtp'],
    mutationFn: (userId: string) => authApi.resendEmailOtp(userId),
  })
}
