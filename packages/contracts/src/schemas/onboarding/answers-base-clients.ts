import { z } from 'zod'

/**
 * La base de clients DÉCLARÉE à l'onboarding — lot #2047.
 *
 * Même raison que `answers-vivier.ts` : le questionnaire ne demandait rien de
 * la base de clients que l'ESN a DÉJÀ, seulement ce qu'elle vise. Sans ce
 * snapshot, l'audit ne peut jamais dire si une base existante est exploitée —
 * seulement qu'elle existe ou non.
 *
 * ⚠️ #2047.1 (« collecter les clients actifs ») N'EST PAS dans ce fichier :
 * `active_clients_band` (migration 1794010000000, lot L15/#2034.10) pose déjà
 * exactement cette question en bande de valeur. Une seconde colonne dirait
 * la même chose deux fois — « un réglage vit à un seul endroit » (GA-26).
 * Laissé `retenu` au registre, avec ce commentaire comme preuve du croisement.
 *
 * Voisins opérationnels À NE PAS RECODER, cités pour mémoire : `modules/capitalisation`,
 * `modules/delivery`, `modules/account-feedback`, `client_references` (Temps 2,
 * plafonné à 5), `modules/tasks` + `modules/objectives`. Ce bloc n'en dépend
 * pas : c'est un AUTO-DÉCLARATIF à l'onboarding, pas une lecture de ces
 * modules qui peuvent être vides le jour de l'inscription.
 *
 * Toutes les colonnes sont des bandes de valeur ou un texte court, jamais un
 * nombre exact ni une liste construite (`.nullable().optional()`).
 */
export const CLIENT_BASE_COUNT_BAND_CHOICES = ['0', '1-5', '6-15', '16-30', '31-80', '81-200', '200+'] as const

export const BASE_CLIENTS_ANSWER_FIELDS = {
  // #2047.2 — missions EN COURS, distinct des missions actives (#2047.1,
  // retenu — voir le commentaire de tête) : une mission en cours est un
  // ENGAGEMENT daté, un client actif est un compte qui a une facturation
  // récente sans dire si une mission tourne dessus aujourd'hui.
  client_base_missions_ongoing_band: z.string().nullable().optional(),
  // #2047.3
  client_base_missions_completed_band: z.string().nullable().optional(),
  // #2047.4
  client_base_renewals_band: z.enum(['aucun', 'quelques_uns', 'la_plupart']).nullable().optional().catch(null),
  // #2047.5 — mesure si la satisfaction est SUIVIE, pas la note elle-même :
  // `modules/account-feedback` porte déjà la note quand elle existe ; ce champ
  // dit si l'ESN a seulement un système pour la connaître.
  client_base_satisfaction_band: z
    .enum(['mesuree_bonne', 'mesuree_mitigee', 'jamais_mesuree', 'ne_sait_pas'])
    .nullable()
    .optional()
    .catch(null),
  // #2047.6
  client_base_referrals_band: z.enum(['aucune', 'quelques_unes', 'regulierement']).nullable().optional().catch(null),
  // #2047.7 — REX (retour d'expérience) systématique après une mission ou non.
  client_base_rex_band: z.enum(['systematique', 'parfois', 'jamais']).nullable().optional().catch(null),
  // #2047.8 — combien de CAS CLIENTS sont EXPLOITABLES (présentables à un
  // prospect), distinct de `client_references`/`case_study_results` (Temps 2,
  // lot 26) qui portent le CONTENU des références ; celui-ci compte la
  // READINESS, jamais leur texte.
  client_base_case_studies_band: z.string().nullable().optional(),
  // #2047.9
  client_base_cross_sell_band: z
    .enum(['jamais_tente', 'tente_occasionnellement', 'pratique_reguliere'])
    .nullable()
    .optional()
    .catch(null),
  // #2047.11 — échéances (fins de mission, renouvellements) suivies à 3 mois.
  client_base_deadlines_band: z
    .enum(['aucune_connue', 'quelques_unes', 'la_plupart_suivies'])
    .nullable()
    .optional()
    .catch(null),
  // #2047.12 — deux questions, jamais fusionnées : la RÉGULARITÉ du suivi...
  client_base_followup_regularity: z.enum(['regulier', 'irregulier', 'aucun']).nullable().optional().catch(null),
  // ...et QUI en est responsable (texte libre : rôle ou prénom, chaque ESN a
  // son organisation).
  client_base_followup_owner: z.string().nullable().optional(),
}
