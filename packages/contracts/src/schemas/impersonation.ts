import { z } from 'zod'

/**
 * Le motif d'une incarnation — un CATALOGUE, pas un champ de texte (#1670).
 *
 * POURQUOI UN CATALOGUE FERMÉ
 * « Trois motifs au catalogue : support demandé · incident constaté ·
 * vérification technique. Pas de texte libre — **un catalogue se lit**. »
 * L'ancien champ acceptait 3 à 500 caractères libres : le motif était donc
 * obligatoire mais illisible en masse. Trois cent lignes de texte libre ne
 * répondent à aucune question ; trois codes se comptent, se filtrent et se
 * défendent devant quelqu'un qui demande à quoi sert l'accès aux données de
 * ses clients.
 *
 * ⚠️ ORDRE FIGÉ. Une valeur ne disparaît jamais et les ajouts vont EN FIN
 * (GA-08). La contrainte SQL correspondante est
 * `impersonation_audit_reason_code_check`, et elle est élargie AVANT le code
 * qui écrit la valeur (GA-11 / GA-12).
 */
// LUDOVIC-D LC.10 — « Recette » ajouté EN FIN (GA-08), contrainte élargie avant (migration 1796560887818).
export const IMPERSONATION_REASON_CODES = [
  'support_demande',
  'incident_constate',
  'verification_technique',
  'recette',
] as const

export const impersonationReasonCodeSchema = z.enum(IMPERSONATION_REASON_CODES)

export type ImpersonationReasonCode = (typeof IMPERSONATION_REASON_CODES)[number]

/**
 * Ce que l'opérateur LIT, et ce que le journal d'audit garde en clair.
 *
 * ⚠️ Le libellé est écrit ici et non dans l'écran : c'est le journal serveur
 * qui l'enregistre, et un libellé recopié à la main dans une garde ou dans une
 * colonne diverge à la première correction. Le back-office est français hors
 * `/monitoring` — ce libellé n'a donc pas de jumeau anglais à tenir.
 */
export const IMPERSONATION_REASON_LABELS: Record<ImpersonationReasonCode, string> = {
  support_demande: 'Support demandé',
  incident_constate: 'Incident constaté',
  verification_technique: 'Vérification technique',
  recette: 'Recette',
}

/**
 * LUDOVIC-D LC.10 — la PRÉCISION libre et FACULTATIVE du motif (« recette du lot LUDOVIC-D »). Le
 * catalogue reste ce qui se compte ; la précision se lit. Bornée comme la contrainte SQL
 * `impersonation_audit_reason_detail_length_check` (300), sans retour à la ligne (journal propre).
 */
export const IMPERSONATION_REASON_DETAIL_MAX = 300

export const impersonationReasonDetailSchema = z
  .string()
  .trim()
  .max(IMPERSONATION_REASON_DETAIL_MAX)
  .refine(value => !/[\r\n]/.test(value), 'Précision sur une seule ligne.')
