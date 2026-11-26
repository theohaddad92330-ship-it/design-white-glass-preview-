/**
 * #2276.62 — LE RETOUR DU RÉSULTAT D'UN TRAVAIL DE LAURA DANS SA CONVERSATION
 * D'ORIGINE, PAR LA CLOCHE QUI EXISTE DÉJÀ.
 *
 * Échec de recette du 25/09 : la notification de fin d'un job Laura menait à
 * `/mailbox`, et aucun chemin ne ramenait le résultat dans le fil qui l'avait
 * demandé. Deux mécanismes existaient déjà séparément — la cloche
 * (`NotificationsService.createNotification`) et le lien de fil qu'utilisent
 * déjà les mentions et l'assignation de carte (`chatNotificationLink`,
 * #1940.1/#1940.7) — il ne manquait que le câblage entre les deux pour un
 * travail venu d'une conversation. GA-26 : jamais un second système.
 *
 * Ce port n'est PAS l'accusé vers les canaux branchés (`LONG_JOB_NOTIFIER`,
 * #1952.29) : celui-là est un envoi SORTANT réel vers Slack/Discord/etc.,
 * volontairement limité à ça (« aucun e-mail, aucun nouveau canal »). Celui-ci
 * est un accusé INTERNE, dans l'espace lui-même, par la cloche que chaque
 * utilisateur voit déjà pour une mention ou une carte assignée — donc lui
 * seul porte le lien de retour vers la conversation.
 *
 * `@Optional` au point d'appel : sans lui, rien ne s'annonce à la cloche et
 * rien d'autre ne change — même discipline que `LONG_JOB_NOTIFIER`. Le
 * câblage réel vit dans `action-os.module.ts`.
 */

/** Jeton d'injection — voir le câblage dans `action-os.module.ts`. */
export const JOB_RETURN_NOTIFIER = Symbol('JOB_RETURN_NOTIFIER')

/**
 * La seule capacité empruntée : déposer une notification à la cloche de CET
 * utilisateur, avec un lien. Volontairement réduit à `title`/`link` : ni le
 * type ni l'origine ne varient ici (toujours un accusé système), et le corps
 * reste vide — doctrine « le CORPS des messages ne sort jamais vers un
 * humain » : seuls un compte (dans le titre) et un lien voyagent.
 */
export type JobReturnNotifier = {
  notify(userId: string, input: { title: string; link: string }): Promise<void>
}
