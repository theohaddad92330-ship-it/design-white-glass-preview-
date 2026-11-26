import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useNotifications } from '@/features/notifications/hooks/useNotifications'
import { notificationDestination } from '@/features/notifications/notification-link'
import { showBrowserNotification } from './browser-notification-channel'
import { newUnreadNotifications } from './relay-selection'

/**
 * #1938.3 — le relais : montré seulement quand le canal est ACTIF
 * (`BrowserNotificationChannel`), donc appelle `useNotifications()` seulement
 * à ce moment-là — c'est ce qui tient la dégradation stricte sans permission
 * (aucun appel réseau NEUF quand le canal ne l'est pas).
 *
 * Il ne décide de RIEN sur le fond : `notifications` vient du même flux que
 * la cloche, et `notificationDestination` est la même dérivation que
 * `NotificationBell`/`LauraDock` utilisent pour savoir où un clic mène
 * (GA-26 — une dérivation vit à un seul endroit).
 */
export function BrowserNotificationRelay() {
  const { notifications } = useNotifications()
  const navigate = useNavigate()
  const seen = useRef<Set<string> | null>(null)

  useEffect(() => {
    if (seen.current === null) {
      // Premier rendu : ce qui existe déjà n'est pas NEUF pour ce relais —
      // sinon toute l'histoire non lue serait montrée au montage.
      seen.current = new Set(notifications.map(notification => notification.id))
      return
    }
    for (const notification of newUnreadNotifications(seen.current, notifications)) {
      seen.current.add(notification.id)
      const destination = notificationDestination(notification.link)
      showBrowserNotification({
        title: notification.title,
        body: notification.body,
        tag: notification.id,
        onClick: destination ? () => void navigate(destination) : undefined,
      })
    }
  }, [notifications, navigate])

  return null
}
