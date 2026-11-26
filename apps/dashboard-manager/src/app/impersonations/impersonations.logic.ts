import type { StatutSession } from '@/lib/impersonations'

/**
 * #1665.2 — L'ÉCRAN `/impersonations` — ce qu'il CALCULE, séparé de ce qu'il
 * rend. Même discipline que `securite.logic.ts` : la jointure start/stop est
 * faite côté API (`joinImpersonationSessions`), ce module ne fait que NOMMER
 * un statut — un libellé, une couleur.
 */

const LIBELLES_STATUT: Record<StatutSession, string> = {
  ongoing: 'En cours',
  ended: 'Terminée',
  expired_sans_arret: 'Expirée sans arrêt',
}

export function libelleStatutSession(statut: StatutSession): string {
  return LIBELLES_STATUT[statut]
}

/**
 * ⚠️ ROUGE réservé à `expired_sans_arret` : c'est le seul des trois statuts
 * qui décrit un écart (l'opérateur n'a jamais cliqué « quitter l'incarnation »,
 * la session a expiré toute seule). `ongoing` et `ended` sont le produit qui
 * fonctionne — même repère que `couleurAnomalie` de l'écran sécurité, où un
 * comportement normal n'est jamais peint comme une panne.
 */
export function couleurStatutSession(statut: StatutSession): string {
  return statut === 'expired_sans_arret' ? 'var(--amber)' : 'var(--muted)'
}

/** Combien de sessions ont chaque statut — un statut absent est un VRAI zéro. */
export function resumeParStatut(sessions: ReadonlyArray<{ status: StatutSession }>): Record<StatutSession, number> {
  const resume: Record<StatutSession, number> = { ongoing: 0, ended: 0, expired_sans_arret: 0 }
  for (const session of sessions) resume[session.status] += 1
  return resume
}

/**
 * LUDOVIC-D LC.10 — /impersonations n'était qu'en lecture : une session « En cours » ne pouvait pas
 * être terminée par l'admin. Seule une session EN COURS porte « Terminer » (une session terminée
 * ou expirée n'a plus rien à arrêter — l'API répond 409).
 */
export function peutTerminer(statut: StatutSession): boolean {
  return statut === 'ongoing'
}

/** LUDOVIC-D LC.10 — QUI a terminé, lu dans l'audit (`endedBy`) ; `null` tant que la session court. */
export function finDeSession(session: { actor: string; endedBy: string | null; status: StatutSession }): string | null {
  if (session.status !== 'ended' || !session.endedBy) return null
  return session.endedBy === session.actor ? 'Quittée par l’opérateur' : `Terminée par ${session.endedBy}`
}
