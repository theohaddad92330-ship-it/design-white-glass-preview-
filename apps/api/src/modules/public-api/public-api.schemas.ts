import {
  accountListQuerySchema,
  accountListResponseSchema,
  itChallengeSchema,
  paginatedResultSchema,
  recentSignalSchema,
} from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * OUTPUT CONTRACT of the public `/v1` API — explicit ALLOWLISTS, never the
 * raw entities. What is deliberately absent is the point:
 *  - accounts: no `raw_analysis` blob, no `api_cost_euros`, no `user_context`,
 *    no `error_message`, no `user_id` / `workspace_id`;
 *  - contacts: no `raw_data`, no drafted messages, no decider psychology
 *    (`career_levers` / `implicit_fears`), no internal ids;
 *  - runs: no `cost_eur` (internal spend), no `prompt_versions` (internal
 *    debug metadata).
 * The no-leak spec (`v1-no-leak.spec.ts`) locks these lists.
 */

/** Dossier detail — registry facts + analysis outcome, without internals. */
const publicAccountDetailSchema = z.object({
  id: z.string().guid(),
  company_name: z.string(),
  sector: z.string().nullable(),
  employees: z.string().nullable(),
  revenue: z.string().nullable(),
  headquarters: z.string().nullable(),
  website: z.string().nullable(),
  siren: z.string().nullable(),
  registry_id: z.string().nullable(),
  registry_country: z.string().nullable(),
  naf_code: z.string().nullable(),
  status: z.string(),
  commercial_status: z.string(),
  priority_score: z.number().nullable(),
  priority_justification: z.string().nullable(),
  subsidiaries: z.array(z.string()),
  it_challenges: z.array(itChallengeSchema),
  recent_signals: z.array(recentSignalSchema),
  created_at: z.date(),
  updated_at: z.date(),
})
export type PublicAccountDetail = z.infer<typeof publicAccountDetailSchema>

/** Contact — identity, role and reach info; no drafts, no raw enrichment. */
const publicContactSchema = z.object({
  id: z.string().guid(),
  /** `null` = contact à qualifier, sans entreprise connue (#1473). Le champ
   *  reste TOUJOURS présent : le retirer casserait les clients qui le lisent. */
  account_id: z.string().guid().nullable(),
  full_name: z.string(),
  title: z.string().nullable(),
  entity: z.string().nullable(),
  family: z.string().nullable(),
  decision_role: z.string().nullable(),
  priority: z.number().int().nullable(),
  email: z.string().nullable(),
  email_verified: z.boolean(),
  phone: z.string().nullable(),
  linkedin_url: z.string().nullable(),
  profile_summary: z.string().nullable(),
  why_contact: z.string().nullable(),
  lifecycle_state: z.string().nullable(),
  contact_score: z.number().int().nullable(),
  seniority: z.string().nullable(),
  location: z.string().nullable(),
  source: z.string().nullable(),
  created_at: z.date(),
  updated_at: z.date(),
})
export type PublicContact = z.infer<typeof publicContactSchema>

/** Analysis run — status + timeline; internal cost/debug columns excluded. */
const publicRunSchema = z.object({
  id: z.string().guid(),
  account_id: z.string().guid(),
  status: z.string(),
  scope_mode: z.string().nullable(),
  siren: z.string().nullable(),
  created_at: z.date(),
  completed_at: z.date().nullable(),
})
export type PublicRun = z.infer<typeof publicRunSchema>

/** Shared list query for `/v1/contacts` and `/v1/runs`. */
const v1ListQuerySchema = z.object({
  account_id: z.string().guid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})
export type V1ListQuery = z.infer<typeof v1ListQuerySchema>

/* --- DTO classes (request validation + OpenAPI schemas) ------------------ */

// zod 4 refuse de décrire un `z.date()` en JSON Schema. Les schémas ci-dessus le
// gardent pour TYPER ce que le service renvoie (un `Date` d'entité) ; l'OpenAPI,
// lui, documente ce que le fil porte : une chaîne `date-time`, comme avant.
const wireDate = z.iso.datetime()
const publicAccountDetailDocSchema = publicAccountDetailSchema.extend({ created_at: wireDate, updated_at: wireDate })
const publicContactDocSchema = publicContactSchema.extend({ created_at: wireDate, updated_at: wireDate })
const publicRunDocSchema = publicRunSchema.extend({ created_at: wireDate, completed_at: wireDate.nullable() })

export class V1ListAccountsQueryDto extends createZodDto(accountListQuerySchema) {}
export class V1ListQueryDto extends createZodDto(v1ListQuerySchema) {}

export class V1AccountListResponseDto extends createZodDto(accountListResponseSchema) {}
export class V1AccountDetailDto extends createZodDto(publicAccountDetailDocSchema) {}
export class V1ContactListResponseDto extends createZodDto(paginatedResultSchema(publicContactDocSchema)) {}
export class V1RunListResponseDto extends createZodDto(paginatedResultSchema(publicRunDocSchema)) {}
