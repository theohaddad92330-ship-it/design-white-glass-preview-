import type { NotificationItem } from '@bellum/contracts'

/**
 * #1938.3 — QUOI relayer, extrait pour être testé sans monter de composant.
 *
 * Le navigateur ne décide de rien : il relaie ce qui est déjà NEUF et déjà
 * NON LU dans le même flux que la cloche (`useNotifications`). `previouslySeen`
 * porte les identifiants déjà vus PAR CE RELAIS — au premier rendu, l'appelant
 * doit y mettre tout ce qui existe déjà (voir `BrowserNotificationRelay`),
 * sinon une notification vieille d'hier serait relayée au montage comme si
 * elle venait d'arriver.
 */
export function newUnreadNotifications(
  previouslySeen: ReadonlySet<string>,
  notifications: readonly NotificationItem[],
): NotificationItem[] {
  // #4158.18 — une entrée CALCULÉE (« des collègues attendent ») est un état, pas un
  // événement : elle ne sonne pas, elle se lit dans la cloche.
  return notifications.filter(
    notification => !previouslySeen.has(notification.id) && notification.read_at === null && !notification.derived,
  )
}
