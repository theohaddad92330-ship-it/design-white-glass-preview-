import { z } from 'zod'
import { workspaceRoleSchema } from './workspace.js'

/**
 * Théo D team-member.N1 — la fiche d'un membre (`GET /manager/members/:id`).
 *
 * Un portefeuille, des objectifs, des actions, des affaires et un rôle, en
 * LECTURE de ce que le membre a enregistré. Décision Louis 22/10 (Q3) : tout
 * membre lit la journée, les recherches et les intégrations d'un collègue —
 * JAMAIS sa messagerie (c96) : aucun champ de cette fiche ne porte le corps
 * ni même l'objet d'un message.
 *
 * Un total absent n'est jamais « 0 » : `signed_amount` vaut `null` quand
 * aucune affaire gagnée n'a de montant saisi (GA-18/GA-19).
 */
export const managerMemberAccountSchema = z.object({
  id: z.string(),
  company_name: z.string(),
  sector: z.string().nullable(),
  city: z.string().nullable(),
  /** Prochaine action ouverte du compte, ou `null` (« aucune action ouverte »). */
  next_action: z.object({ id: z.string(), label: z.string(), due_date: z.string().nullable() }).nullable(),
})

export const managerMemberActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  account_id: z.string(),
  company_name: z.string(),
  due_date: z.string().nullable(),
  overdue: z.boolean(),
  /** Qui a confié l'action quand elle est déléguée (le créateur), sinon `null`. */
  delegated_by: z.string().nullable(),
})

export const managerMemberOpportunitySchema = z.object({
  id: z.string(),
  label: z.string(),
  account_id: z.string(),
  company_name: z.string(),
  stage: z.string(),
  estimated_amount: z.number().nullable(),
})

/** Ce que l'espace a BRANCHÉ, nommé par capacité — jamais un fournisseur. */
export const MANAGER_MEMBER_INTEGRATION_KINDS = ['mailbox', 'crm'] as const
export const managerMemberIntegrationSchema = z.object({
  kind: z.enum(MANAGER_MEMBER_INTEGRATION_KINDS),
  /** `true` quand c'est ce membre qui a branché la connexion. */
  connected_by_member: z.boolean(),
})

export const managerMemberSchema = z.object({
  member: z.object({
    user_id: z.string(),
    name: z.string(),
    email: z.string(),
    role: workspaceRoleSchema,
  }),
  period_month: z.string(),
  counts: z.object({ accounts: z.number(), open_opportunities: z.number(), open_actions: z.number() }),
  objective: z.object({
    target_revenue: z.number().nullable(),
    target_meetings: z.number().nullable(),
    target_accounts: z.number().nullable(),
    /** Somme des montants SAISIS des affaires gagnées du mois ; `null` si aucun montant saisi. */
    signed_amount: z.number().nullable(),
    pending_proposal: z.boolean(),
  }),
  accounts: z.array(managerMemberAccountSchema),
  actions: z.array(managerMemberActionSchema),
  opportunities: z.array(managerMemberOpportunitySchema),
  integrations: z.array(managerMemberIntegrationSchema),
})
export type ManagerMember = z.infer<typeof managerMemberSchema>

/**
 * Théo D team-business — « Objectifs & affaires » (`GET /manager/team-business`).
 *
 * Trois lectures qu'on ne confond pas (bloc « Ne pas confondre ») : le CAP (la
 * somme des cibles déclarées), les affaires GAGNÉES (montants estimés saisis) et
 * le chiffre ENCAISSÉ (suivi dans Missions, jamais sommé ici).
 *
 * « Non mesuré n'est jamais 0 » (GA-18/GA-19) : `signed_amount` vaut `null`
 * quand aucune affaire gagnée du mois ne porte un montant saisi ; une cible
 * absente vaut `null`, jamais « objectif 0 ».
 */
export const managerTeamBusinessMemberSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  role: workspaceRoleSchema,
  signed_amount: z.number().nullable(),
  target_revenue: z.number().nullable(),
  target_meetings: z.number().nullable(),
  achieved_meetings: z.number(),
  target_accounts: z.number().nullable(),
  achieved_accounts: z.number(),
  /** Une cible proposée par la direction attend la réponse de ce membre. */
  pending_proposal: z.boolean(),
})

export const managerTeamDealSchema = z.object({
  opportunity_id: z.string(),
  label: z.string(),
  account_id: z.string(),
  company_name: z.string(),
  owner_user_id: z.string().nullable(),
  stage: z.string(),
  estimated_amount: z.number().nullable(),
  /** Date de décision visée (`opportunities.expected_close_on`), ou `null` — « à préciser ». */
  expected_close_on: z.string().nullable(),
  /** La prochaine action ouverte du compte, ou `null`. */
  next_action_label: z.string().nullable(),
})

export const managerTeamPortfolioAccountSchema = managerMemberAccountSchema.extend({
  assigned_to: z.string().nullable(),
})

export const managerTeamBusinessSchema = z.object({
  period_month: z.string(),
  cap: z.object({
    signed_amount: z.number().nullable(),
    target_amount: z.number().nullable(),
    contributors_with_target: z.number(),
    members_total: z.number(),
    won_without_amount: z.number(),
  }),
  members: z.array(managerTeamBusinessMemberSchema),
  deals: z.array(managerTeamDealSchema),
  deals_total: z.number(),
  /** Somme des montants SAISIS des affaires ouvertes ; `null` si aucune n'en porte. */
  deals_amount: z.number().nullable(),
  deals_without_amount: z.number(),
  accounts: z.array(managerTeamPortfolioAccountSchema),
  accounts_total: z.number(),
})
export type ManagerTeamBusiness = z.infer<typeof managerTeamBusinessSchema>

/** Théo D team-plans — « Plans & actions » (`GET /manager/team-plans`). */
export const managerTeamPlanActionSchema = z.object({
  id: z.string(),
  label: z.string(),
  account_id: z.string(),
  company_name: z.string(),
  due_date: z.string().nullable(),
  overdue: z.boolean(),
  owner_user_id: z.string(),
  assigned_to: z.string().nullable(),
  /** Qui a confié l'action (le créateur) quand elle est déléguée, sinon `null`. */
  delegated_by: z.string().nullable(),
})

export const managerTeamPlansSchema = z.object({
  open: z.number(),
  overdue: z.number(),
  delegated: z.number(),
  items: z.array(managerTeamPlanActionSchema),
  members: z.array(z.object({ user_id: z.string(), name: z.string() })),
  accounts: z.array(z.object({ id: z.string(), company_name: z.string() })),
})
export type ManagerTeamPlans = z.infer<typeof managerTeamPlansSchema>
