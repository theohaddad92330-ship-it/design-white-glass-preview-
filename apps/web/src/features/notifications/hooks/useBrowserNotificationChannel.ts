import { useCallback, useSyncExternalStore } from 'react'
import {
  browserNotificationPermission,
  isBrowserNotificationChannelEnabled,
  requestBrowserNotificationPermission,
  setBrowserNotificationChannelEnabled,
  subscribeToBrowserNotificationChannelChanges,
  type BrowserNotificationPermission,
} from '@/features/notifications/browser-channel/browser-notification-channel'

/**
 * #1938.3 — le réglage ET la permission de CE navigateur, pour Réglages ›
 * Notifications.
 *
 * Ni `Notification.permission` ni le `localStorage` du réglage ne vivent dans
 * React : `useSyncExternalStore` est ce qui les rend réactifs — un geste posé
 * ici, ou dans un autre onglet, se voit sans recharger la page.
 *
 * `setChannelEnabled(false)` retire toujours le réglage, sans jamais toucher
 * au navigateur — décocher ne dépend d'aucune permission. `setChannelEnabled(true)`
 * est le SEUL chemin par lequel `Notification.requestPermission()` est
 * appelée (voir `browser-notification-channel.ts`), et elle n'est invoquée
 * ici qu'à l'intérieur de la fonction retournée à l'appelant — jamais depuis
 * un effet : c'est l'appelant (un `onCheckedChange`) qui porte le geste.
 */
export function useBrowserNotificationChannel() {
  const permission = useSyncExternalStore(subscribeToBrowserNotificationChannelChanges, browserNotificationPermission)
  const enabled = useSyncExternalStore(
    subscribeToBrowserNotificationChannelChanges,
    isBrowserNotificationChannelEnabled,
  )

  const setChannelEnabled = useCallback(async (next: boolean): Promise<BrowserNotificationPermission> => {
    if (!next) {
      setBrowserNotificationChannelEnabled(false)
      return browserNotificationPermission()
    }
    // Un numéro déjà `granted` re-résout immédiatement sans ré-afficher
    // l'invite native (comportement du navigateur, pas du produit) ; un
    // numéro `denied` re-résout `denied` sans jamais la rouvrir — l'écran le
    // dit plutôt que de proposer un geste mort.
    const result = await requestBrowserNotificationPermission()
    setBrowserNotificationChannelEnabled(result === 'granted')
    return result
  }, [])

  return {
    permission,
    enabled,
    active: enabled && permission === 'granted',
    setChannelEnabled,
  }
}
