import type {
  NotificationInboxScope,
  NotificationItem,
  NotificationPreferences,
  PaginatedResult,
  SmsChannelSettings,
  UnreadCount,
  UpdateNotificationPreferences,
  UpdateSmsTypeOptIns,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** Thin client over the NestJS `/notifications` module. */
export const notificationsApi = {
  getPreferences(): Promise<NotificationPreferences> {
    return apiFetch<NotificationPreferences>({ path: '/notifications/preferences' })
  },
  updatePreferences(patch: UpdateNotificationPreferences): Promise<NotificationPreferences> {
    return apiFetch<NotificationPreferences>({ path: '/notifications/preferences', method: 'PATCH', body: patch })
  },
  list(page = 1, size = 20, scope: NotificationInboxScope = 'all'): Promise<PaginatedResult<NotificationItem>> {
    // #4158.14 — « Équipe » est un FILTRE de la boîte, jamais une seconde cloche.
    const filter = scope === 'all' ? '' : `&scope=${scope}`
    return apiFetch<PaginatedResult<NotificationItem>>({ path: `/notifications?page=${page}&size=${size}${filter}` })
  },
  unreadCount(): Promise<UnreadCount> {
    return apiFetch<UnreadCount>({ path: '/notifications/unread-count' })
  },
  markRead(id: string): Promise<void> {
    return apiFetch<void>({ path: `/notifications/${id}/read`, method: 'POST' })
  },
  markAllRead(): Promise<void> {
    return apiFetch<void>({ path: '/notifications/read-all', method: 'POST' })
  },
  /** #4648 — « Vider » : SUPPRIME la boîte visible (l'espace actif et le personnel), sans retour. */
  clearAll(): Promise<void> {
    return apiFetch<void>({ path: '/notifications', method: 'DELETE' })
  },

  // #1938.4 — décision Louis 13/09 batch 13 : le canal SMS des alertes urgentes.
  getSmsChannel(): Promise<SmsChannelSettings> {
    return apiFetch<SmsChannelSettings>({ path: '/notifications/sms' })
  },
  startSmsVerification(phone: string): Promise<SmsChannelSettings> {
    return apiFetch<SmsChannelSettings>({ path: '/notifications/sms/verification', method: 'POST', body: { phone } })
  },
  confirmSmsVerification(code: string): Promise<SmsChannelSettings> {
    return apiFetch<SmsChannelSettings>({
      path: '/notifications/sms/verification/confirm',
      method: 'POST',
      body: { code },
    })
  },
  updateSmsTypes(patch: UpdateSmsTypeOptIns): Promise<SmsChannelSettings> {
    return apiFetch<SmsChannelSettings>({ path: '/notifications/sms', method: 'PATCH', body: patch })
  },
  withdrawSms(): Promise<void> {
    return apiFetch<void>({ path: '/notifications/sms', method: 'DELETE' })
  },
}
