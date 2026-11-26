import { z } from 'zod'
import { hasPermission, type WorkspaceRole } from './workspace.js'

/**
 * #4158 (lot L4) — les garde-fous de collaboration entre collègues.
 *
 * Six lectures/écritures, une seule idée : un commercial qui travaille à côté
 * d'un collègue doit SAVOIR ce que le collègue a fait, sans qu'on l'en empêche.
 * Tout ici informe ou demande confirmation ; rien ne bloque durement et rien
 * n'envoie (doctrine : le commercial envoie).
 *
 * Les noms sont toujours EN CLAIR (profil du collègue, à défaut son e-mail pro).
 * Une absence ne fait AUCUNE ligne : les listes ne contiennent que ce qui existe.
 */

/** Fenêtre « déjà travaillé par X » (#4158.20), en jours. */
export const COLLEAGUE_ACTIVITY_WINDOW_DAYS = 90
/** Fenêtre « contacté par un collègue » (#4158.21), en jours. */
export const COLLEAGUE_CONTACT_WINDOW_DAYS = 30

/* ------------------------- #20 — déjà travaillé par X ------------------------- */

export const colleagueActivitySchema = z.object({
  user_id: z.string(),
  /** Nom en clair ; l'e-mail pro à défaut de nom. Jamais « inconnu » inventé. */
  name: z.string(),
  /** `true` si ce collègue est le responsable (`assigned_to`) de la fiche. */
  is_responsible: z.boolean(),
  /** Le type de la dernière action (`action_type` du journal), `null` si le
   *  collègue est seulement responsable sans activité datée. */
  last_action: z.string().nullable(),
  /** Date ISO de la dernière action, `null` sous la même condition. */
  last_action_at: z.string().nullable(),
})
export type ColleagueActivity = z.infer<typeof colleagueActivitySchema>

export const colleagueActivityResponseSchema = z.object({ items: z.array(colleagueActivitySchema) })
export type ColleagueActivityResponse = z.infer<typeof colleagueActivityResponseSchema>

/* -------------------- #21 — contacté par un collègue ------------------------- */

export const colleagueContactCheckRequestSchema = z.object({
  contact_ids: z.array(z.string().guid()).min(1).max(100),
})
export type ColleagueContactCheckRequest = z.infer<typeof colleagueContactCheckRequestSchema>

export const COLLEAGUE_CONTACT_PROOFS = ['verified', 'declared'] as const

export const colleagueContactSchema = z.object({
  contact_id: z.string(),
  /** Le collègue qui a contacté (jamais moi : mes propres envois ne s'avertissent pas). */
  by_user_id: z.string(),
  by_name: z.string(),
  at: z.string(),
  days_ago: z.number().int().min(0),
  /** `verified` = envoi confirmé par le transport ; `declared` = copié/marqué fait
   *  par le collègue. Les deux se NOMMENT comme tels, jamais confondus. */
  proof: z.enum(COLLEAGUE_CONTACT_PROOFS),
})
export type ColleagueContact = z.infer<typeof colleagueContactSchema>

export const doNotContactEntrySchema = z.object({
  id: z.string(),
  kind: z.enum(['contact', 'domain']),
  contact_id: z.string().nullable(),
  contact_name: z.string().nullable(),
  domain: z.string().nullable(),
  reason: z.string(),
  added_by: z.string(),
  added_by_name: z.string(),
  created_at: z.string(),
})
export type DoNotContactEntry = z.infer<typeof doNotContactEntrySchema>

/** Ce que l'espace sait d'UN contact avant d'écrire : la liste « ne pas contacter »
 *  d'abord (#22), puis le collègue qui l'a contacté (#21). */
export const contactGuardrailSchema = z.object({
  contact_id: z.string(),
  do_not_contact: doNotContactEntrySchema.nullable(),
  contacted: colleagueContactSchema.nullable(),
})
export type ContactGuardrail = z.infer<typeof contactGuardrailSchema>

export const colleagueContactCheckResponseSchema = z.object({ items: z.array(contactGuardrailSchema) })
export type ColleagueContactCheckResponse = z.infer<typeof colleagueContactCheckResponseSchema>

/* ---------------------- #22 — liste « ne pas contacter » ---------------------- */

/** Motif obligatoire : une exclusion sans raison ne se discute pas, elle s'oublie. */
export const DO_NOT_CONTACT_REASON_MIN = 3

export const addDoNotContactRequestSchema = z
  .object({
    contact_id: z.string().guid().optional(),
    domain: z.string().trim().min(3).max(253).optional(),
    reason: z.string().trim().min(DO_NOT_CONTACT_REASON_MIN).max(500),
  })
  .refine(value => Boolean(value.contact_id) !== Boolean(value.domain), {
    message: 'Un contact OU un domaine, pas les deux ni aucun.',
  })
export type AddDoNotContactRequest = z.infer<typeof addDoNotContactRequestSchema>

export const doNotContactListResponseSchema = z.object({ items: z.array(doNotContactEntrySchema) })
export type DoNotContactListResponse = z.infer<typeof doNotContactListResponseSchema>

/* ------------------- #23 — consultant déjà proposé ---------------------------- */

export const alreadyProposedSchema = z.object({
  consultant_id: z.string(),
  by_user_id: z.string(),
  by_name: z.string(),
  account_name: z.string().nullable(),
  need_role: z.string(),
  at: z.string(),
  /** `client` = même client que ce besoin ; `need` = un autre besoin ouvert. */
  relation: z.enum(['client', 'need']),
})
export type AlreadyProposed = z.infer<typeof alreadyProposedSchema>

