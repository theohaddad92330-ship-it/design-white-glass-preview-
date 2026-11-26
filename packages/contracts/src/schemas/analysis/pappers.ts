import { z } from 'zod'
import { nullableBoolean, nullableNumber, nullableString } from './base.js'

/**
 * Pappers-sourced sub-schemas embedded into the analysis blob.
 *
 * Wire shape is canonical **snake_case** — Postgres is snake, Pappers Pydantic
 * dumps with French snake aliases, Claude prompts are instructed to emit
 * snake too. The whole `raw_analysis` blob is snake end-to-end.
 *
 * Only fields the web actually renders are declared; the rest of Pappers'
 * very large payload is not part of the wire contract.
 */

/** Pappers legal representative — feeds the organigramme + contacts. */
export const executiveSchema = z.object({
  first_name: nullableString,
  last_name: nullableString,
  role: nullableString,
  is_c_level: nullableBoolean,
})
export type Executive = z.infer<typeof executiveSchema>

/** Pappers ``etablissements`` — same legal entity, different SIRET. Drives SitesFranceCard. */
export const branchOfficeSchema = z.object({
  city: nullableString,
  postal_code: nullableString,
  country: nullableString,
  latitude: nullableNumber,
  longitude: nullableNumber,
  is_headquarters: nullableBoolean,
})
export type BranchOffice = z.infer<typeof branchOfficeSchema>

/** Pappers cartographie subsidiary — rendered in EntitiesGraphCard. */
export const subsidiarySchema = z.object({
  siren: nullableString,
  name: nullableString,
  legal_name: nullableString,
})
export type Subsidiary = z.infer<typeof subsidiarySchema>
