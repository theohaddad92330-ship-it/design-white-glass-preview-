import { useMutation } from '@tanstack/react-query'
import { authApi } from '@/features/auth/api'

export function useResetPassword() {
  return useMutation<{ ok: true }, Error, string>({
    mutationKey: ['auth', 'resetPassword'],
    mutationFn: (email: string) => authApi.resetPassword(email),
  })
}
