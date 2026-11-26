/**
 * « Le plan se replanifie après chaque réponse » (annexe méthodo p27).
 *
 * Le replan était uniquement MANUEL : rien ne signalait au commercial qu'un
 * événement venait de périmer son plan. Un contact qui répond change le next
 * step ; un bounce rend inatteignable une cible du plan ; un RDV fait avancer
 * l'étape ; un « pas intéressé » invalide l'angle.
 *
 * Choix produit ASSUMÉ, cohérent avec le reste de Bellum (règle « on prépare,
 * l'utilisateur déclenche » — le copilote ne dépense jamais un crédit sans clic) :
 * on ne RE-LANCE pas le plan automatiquement (un replan est une re-exécution de
 * la phase 4, elle a un coût). On DÉTECTE l'événement et on pose un repère qui
 * fait apparaître un nudge « le plan mérite une actualisation » ; c'est le clic
 * de l'utilisateur qui replanifie. La détection est ici, déterministe et testée.
 */

/** Les transitions de statut contact qui périment le plan du compte. */
const REPLAN_TRIGGERING_STATUSES = new Set(['replied', 'meeting', 'bounced', 'not_interested'])

/**
 * L'événement justifie-t-il de proposer une actualisation du plan ?
 *
 * On ne déclenche QUE sur un vrai changement vers un statut signifiant : ré-poser
 * le même statut (idempotence d'un double-clic) ne périme rien, et un statut
 * neutre (`new`, `contacted`) n'apporte aucune information nouvelle sur l'angle.
 */
export function shouldSuggestReplan(previousStatus: string | null | undefined, newStatus: string): boolean {
  if (previousStatus === newStatus) return false
  return REPLAN_TRIGGERING_STATUSES.has(newStatus)
}
