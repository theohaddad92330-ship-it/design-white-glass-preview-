import { useSyncExternalStore } from 'react'
import {
  browserNotificationChannelActive,
  subscribeToBrowserNotificationChannelChanges,
} from './browser-notification-channel'
import { BrowserNotificationRelay } from './BrowserNotificationRelay'

/**
 * #1938.3 — monté au root (`__root.tsx`), à côté de `LauraDock`/`ShortcutsProvider`.
 *
 * Ne rend RIEN — et surtout n'observe RIEN — tant que le canal n'est pas
 * actif (réglage allumé ET permission `granted`) : `BrowserNotificationRelay`
 * est le seul endroit qui appelle `useNotifications()` pour ce canal, et il
 * n'est monté que d'ici. Sans permission ni réglage, ce composant ne fait
 * donc RIEN de plus qu'un composant absent — chemin byte-identique.
 */
export function BrowserNotificationChannel() {
  const active = useSyncExternalStore(subscribeToBrowserNotificationChannelChanges, browserNotificationChannelActive)
  if (!active) return null
  return <BrowserNotificationRelay />
}
