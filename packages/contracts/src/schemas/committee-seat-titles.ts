import { deaccentLower } from './buyer-role-families.js'
import { isDecisionRoleUnposed, isTechnicalDeciderTitle, isTechnicalNeighbourTitle } from './account-strategy-5p.js'

/**
 * #4324.1 — UNE seule lecture « quel(s) siège(s) critique(s) un contact peut-il tenir ? », partagée par la
 * fiche Couverture (API) et l'écran Comité d'achat (web). Avant elle, « Places à pourvoir » n'écoutait que le
 * rôle posé : un CFO, un Chief Procurement Officer ou un « Responsable de Domaine IT » rangé « À qualifier »
 * laissait la place affichée VIDE — une absence inventée, alors que le titulaire était au dossier.
 *
 * Trois sièges se lisent par l'intitulé (décideur économique, référent technique, achats). Le SPONSOR n'en fait
 * pas partie : c'est une posture (qui porte le projet en interne), pas un intitulé — le déduire serait inventer.
 * Il ne se tient que sur un rôle posé.
 *
 * Multilingue par construction : chaque siège a ses intitulés FR et EN (CFO = DAF = Directeur financier ;
 * CPO = Directeur des achats = Head of Procurement). Aucun critère protégé n'entre ici — le seul champ lu est
 * l'intitulé de poste.
 */
export type CommitteeTitleSeat = 'economic' | 'technical' | 'procurement'

const NOT_A_SEAT_HOLDER_RE =
  /stagiaire|alternan|apprenti|\bintern(ship)?\b|assistan|comptab|accountant|analyste|analyst|gestionnaire|technicien|charge de mission|incendie/

const ECONOMIC_RES: readonly RegExp[] = [
  /\b(cfo|daf|drh?f|ceo|pdg|dg)\b/,
  /chief (financial|executive) officer/,
  /\b(directeur|directrice|direction|responsable|head|director|vp|vice president)\b[\w\s,'&/-]*\b(financ\w*|finance|administratif et financier|general|generale)\b/,
  /\b(finance|financial) (director|head|manager)\b/,
  /\b(managing director|president directeur general|directeur general|directrice generale)\b/,
]

const PROCUREMENT_RES: readonly RegExp[] = [
  /chief procurement officer|\bcpo\b(?!.*product)/,
  /\b(achats?|procurement|purchasing|sourcing)\b/,
  /\b(acheteurs?|buyers?|vendor manager)\b/,
]

function cleanTitle(title: string): string {
  return deaccentLower(title).replace(/[’`]/g, "'")
}

/** Les sièges qu'un INTITULÉ de poste peut tenir. `[]` = aucun indice : on ne devine pas. */
export function committeeSeatsHeldByTitle(title: string | null | undefined): CommitteeTitleSeat[] {
  if (typeof title !== 'string' || !title.trim()) return []
  const text = cleanTitle(title)
  if (NOT_A_SEAT_HOLDER_RE.test(text)) return []
  const seats: CommitteeTitleSeat[] = []
  // « Responsable Achats IT » est un acheteur, pas un référent technique : les achats l'emportent sur l'IT.
  const procurement = PROCUREMENT_RES.some(re => re.test(text))
  if (ECONOMIC_RES.some(re => re.test(text)) && !procurement) seats.push('economic')
  if (!procurement && (isTechnicalDeciderTitle(title) || isTechnicalNeighbourTitle(title))) seats.push('technical')
  if (procurement) seats.push('procurement')
  return seats
}

/**
 * Les sièges tenus par UN contact : son rôle posé s'il y en a un (jamais écrasé par le titre), sinon son
 * intitulé. `purchasing` est l'ancien nom de `procurement`.
 */
export function committeeSeatsHeldByContact(contact: {
  title?: string | null
  decision_role?: string | null
}): CommitteeTitleSeat[] {
  if (!isDecisionRoleUnposed(contact.decision_role)) {
    const role = (contact.decision_role ?? '').trim().toLowerCase()
    if (role === 'economic' || role === 'technical' || role === 'procurement') return [role]
    if (role === 'purchasing') return ['procurement']
    return []
  }
  return committeeSeatsHeldByTitle(contact.title)
}
