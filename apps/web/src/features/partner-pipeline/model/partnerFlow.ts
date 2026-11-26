/**
 * #1428 — « pour chaque partenaire, afficher de vrais indicateurs : besoins
 * reçus sur 90 jours, besoins confiés en retour, missions réalisées ensemble,
 * flux actif / dormant, évolution récente ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LA DEMANDE A RÉVÉLÉ : QUATRE COLONNES QUE PERSONNE N'ÉCRIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Les quatre compteurs demandés existent en base — `needs_received_90d`,
 * `needs_given_90d`, `placements_active`, `placements_total` — avec un
 * `DEFAULT 0`. En cherchant qui les met à jour, on ne trouve QUE le semis de
 * démonstration : aucun service, aucune tâche, aucune migration de production
 * n'y écrit. Dans un espace réel ils valent 0 pour toujours.
 *
 * Et la carte les affichait déjà : « 0 besoin(s) reçu(s) · 0 confié(s) en
 * retour, sur 90 jours » — une phrase qui se lit comme une mesure, sous un
 * score qui, lui, dit correctement « pas encore assez d'historique ». Le
 * service traite d'ailleurs déjà ces compteurs comme inconnus quand ils valent
 * zéro (`row.needsReceived90d > 0 ? … : null`), pour que l'axe SORTE du
 * dénominateur. L'écran, lui, ne l'avait pas appris.
 *
 * Livrer le littéral du retour aurait multiplié le mensonge par quatre. Ce
 * fichier fait l'inverse : il DISTINGUE, une fois, ce qui est compté de ce que
 * personne ne compte, et l'écran dit lequel.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ POURQUOI « 0 » NE PEUT PAS ÊTRE LU COMME UN ZÉRO MESURÉ, ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * La question du dépôt : *si cette valeur est absente, « 0 » est-il VRAI ?*
 * Ici la valeur n'est pas absente — elle est à sa valeur par DÉFAUT, ce qui
 * est la même chose vue de la base et l'inverse vue de l'écran. Un partenaire
 * avec qui on a réellement travaillé zéro fois et un partenaire dont personne
 * n'a jamais compté les échanges rendent le même octet. Tant qu'aucun écrivain
 * n'existe, la lecture honnête est « personne ne le compte ».
 *
 * Le jour où un compteur est branché, ce fichier est le seul endroit à changer.
 */

/** Ce que la carte reçoit du serveur, réduit à ce qui décide du flux. */
export type PartnerFlowInput = {
  needsReceived90d: number
  needsGiven90d: number
  placementsActive: number
  placementsTotal: number
  /** La date de la dernière action ENREGISTRÉE sur la relation (création,
   *  changement d'étape, déclaration de clause). Le seul de ces cinq champs
   *  qu'un chemin de production écrit vraiment. */
  lastActivityAt: string | null
}

/**
 * L'état de la relation, tel qu'on peut HONNÊTEMENT le dire.
 *
 * `uncounted` n'est pas un cas d'erreur : c'est la réponse vraie tant que rien
 * ne compte les échanges. Elle est distincte de `dormant` — « on n'a rien
 * échangé » et « personne ne mesure ce qu'on échange » n'appellent pas le même
 * geste, et les confondre est exactement ce que la carte faisait.
 */
type PartnerFlowState = 'active' | 'dormant' | 'uncounted'

export type PartnerFlow = {
  state: PartnerFlowState
  /** Les compteurs, UNIQUEMENT quand au moins un a été renseigné. `null`
   *  sinon — l'écran n'a alors rien à afficher plutôt que quatre zéros. */
  counted: {
    needsReceived90d: number
    needsGiven90d: number
    placementsActive: number
    placementsTotal: number
    /** Missions menées à terme = total − en cours. Jamais négatif : deux
     *  compteurs indépendants peuvent se croiser, et une valeur négative
     *  s'afficherait telle quelle. */
    missionsCompleted: number
  } | null
  /**
   * La réciprocité, en part de ce qu'on a REÇU sur le total échangé (0..1).
   *
   * `null` quand rien n'est compté — et aussi quand le total est nul : une
   * division par zéro rendue « 0 % » se lirait « aucune réciprocité », qui est
   * un jugement, pas une mesure.
   */
  reciprocity: number | null
}

/** Au-delà, une relation sans activité enregistrée est dite dormante. */
const DORMANT_AFTER_DAYS = 90

/**
 * Combien de jours depuis la dernière activité enregistrée, ou `null` quand
 * aucune date n'est lisible — une date illisible ne vaut pas « aujourd'hui ».
 */
export function daysSinceActivity(lastActivityAt: string | null, now: Date): number | null {
  if (!lastActivityAt) return null
  const at = new Date(lastActivityAt)
  if (Number.isNaN(at.getTime())) return null
  const diff = now.getTime() - at.getTime()
  if (diff < 0) return 0
  return Math.floor(diff / 86_400_000)
}

export function partnerFlow(input: PartnerFlowInput, now: Date): PartnerFlow {
  const anyCounted =
    input.needsReceived90d > 0 || input.needsGiven90d > 0 || input.placementsActive > 0 || input.placementsTotal > 0

  if (!anyCounted) {
    // Rien n'est compté. On ne conclut NI « actif » NI « dormant » sur des
    // compteurs à zéro par défaut — la date d'activité, elle, reste lisible et
    // l'écran l'affiche à part.
    return { state: 'uncounted', counted: null, reciprocity: null }
  }

  const exchanged = input.needsReceived90d + input.needsGiven90d
  const days = daysSinceActivity(input.lastActivityAt, now)
  // « Actif » demande DEUX choses : des échanges comptés récemment, et une
  // trace d'activité fraîche. Sans date lisible, on ne promeut pas à « actif » —
  // un compteur ancien resterait « actif » indéfiniment.
  const state: PartnerFlowState = exchanged > 0 && days !== null && days <= DORMANT_AFTER_DAYS ? 'active' : 'dormant'

  return {
    state,
    counted: {
      needsReceived90d: input.needsReceived90d,
      needsGiven90d: input.needsGiven90d,
      placementsActive: input.placementsActive,
      placementsTotal: input.placementsTotal,
      missionsCompleted: Math.max(0, input.placementsTotal - input.placementsActive),
    },
    reciprocity: exchanged > 0 ? input.needsReceived90d / exchanged : null,
  }
}
