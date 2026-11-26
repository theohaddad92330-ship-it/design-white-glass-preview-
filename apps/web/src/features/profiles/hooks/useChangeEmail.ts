import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ConfirmEmailChange,
  EmailChangeRequested,
  PendingEmailChange,
  RequestEmailChange,
  UserProfile,
} from '@bellum/contracts'
import { profileApi } from '@/features/profiles/api'
import { useSession } from '@/lib/hooks/use-session'

const PENDING_KEY = ['profile', 'email', 'pending-change'] as const

/** Returns the in-flight email change (if any) so the OTP modal can be
 *  reopened on page reload — forcing the user to confirm or wait it out. */
export function usePendingEmailChange() {
  const { user } = useSession()
  return useQuery<PendingEmailChange>({
    queryKey: PENDING_KEY,
    queryFn: () => profileApi.pendingEmailChange(),
    enabled: !!user,
    staleTime: 0,
    refetchOnWindowFocus: false,
  })
}

/** Step 1: ask the server to send an OTP to the new address. */
export function useRequestEmailChange() {
  const qc = useQueryClient()
  return useMutation<EmailChangeRequested, Error, RequestEmailChange>({
    mutationKey: ['profile', 'email', 'request-change'],
    mutationFn: body => profileApi.requestEmailChange(body),
    onSuccess: data => {
      qc.setQueryData<PendingEmailChange>(PENDING_KEY, { new_email: data.new_email })
    },
  })
}

/** Step 2: submit the OTP. Refreshes the cached profile on success. */
export function useConfirmEmailChange() {
  const qc = useQueryClient()
  return useMutation<UserProfile, Error, ConfirmEmailChange>({
    mutationKey: ['profile', 'email', 'confirm-change'],
    mutationFn: body => profileApi.confirmEmailChange(body),
    onSuccess: () => {
      qc.setQueryData<PendingEmailChange>(PENDING_KEY, { new_email: null })
      qc.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}
