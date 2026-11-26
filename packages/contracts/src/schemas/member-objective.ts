import { z } from 'zod'

/**
 * Objectif commercial chiffré par membre (cockpit manager §10).
 *
 * Un membre déclare, pour un MOIS donné, une cible sur trois axes — rendez-vous,
 * comptes, chiffre d'affaires — chacune facultative. Le cockpit rapporte ensuite
 * la cible au RÉALISÉ (données réelles déjà calculées : rendez-vous décrochés,
 * comptes ouverts, montants convertis) et affiche une barre d'atteinte. Aucune
 * cible n'est inventée : un axe non déclaré n'a pas de barre (jamais un 0/0
 * factice). Table de stockage : `member_objectives` (RLS `auth.uid() = user_id`,
 * un manager lit celles de son équipe).
 */

/** Motif d'un mois normalisé au 1er : `YYYY-MM-01`. */
export const MEMBER_OBJECTIVE_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-01$/

/**
 * Un objectif tel que stocké/renvoyé. `period_month` est le 1er du mois visé.
 * Les trois cibles sont indépendantes et nullables : `null` = axe non déclaré
 * (le membre ne s'est pas fixé de cible dessus), jamais « objectif de 0 ».
 */
export const memberObjectiveSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  period_month: z.string(),
  target_meetings: z.number().nullable(),
  target_accounts: z.number().nullable(),
  target_revenue: z.number().nullable(),
  // Lot FA (#2114.16-.22) — les quatre axes qui complètent les sept objectifs
  // commerciaux nommés. Additifs (migration `1789742050827`), même contrat
  // que les trois au-dessus : `null` = axe non déclaré, jamais un 0 fabriqué.
  target_qualified_needs: z.number().nullable(),
  target_placements: z.number().nullable(),
  target_margin_percent: z.number().nullable(),
  target_consultants_on_mission: z.number().nullable(),
  created_at: z.string(),
  updated_at: z.string().optional(),
})
export type MemberObjective = z.infer<typeof memberObjectiveSchema>

/**
 * Corps de `PUT /objectives/me` — un membre déclare (ou met à jour) SON objectif
 * du mois. `period_month` est optionnel : absent, l'API prend le mois courant.
 * Chaque cible est optionnelle ET nullable : omise, elle n'est pas touchée ;
 * `null`, elle est effacée. Jamais négative — une cible ne se soustrait pas.
 */
export const upsertMemberObjectiveSchema = z.object({
  period_month: z.string().regex(MEMBER_OBJECTIVE_MONTH_PATTERN).optional(),
  target_meetings: z.number().int().nonnegative().nullable().optional(),
  target_accounts: z.number().int().nonnegative().nullable().optional(),
  target_revenue: z.number().nonnegative().nullable().optional(),
  target_qualified_needs: z.number().int().nonnegative().nullable().optional(),
  target_placements: z.number().int().nonnegative().nullable().optional(),
  // Un objectif de marge à 0 % n'est pas un objectif — même borne que
  // `finance_margin_targets` (`target_percent > 0 AND <= 100`).
  target_margin_percent: z.number().gt(0).max(100).nullable().optional(),
  target_consultants_on_mission: z.number().int().nonnegative().nullable().optional(),
})
export type UpsertMemberObjective = z.infer<typeof upsertMemberObjectiveSchema>

/**
 * Réponse de `GET /objectives/me`. `objective` est `null` quand le membre n'a pas
 * (encore) déclaré d'objectif pour le mois — jamais un objectif de 0 fabriqué. La
 * réponse est toujours un objet (jamais un `null` nu) pour ne pas casser le parse
 * JSON côté web quand rien n'est déclaré.
 */
export const myObjectiveResponseSchema = z.object({
  period_month: z.string(),
  objective: memberObjectiveSchema.nullable(),
})
export type MyObjectiveResponse = z.infer<typeof myObjectiveResponseSchema>

/**
 * L'atteinte d'un membre pour le mois (cockpit manager §10). `targets` = ce qu'il
 * a déclaré (axes nuls = non déclarés → pas de barre côté web) ; `achieved` = le
 * réalisé RÉEL calculé sur le mois :
 *  - `meetings`  : rendez-vous décrochés (`user_actions` type `rdv_obtained`),
 *  - `accounts`  : comptes ouverts par le membre sur le mois,
 *  - `revenue`   : somme des `estimated_amount` SAISIS des opportunités converties
 *                  ce mois sur ses comptes — jamais un montant inventé (0 si aucun
 *                  montant n'a été saisi, ce qui est un vrai 0, pas une invention).
 */
export const memberObjectiveProgressSchema = z.object({
  user_id: z.string(),
  period_month: z.string(),
  targets: z.object({
    meetings: z.number().nullable(),
    accounts: z.number().nullable(),
    revenue: z.number().nullable(),
  }),
  achieved: z.object({
    meetings: z.number(),
    accounts: z.number(),
    revenue: z.number(),
  }),
})
export type MemberObjectiveProgress = z.infer<typeof memberObjectiveProgressSchema>

/**
 * Réponse de `GET /objectives/team` (manager). `members` ne contient QUE les
 * membres ayant déclaré un objectif pour le mois — un membre sans objectif n'a
 * pas de ligne (pas de barre fabriquée).
 */
export const teamObjectivesSchema = z.object({
  period_month: z.string(),
  members: z.array(memberObjectiveProgressSchema),
})
export type TeamObjectives = z.infer<typeof teamObjectivesSchema>