export const alreadyProposedResponseSchema = z.object({ items: z.array(alreadyProposedSchema) })
export type AlreadyProposedResponse = z.infer<typeof alreadyProposedResponseSchema>

/* ------------------------ #24 — doublon probable ------------------------------ */

export const duplicateCandidateSchema = z.object({
  kind: z.enum(['account', 'contact']),
  id: z.string(),
  label: z.string(),
  /** Le critère qui rapproche, en clair (`domain`, `email`, `linkedin`, `name_company`). */
  reason: z.enum(['domain', 'email', 'linkedin', 'name_company']),
  /** Le responsable de l'AUTRE fiche, `null` s'il n'y en a pas. */
  owner_name: z.string().nullable(),
})
export type DuplicateCandidate = z.infer<typeof duplicateCandidateSchema>

export const duplicateCandidatesResponseSchema = z.object({ items: z.array(duplicateCandidateSchema) })
export type DuplicateCandidatesResponse = z.infer<typeof duplicateCandidatesResponseSchema>

/* ------------------------- #25 — équipe de compte ----------------------------- */

/** Bornes du libellé d'un périmètre — la migration `AccountTeamScopes` les écrit dans son CHECK (GA-11/12). */
export const ACCOUNT_TEAM_SCOPE_LABEL_MIN = 2
export const ACCOUNT_TEAM_SCOPE_LABEL_MAX = 120

/**
 * #4996 — une zone d'un membre sur un compte : une entité du CLIENT (`entity_id`) ou un texte libre
 * (`entity_id` null). Un filtre et une suggestion, jamais un droit : elle ne bloque aucun geste.
 */
export const accountTeamScopeSchema = z.object({
  id: z.string(),
  entity_id: z.string().nullable(),
  /**
   * #4996.4 (Louis 02/11) — la zone peut aussi être une BU de NOTRE espace (`business_units`), jamais une entité du
   * client en même temps. Absent chez un ancien serveur.
   */
  business_unit_id: z.string().nullable().optional(),
  label: z.string(),
})
export type AccountTeamScope = z.infer<typeof accountTeamScopeSchema>

export const accountTeamMemberSchema = z.object({
  user_id: z.string(),
  name: z.string(),
  added_by_name: z.string().nullable(),
  created_at: z.string(),
  /** Absent chez un ancien serveur ; vide = « tout le compte » (aucune ligne à l'écran). */
  scopes: z.array(accountTeamScopeSchema).optional(),
})
export type AccountTeamMember = z.infer<typeof accountTeamMemberSchema>

export const accountTeamResponseSchema = z.object({
  /** Le responsable (`assigned_to`) — `null` si la fiche n'en a pas. */
  responsible: z
    .object({ user_id: z.string(), name: z.string(), scopes: z.array(accountTeamScopeSchema).optional() })
    .nullable(),
  members: z.array(accountTeamMemberSchema),
  /** Le lecteur peut-il ajouter/retirer ? (responsable ou `team:manage`). */
  can_edit: z.boolean(),
  /** Le lecteur peut-il poser SON propre périmètre ? (membre du compte, ou `can_edit`). */
  can_edit_own_scope: z.boolean().optional(),
})
export type AccountTeamResponse = z.infer<typeof accountTeamResponseSchema>

const scopeLabelSchema = z.string().trim().min(ACCOUNT_TEAM_SCOPE_LABEL_MIN).max(ACCOUNT_TEAM_SCOPE_LABEL_MAX)

/**
 * Pose d'une zone. `entity_id` ou `business_unit_id` fourni : le serveur recopie le nom (entité du client, BU de
 * l'espace) dans `label`, jamais le client. Aucun des trois : refus. Entité ET BU sur la même ligne : refus
 * (deux zones, deux lignes — la migration `AccountTeamScopesBusinessUnit` le dit aussi).
 */
export const addAccountTeamScopeRequestSchema = z
  .object({
    user_id: z.string().guid(),
    entity_id: z.string().guid().optional(),
    business_unit_id: z.string().guid().optional(),
    label: scopeLabelSchema.optional(),
  })
  .refine(v => v.entity_id !== undefined || v.business_unit_id !== undefined || v.label !== undefined, {
    message: 'Une entité, une BU ou un libellé est requis.',
    path: ['label'],
  })
  .refine(v => v.entity_id === undefined || v.business_unit_id === undefined, {
    message: 'Une zone est une entité OU une BU, pas les deux.',
    path: ['business_unit_id'],
  })
export type AddAccountTeamScopeRequest = z.infer<typeof addAccountTeamScopeRequestSchema>

/** Le compte vu par les deux règles de droit (#4996 Q1) : seul le responsable compte ici. */
type TeamRightsAccount = { assigned_to: string | null }

/** Composer l'équipe : le responsable du compte ou tout porteur de `team:manage`. */
export function canEditAccountTeam(role: WorkspaceRole, userId: string, account: TeamRightsAccount): boolean {
  return account.assigned_to === userId || hasPermission(role, 'team:manage')
}

/**
 * Poser le périmètre d'un membre : qui compose l'équipe pour tous, et chaque membre du compte (responsable ou
 * co-équipier actif) pour lui-même — un filtre personnel, pas un droit.
 */
export function canEditOwnScope(
  role: WorkspaceRole,
  userId: string,
  account: TeamRightsAccount,
  isMember: boolean,
): boolean {
  return canEditAccountTeam(role, userId, account) || isMember
}

export const addAccountTeamMemberRequestSchema = z.object({ user_id: z.string().guid() })
export type AddAccountTeamMemberRequest = z.infer<typeof addAccountTeamMemberRequestSchema>
