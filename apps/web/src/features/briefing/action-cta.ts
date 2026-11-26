import type { BriefingAction } from '@bellum/contracts'

/**
 * Les genres de carte du brief qui ont un geste NOMMÉ — clés de l'espace de
 * noms `briefing`.
 *
 * Une carte sans destination n'en a pas : promettre « → Préparer une relance »
 * sans écran où atterrir se lit comme une panne, et c'est la règle que
 * `href: null` porte depuis le début.
 *
 * ⚠️ Deux lecteurs, un seul endroit (GA-26) : l'écran « Aujourd’hui »
 * (`ActionsBlock`) et le brief du matin dans la voix de Laura
 * (`features/chat/lib/morning-brief.ts`, #1936). Deux copies finiraient par
 * proposer deux gestes différents pour la même carte.
 */
export const BRIEFING_ACTION_CTA: Partial<Record<BriefingAction['kind'], string>> = {
  reply: 'actions.cta.reply',
  follow_up: 'actions.cta.follow_up',
  account: 'actions.cta.account',
  // #2107.3 — le besoin lui-même a un écran où atterrir (`/projects/needs/:id`).
  need_stale: 'actions.cta.need_stale',
  // #2095.2 / #2106.8 / #2107.7 — la mission elle-même a un écran où atterrir
  // (`/missions/:id`, D200), qu'elle approche de sa fin ou d'un seuil de
  // renouvellement — même carte, même geste.
  mission_end: 'actions.cta.mission_end',
  // #2095.7 — même dossier que `mission_end` : la facturation d'une mission se
  // lit depuis son dossier, il n'existe pas d'écran par facture.
  payment_overdue: 'actions.cta.payment_overdue',
  // #2095.8 — aucun dossier PAR appel d'offres n'existe (`RfpPage` sélectionne
  // en état local, pas par URL) : la carte ouvre la LISTE (`/rfp`).
  rfp_due: 'actions.cta.rfp_due',
  // #2102.1 — un conflit n'ouvre toujours aucune ROUTE (`href` reste `null`,
  // aucun écran d'agenda dédié n'existe), mais il ouvre désormais un vrai
  // geste : `ConflictDialog` montre les deux rendez-vous. `PriorityCard` lit
  // cette clé même quand `action.href` est `null`, seulement pour ce genre.
  conflict: 'actions.cta.conflict',
  // #2106.6 — le consultant lui-même a un écran où atterrir (`/consultants/:id`).
  // Sans cette entrée, `ctaKey` retombe à `undefined` malgré un `href` réel :
  // la carte ne rendait aucun lien cliquable.
  consultant_available: 'actions.cta.consultant_available',
  // #2107.6 — même dossier, même geste que `consultant_available` juste
  // au-dessus : la personne reconfirme sa disponibilité sur SA fiche, il n'y
  // a pas de second écran à nommer (GA-26, un seul endroit pour ce libellé).
  availability_reconfirm: 'actions.cta.consultant_available',
  // #2107.8 — même dossier, même geste que `mission_end` : une mission sans
  // date de fin s'ouvre depuis SON dossier (`/missions/:id`, D200).
  mission_no_end_date: 'actions.cta.mission_end',
  // #2107.15 — un seul écran de reconnexion pour tous les outils (D200),
  // jamais de dossier par connecteur.
  connector_broken: 'actions.cta.connector_broken',
  // #2107.10 — même dossier, même geste que `mission_end` (D200).
  renewal_not_engaged: 'actions.cta.mission_end',
  // #2107.4 — même dossier, même geste que `consultant_available`.
  submission_no_response: 'actions.cta.consultant_available',
  // #2107.14 — même dossier, même geste que `rfp_due` : aucun dossier PAR
  // appel d'offres n'existe, la carte ouvre la LISTE (`/rfp`).
  rfp_requirement_gap: 'actions.cta.rfp_due',
  // #2107.18 — même dossier, même geste que `account` : le compte existe
  // déjà, son dossier existe déjà.
  account_no_owner: 'actions.cta.account',
  // #2106.9/#2107.1 (doublon, épopée #2801) — le projet lui-même a désormais
  // un écran où atterrir (`/projects/:id`).
  project_no_next_action: 'actions.cta.project',
  // #2107.2 (épopée #2801) — même dossier, même geste que `project_no_next_action`.
  project_stale: 'actions.cta.project',
  // #2107.9 / #2107.11 / #2107.16 — même dossier, même geste que `mission_end` :
  // le CRA, la préparation de facture et le champ manquant se traitent tous
  // depuis LE dossier de la mission (`/missions/:id`, D200), pas un écran par
  // relevé ou par facture.
  cra_missing: 'actions.cta.mission_end',
  invoice_ready: 'actions.cta.mission_end',
  invoicing_blocked_missing_data: 'actions.cta.mission_end',
  // #2095.41 (épopée #2993) — le contact lui-même a un écran où atterrir
  // (`/contacts/:id`, #2158).
  contact_bounced: 'actions.cta.contact',
  // L1 (31/10/2026) — même dossier, même geste que les familles voisines.
  invoice_blocked: 'actions.cta.mission_end',
  mission_starting: 'actions.cta.mission_end',
  mission_amendment_pending: 'actions.cta.mission_end',
  contact_left: 'actions.cta.contact',
  // La donnée critique s'ouvre sur SON objet (mission ou contact) : le geste
  // est le même, la compléter.
  critical_data_missing: 'actions.cta.critical_data_missing',
}
