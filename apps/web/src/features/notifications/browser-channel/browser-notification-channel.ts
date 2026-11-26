/**
 * #1938.3 — LE CANAL NOTIFICATION NAVIGATEUR.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE C'EST, ET CE QUE ÇA N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Le navigateur est un CANAL de plus pour ce qui est déjà notifiable — pas une
 * source de vérité, pas un nouveau motif de sollicitation. Ce module ne décide
 * jamais QUOI notifier : `BrowserNotificationRelay` relaie le même flux que la
 * cloche (`useNotifications`), rien de plus. Il n'y a ici NI service worker NI
 * fournisseur de push tiers — juste l'API `Notification` native, qui ne montre
 * quelque chose que si l'onglet est ouvert. Un vrai canal push serait un
 * chantier à part (service worker, clés, endpoint serveur) ; ce lot porte le
 * geste de permission et le relais en foreground, borné exprès.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE RÉGLAGE VIT DANS `localStorage`, PAS CÔTÉ SERVEUR — ET C'EST DÉLIBÉRÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `GA-26` demande qu'un réglage vive à un seul endroit — mais l'endroit qui
 * compte ici n'est pas le compte, c'est LE NAVIGATEUR : `Notification.permission`
 * est elle-même une propriété par (origine, navigateur, appareil), jamais par
 * compte. Un réglage stocké côté serveur mentirait sur ce que CE navigateur
 * peut vraiment faire dès le second appareil — « activé » sur le téléphone
 * laisserait croire qu'il l'est aussi sur l'ordinateur, qui n'a jamais vu la
 * demande de permission. Stocker le même axe que la permission, au même
 * endroit qu'elle, est ce qui les garde en accord.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUATRE ÉTATS, JAMAIS TROIS NI UN « 0 »
 * ─────────────────────────────────────────────────────────────────────────────
 * `default` (jamais demandé), `granted`, `denied` — les trois que le
 * navigateur connaît — PLUS `unsupported`, un navigateur qui ne porte pas
 * l'API du tout. Aucun des quatre ne s'affiche comme une absence : « jamais
 * demandé » n'est pas « 0 notification », et « ce navigateur ne sait pas »
 * n'est pas silencieusement confondu avec « refusé ». `denied` est
 * IRRÉVERSIBLE depuis cette page — `Notification.requestPermission()` y
 * rerésout `denied` sans jamais rouvrir l'invite native — et l'écran le DIT
 * plutôt que de proposer un bouton mort.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SANS PERMISSION : DÉGRADATION STRICTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune fonction d'ici ne fait un appel réseau — il n'y en a nulle part dans
 * ce module. `showBrowserNotification` sort avant toute construction si le
 * réglage est éteint OU si la permission n'est pas `granted` : chemin
 * byte-identique à « la fonctionnalité n'existe pas ».
 */

export const BROWSER_NOTIFICATION_ENABLED_KEY = 'bellum:browser-notifications-enabled'

/**
 * #2082.1 — la proposition d'activer ce canal, au jalon « premier dossier
 * consulté » (`dossier_viewed` de la liste d'activation). MÊME endroit et
 * MÊME raison que {@link BROWSER_NOTIFICATION_ENABLED_KEY} : un refus est
 * une propriété de CE navigateur, pas du compte — le proposer de nouveau sur
 * un autre appareil n'est pas « revenir sur un refus », c'est une machine qui
 * n'a encore rien vu.
 */
export const NOTIFICATIONS_PROPOSAL_DISMISSED_KEY = 'bellum:browser-notifications-proposal-dismissed'

/** #1938.3 — l'événement que `setBrowserNotificationChannelEnabled` émet pour
 *  que ce qui a lu le réglage AVANT le geste (typiquement `BrowserNotificationChannel`,
 *  monté à la racine) se resynchronise sans recharger la page. */
const CHANNEL_CHANGE_EVENT = 'bellum:browser-notifications-channel-changed'

/** Les trois états réels du navigateur, plus `unsupported` — un navigateur qui
 *  ne porte pas l'API n'a pas de `Notification.permission` à lire. */
export type BrowserNotificationPermission = 'unsupported' | NotificationPermission

/** L'API est-elle même présente ? Lu à chaque appel — un onglet ne change pas
 *  de navigateur en cours de vie, mais un test peut la poser puis la retirer. */
