import type { CallRecord, TelephonyCredentials, TelephonyStatus } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/** « Ton outil d'appel » — Bellum lit le journal, il ne compose jamais. */
export const telephonyApi = {
  status(): Promise<TelephonyStatus> {
    return apiFetch<TelephonyStatus>({ path: '/telephony/status' })
  },
  connect(body: TelephonyCredentials): Promise<TelephonyStatus> {
    return apiFetch<TelephonyStatus>({ path: '/telephony/connect', method: 'POST', body })
  },
  disconnect(): Promise<void> {
    return apiFetch<void>({ path: '/telephony', method: 'DELETE' })
  },
  async calls(days = 30): Promise<CallRecord[]> {
    const page = await apiFetch<{ items: CallRecord[]; searched: true; scanned: number | null }>({
      path: `/telephony/calls?days=${days}`,
    })
    return page.items
  },
}

export function useTelephonyStatus() {
  return useQuery({ queryKey: ['telephony', 'status'], queryFn: telephonyApi.status, staleTime: 60_000 })
}

export function useConnectTelephony() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: telephonyApi.connect,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['telephony'] }),
  })
}

export function useDisconnectTelephony() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: telephonyApi.disconnect,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['telephony'] }),
  })
}
