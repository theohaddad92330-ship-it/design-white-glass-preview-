/**
 * « Comptes proches de votre cible » — pourquoi CE compte est proposé.
 *
 * Critère d'acceptation §4 de la restitution V2 : « les comptes recommandés
 * expliquent systématiquement la proximité avec le profil utilisateur ». Le
 * calcul existe côté serveur depuis longtemps (`similar-scoring.ts` : secteurs
 * ciblés / zones géographiques / taille d'entreprise, pondérés 3-2-2, remontés
 * normalisés dans `score_similarity`) mais l'écran n'en montrait RIEN : la carte
 * affichait secteur + « ville · secteur », soit la même phrase pour un compte
 * qui coche trois critères du profil et pour un compte qui n'en coche aucun.
 *
 * Ce module ne recalcule rien et n'invente rien : il traduit le seul signal que
 * l'API expose en un niveau lisible.
 *
 *  - `strong`  → le profil du vendeur est largement recoupé.
 *  - `partial` → au moins un critère du profil a matché.
 *  - `seed`    → `score_similarity` absent : le serveur ne l'émet QUE lorsqu'un
 *                critère a matché (`score > 0`). Le compte reste une suggestion
 *                honnête — il vient du secteur registre de vos comptes récents —
 *                mais rien dans votre profil ne l'a encore rapproché de vous.
 *
 * L'API expose désormais les critères eux-mêmes (`similarity_reasons`, SIM-01 de
 * l'audit du 17/08) : le niveau ci-dessous reste le repli pour une réponse
 * antérieure au champ, et {@link describeSimilarReasons} nomme les critères
 * quand ils sont là. Le commentaire qui vivait ici — « nommer les critères
 * matchés exige que l'API les expose » — est donc levé.
 */

import type { SimilarityReason } from '@bellum/contracts'

type SimilarProximity = 'strong' | 'partial' | 'seed'

/**
 * Seuil « largement recoupé ». Choix d'AFFICHAGE : au-dessus de 0,5 il est
 * impossible de n'avoir matché qu'un seul critère, puisque le plus lourd des
 * trois (secteur) plafonne à 3/7 ≈ 0,43. Le libellé reste monotone en score si
 * les poids serveur bougent — au pire il devient prudent, jamais faux.
 */
const STRONG_FROM = 0.5

export function describeSimilarProximity(
  scoreSimilarity: number | null | undefined,
  /**
   * #2040.18 — LE SCORE PEUT ÊTRE ABSENT ALORS QU'UN CRITÈRE A MATCHÉ.
   *
   * Depuis que le serveur ne publie plus de score sous trois axes évaluables
   * (doctrine « un score n'est jamais nu »), un profil qui n'a répondu qu'aux
   * secteurs rend `score_similarity` absent ET `similarity_reasons: ['sector']`.
   * Lire le seul scalaire faisait alors dire à la carte « rien dans ton profil
   * ne l'a rapproché de toi » juste au-dessus de « même secteur que tes
   * cibles » — deux phrases qui se contredisent sous la même carte.
   *
   * Les critères matchés tranchent donc quand le scalaire se tait. Paramètre
   * optionnel : une réponse antérieure au champ garde le comportement d'avant.
   */
  reasons?: readonly SimilarityReason[],
): SimilarProximity {
  if (typeof scoreSimilarity === 'number' && Number.isFinite(scoreSimilarity) && scoreSimilarity > 0) {
    return scoreSimilarity >= STRONG_FROM ? 'strong' : 'partial'
  }
  return Array.isArray(reasons) && reasons.length > 0 ? 'partial' : 'seed'
}

/**
 * L'ordre d'affichage des critères : le plus discriminant d'abord.
 *
 * C'est l'ordre des POIDS du calcul serveur (secteur 3, géo 2, taille 2), et
 * non l'ordre d'arrivée : « même secteur que tes cibles » explique bien plus une
 * recommandation que « bonne taille », et une carte se lit de haut en bas.
 */
const REASON_ORDER: readonly SimilarityReason[] = ['sector', 'geo', 'size']

/** Combien de raisons une carte affiche. Trois, comme l'audit le demande — au
 *  delà on ne lit plus, et il n'existe de toute façon que trois critères. */
const MAX_REASONS = 3

/**
 * Les critères matchés, ordonnés et bornés, prêts à être traduits.
 *
 * Une réponse antérieure au champ rend `[]` : l'appelant retombe alors sur
 * {@link describeSimilarProximity}, jamais sur une carte muette.
 */
export function describeSimilarReasons(reasons: readonly SimilarityReason[] | undefined): SimilarityReason[] {
  if (!Array.isArray(reasons) || reasons.length === 0) return []
  const unique = new Set(reasons)
  return REASON_ORDER.filter(reason => unique.has(reason)).slice(0, MAX_REASONS)
}

/**
 * #2040.18 — LES AXES D'UNE SUGGESTION, CEUX QUI RAPPROCHENT ET CEUX QUI SE
 * TAISENT. La seule dérivation que lisent la carte de compte ET le panneau
 * « Similaires » de Découvrir (GA-26) : un score n'est jamais nu, ses axes sont
 * nommés, et ce qui n'a pas pu être évalué l'est aussi.
 *
 * `matched` et `unevaluated` passent par le même ordre et la même borne que
 * {@link describeSimilarReasons}. Un axe ne peut pas être dans les deux listes :
 * un axe matché a forcément été évalué, donc s'il est aussi déclaré muet (réponse
 * incohérente), c'est le fait mesuré qui gagne.
 */
export function describeSimilarAxes(
  reasons: readonly SimilarityReason[] | undefined,
  unevaluated: readonly SimilarityReason[] | undefined,
): { matched: SimilarityReason[]; unevaluated: SimilarityReason[] } {
  const matched = describeSimilarReasons(reasons)
  return {
    matched,
    unevaluated: describeSimilarReasons(unevaluated).filter(axis => !matched.includes(axis)),
  }
}