export function browserNotificationSupport(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/** Le SEUL endroit qui lit `Notification.permission` — jamais mémorisé, pour
 *  ne jamais servir un état périmé après un geste. */
export function browserNotificationPermission(): BrowserNotificationPermission {
  if (!browserNotificationSupport()) return 'unsupported'
  return window.Notification.permission
}

/** Le réglage personnel : CE navigateur relaie-t-il le flux in-app existant en
 *  notification native ? Éteint par défaut (#1938.3) — un `localStorage`
 *  bloqué (mode privé, quota) rend `false`, jamais une exception. */
export function isBrowserNotificationChannelEnabled(): boolean {
  try {
    return window.localStorage.getItem(BROWSER_NOTIFICATION_ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function setBrowserNotificationChannelEnabled(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(BROWSER_NOTIFICATION_ENABLED_KEY, '1')
    else window.localStorage.removeItem(BROWSER_NOTIFICATION_ENABLED_KEY)
  } catch {
    // Mode privé / quota : le réglage ne survit pas à cet appel, ce qui revient
    // au défaut ÉTEINT — jamais une exception remontée à l'appelant.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANNEL_CHANGE_EVENT))
}

/** #2082.1 — la proposition a-t-elle déjà été refusée sur CE navigateur ?
 *  Un `localStorage` bloqué (mode privé, quota) rend `false` — jamais une
 *  exception : dégrader vers « pas encore refusée » ne fait au pire que
 *  reproposer une fois de plus, jamais planter l'écran qui vient de montrer
 *  un dossier. */
export function isNotificationsProposalDismissed(): boolean {
  try {
    return window.localStorage.getItem(NOTIFICATIONS_PROPOSAL_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/** #2082.1 — le refus : une proposition refusée ne revient JAMAIS sur ce
 *  navigateur. Pas d'événement à émettre ici — contrairement au réglage du
 *  canal, rien d'autre ne lit ce drapeau en direct pendant la session. */
export function dismissNotificationsProposal(): void {
  try {
    window.localStorage.setItem(NOTIFICATIONS_PROPOSAL_DISMISSED_KEY, '1')
  } catch {
    // Mode privé / quota : le refus ne survit pas à cet appel — au pire, la
    // proposition réapparaît, jamais une exception remontée à l'appelant.
  }
}

/** S'abonner aux changements du réglage — utilisé par `BrowserNotificationChannel`
 *  (racine) pour savoir, sans recharger la page, qu'un geste posé dans
 *  Réglages a changé ce que CE navigateur doit faire. */
export function subscribeToBrowserNotificationChannelChanges(listener: () => void): () => void {
  window.addEventListener(CHANNEL_CHANGE_EVENT, listener)
  return () => window.removeEventListener(CHANNEL_CHANGE_EVENT, listener)
}

/** Ce que le canal peut faire MAINTENANT sur CE navigateur — combine le
 *  réglage et la permission, jamais l'un sans l'autre. */
export function browserNotificationChannelActive(): boolean {
  return isBrowserNotificationChannelEnabled() && browserNotificationPermission() === 'granted'
}

/**
 * LA SEULE porte vers `Notification.requestPermission` — #1938.3.
 *
 * Appelée UNIQUEMENT depuis un geste utilisateur (voir
 * `useBrowserNotificationChannel`, qui la déclenche depuis `onCheckedChange`),
 * jamais depuis un effet de montage. Gardé par
 * `apps/web/src/architecture/browser-notification-permission-is-a-gesture.test.ts`.
 */
export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermission> {
  if (!browserNotificationSupport()) return 'unsupported'
  return window.Notification.requestPermission()
}

/**
 * Montre une notification native, si — et seulement si — tout le permet.
 *
 * Ne lève JAMAIS : un relais raté (permission révoquée entre deux lignes, un
 * navigateur qui refuse silencieusement) ne doit pas casser l'écran qui l'a
 * déclenché — exactement la garantie que `SmsChannelService.dispatch` tient
 * déjà pour le canal SMS.
 */
export function showBrowserNotification(input: {
  title: string
  body: string
  tag: string
  onClick?: () => void
}): void {
  if (!browserNotificationChannelActive()) return
  try {
    const notification = new window.Notification(input.title, { body: input.body, tag: input.tag })
    if (input.onClick) {
      const onClick = input.onClick
      notification.onclick = () => {
        onClick()
        notification.close()
      }
    }
  } catch {
    // Le navigateur lui-même est le « fournisseur » ici ; un refus silencieux
    // (permission révoquée entre deux lignes, quota de notifications) reste
    // NON-FATAL — l'écran qui a déclenché ce relais continue sa vie.
  }
}
