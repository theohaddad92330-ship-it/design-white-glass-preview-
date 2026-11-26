/**
 * #1952.29 — L'ACCUSÉ DE FIN D'UN TRAVAIL LONG DE LAURA, VERS LES CANAUX DÉJÀ
 * BRANCHÉS — allumé par défaut, tranché Louis 16/09/2026.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION, ET SON RISQUE ASSUMÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * Recommandation faite à Louis : ÉTEINT par défaut, parce qu'un canal branché
 * est un canal d'ÉQUIPE et qu'un travail de Laura est le geste d'UNE personne —
 * l'accusé peut donc devenir du bruit partagé, et dire à toute une équipe ce
 * qu'un commercial a demandé. Louis a tranché CONTRE cette recommandation :
 * « oui, allumé par défaut ». La raison est écrite ici pour qu'un défaut assumé
 * ne redevienne pas un bug dans six semaines.
 *
 * Ce qui tient le risque : l'interrupteur existe et il est à sa place —
 * Réglages › Intégrations, la case par ÉVÉNEMENT de chaque canal, celle-là même
 * qui gouverne déjà l'accusé de fin d'analyse (`INTEGRATION_EVENTS`,
 * `integrationWantsEvent`). Décocher `laura.job.completed` coupe l'annonce pour
 * ce canal, et rien d'autre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE PORT EST, ET CE QU'IL N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * C'est un ENVOI SORTANT RÉEL, et il n'étend RIEN : il réutilise
 * `IntegrationsService.notifyUser`, donc les seuls canaux que l'espace a
 * lui-même connectés (`integrations`, une ligne par canal branché). Aucun
 * e-mail, aucun nouveau canal, aucun destinataire deviné, et jamais un message
 * vers un prospect : c'est un accusé technique vers l'espace lui-même.
 *
 * Même motif que `analysis-launch.port.ts` : le module Action OS ne dépend pas
 * de `IntegrationsModule` par sa classe, il dépend d'un contrat de DEUX lignes
 * — c'est ce qui garde la règle n°7 (retirer un module ne casse pas le reste)
 * et ce qui permet aux tests d'exécution de tourner sans file BullMQ.
 */

/** Jeton d'injection — voir le câblage dans `action-os.module.ts`. */
export const LONG_JOB_NOTIFIER = Symbol('LONG_JOB_NOTIFIER')

/**
 * La seule capacité empruntée : diffuser un événement applicatif vers les
 * canaux que CET utilisateur a connectés ET abonnés à cet événement.
 *
 * Volontairement identique à la signature de `IntegrationsService.notifyUser` :
 * une dérive de cette signature casse la compilation au câblage du module, pas
 * au premier envoi en production.
 */
export type LongJobNotifier = {
  notifyUser(userId: string, event: { type: string; text: string; data?: Record<string, unknown> }): Promise<void>
}