/**
 * Les SEPT objectifs commerciaux nommés (lot FA, #2114.16 à .27) — la
 * définition vit ICI et seulement ici (GA-26) : le libellé et l'unité de
 * chaque axe se lisent depuis `axis` côté écran (i18n), jamais recopiés.
 *
 * L'ORDRE est celui de la demande (#2114.16-.22) : rendez-vous, besoins,
 * démarrages, chiffre d'affaires, marge, comptes, consultants en mission.
 */
export const COMMERCIAL_OBJECTIVE_AXES = [
  'meetings', // #2114.16 — rendez-vous
  'qualified_needs', // #2114.17 — besoins
  'placements', // #2114.18 — démarrages
  'revenue', // #2114.19 — chiffre d'affaires
  'margin', // #2114.20 — marge
  'new_accounts', // #2114.21 — comptes
  'consultants_on_mission', // #2114.22 — consultants en mission
] as const
export const commercialObjectiveAxisSchema = z.enum(COMMERCIAL_OBJECTIVE_AXES)
export type CommercialObjectiveAxis = z.infer<typeof commercialObjectiveAxisSchema>

/**
 * « Non mesuré n'est jamais 0 » appliqué à la FIABILITÉ, pas seulement à la
 * valeur (#2114.27, GA-18/GA-19). `measured` compte les enregistrements dont
 * le champ nécessaire au calcul est réellement rempli, `total` compte tous
 * les enregistrements pertinents de la période — `measured === total` dit
 * « couverture complète », `measured < total` NOMME ce qui manque plutôt que
 * de le laisser invisible dans un total agrégé.
 */
export const objectiveDataCoverageSchema = z.object({
  measured: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})
export type ObjectiveDataCoverage = z.infer<typeof objectiveDataCoverageSchema>

/**
 * Un objectif tel qu'affiché (#2114.24-.27) : la cible (`target`, `null` =
 * non fixée), le réalisé (`achieved`, une vraie valeur calculée — jamais
 * `null` pour ces sept axes, un mois sans activité rend un vrai 0), la
 * période, et la couverture des données qui a produit `achieved`.
 *
 * JAMAIS d'écart ni de pourcentage d'atteinte ici (#2114.28/.29 sont HORS
 * scope de ce lot) — aucune probabilité, le lecteur fait la soustraction.
 */
export const commercialObjectiveSchema = z.object({
  axis: commercialObjectiveAxisSchema,
  target: z.number().nullable(),
  achieved: z.number().nullable(),
  period_month: z.string(),
  coverage: objectiveDataCoverageSchema,
})
export type CommercialObjective = z.infer<typeof commercialObjectiveSchema>

/** Réponse de `GET /objectives/me/commercial` — toujours les sept axes, dans
 *  l'ordre de {@link COMMERCIAL_OBJECTIVE_AXES}, qu'une cible soit fixée ou non. */
export const myCommercialObjectivesResponseSchema = z.object({
  period_month: z.string(),
  objectives: z.array(commercialObjectiveSchema),
})
export type MyCommercialObjectivesResponse = z.infer<typeof myCommercialObjectivesResponseSchema>

/**
 * Théo D team-business.N2 — « Un objectif choisi, pas imposé en silence ».
 *
 * Une direction PROPOSE une cible à un membre ; la cible actuelle reste
 * inchangée tant que le membre n'a pas répondu. Trois états, pas un de plus :
 * `proposed` (en attente), `accepted` (la proposition a été appliquée à
 * l'objectif du membre), `refused` (rien ne change). On archive, on ne
 * supprime pas : une proposition répondue reste lisible.
 *
 * Les cibles reprennent EXACTEMENT les sept axes de `member_objectives` ;
 * `null` = axe non proposé (jamais « proposer 0 »).
 */
export const OBJECTIVE_PROPOSAL_STATUSES = ['proposed', 'accepted', 'refused'] as const
export const objectiveProposalStatusSchema = z.enum(OBJECTIVE_PROPOSAL_STATUSES)
export type ObjectiveProposalStatus = z.infer<typeof objectiveProposalStatusSchema>

/** Corps de `POST /objectives/proposals` — la direction propose une cible à `user_id`. */
export const createObjectiveProposalSchema = upsertMemberObjectiveSchema.extend({
  user_id: z.string().guid(),
  reason: z.string().trim().max(500).optional(),
})
export type CreateObjectiveProposal = z.infer<typeof createObjectiveProposalSchema>

export const objectiveProposalSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  proposed_by: z.string(),
  period_month: z.string(),
  target_meetings: z.number().nullable(),
  target_accounts: z.number().nullable(),
  target_revenue: z.number().nullable(),
  target_qualified_needs: z.number().nullable(),
  target_placements: z.number().nullable(),
  target_margin_percent: z.number().nullable(),
  target_consultants_on_mission: z.number().nullable(),
  reason: z.string().nullable(),
  status: objectiveProposalStatusSchema,
  responded_at: z.string().nullable(),
  created_at: z.string(),
})
export type ObjectiveProposal = z.infer<typeof objectiveProposalSchema>

export const objectiveProposalsResponseSchema = z.object({
  period_month: z.string(),
  proposals: z.array(objectiveProposalSchema),
})
export type ObjectiveProposalsResponse = z.infer<typeof objectiveProposalsResponseSchema>

/** Corps de `PATCH /objectives/proposals/:id` — le membre accepte ou refuse. */
export const respondObjectiveProposalSchema = z.object({ decision: z.enum(['accepted', 'refused']) })
export type RespondObjectiveProposal = z.infer<typeof respondObjectiveProposalSchema>
