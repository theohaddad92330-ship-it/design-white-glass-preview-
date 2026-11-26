import { z } from 'zod'
import {
  briefChartSchema,
  briefEsnSchema,
  briefGuardrailSchema,
  briefKnowledgeRowSchema,
  briefKpiSchema,
  briefPersonSchema,
  briefSectionSchema,
} from './commercial-brief.js'

/**
 * Brief d'un MARCHÉ LOCAL (capacité « Marchés locaux », 04/10/2026, lot L0).
 *
 * Distinct de `CommercialBrief` : celui-ci décrit UN compte, celui-là une ZONE
 * (département(s) français ou canton(s) suisses) — qui y achète, qui y vend, à
 * quel prix. Les sous-schémas communs (kpi, « ce que je sais », graphique, ESN,
 * personne, section, garde-fou) sont ceux du brief commercial, jamais copiés.
 *
 * Les contrôles MÉTIER (France et Suisse mêlées, devise, cellule de prix
 * sous-échantillonnée, grille concentrée sur un client, couverture lue comme un
 * fait de marché, probabilité) vivent dans `../market-brief/controls.ts` ; ce
 * schéma tient la FORME, plus le raffinement de zone (D4).
 *
 * Personnes EN CLAIR, avec leur employeur (D5) : aucun masquage ici.
 * Contrat FERMÉ (`.strict()`), comme le brief commercial.
 */

const text = z.string().trim().min(1)
const count = z.number().int().nonnegative()

export const MARKET_SCOPES = ['france', 'suisse'] as const
export const MARKET_CURRENCIES = ['EUR', 'CHF'] as const
/**
 * D6 : `own_needs_missions` = les besoins et missions de l'espace ;
 * `observed_public` = collecte Bellum de sources publiques ; `provided_file` =
 * classeur fourni (la démo). Une grille se nomme toujours sa source.
 */
export const MARKET_PRICE_SOURCE_KINDS = ['own_needs_missions', 'observed_public', 'provided_file'] as const

/** Code INSEE de département : deux chiffres, `2A`/`2B`, ou DOM à trois chiffres. */
const departmentCode = z.string().regex(/^(\d{2,3}|2[AB])$/, 'code INSEE de département attendu')
/** Sigle de canton suisse : deux lettres majuscules (VD, GE, ZH…). */
const cantonCode = z.string().regex(/^[A-Z]{2}$/, 'sigle de canton attendu')

export const marketZoneSchema = z
  .object({
    label: text,
    scope: z.enum(MARKET_SCOPES),
    departments: z.array(departmentCode),
    cantons: z.array(cantonCode),
    cities: z.array(text),
  })
  .strict()
  .superRefine((zone, ctx) => {
    if (zone.scope === 'france') {
      if (zone.departments.length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['departments'],
          message: 'Une zone france porte au moins un département.',
        })
      }
      if (zone.cantons.length > 0) {
        ctx.addIssue({ code: 'custom', path: ['cantons'], message: 'Une zone france ne porte aucun canton.' })
      }
      return
    }
    if (zone.cantons.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['cantons'], message: 'Une zone suisse porte au moins un canton.' })
    }
    if (zone.departments.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['departments'], message: 'Une zone suisse ne porte aucun département.' })
    }
  })

/** Une cellule de séniorité : absente quand l'échantillon est trop mince (contrôle PRICE_CELL_UNDERSAMPLED). */
const priceCellSchema = z.object({ amount: z.number().positive(), n: count }).strict()

const priceRowSchema = z
  .object({
    family: text,
    needs: count,
    median: z.number().positive(),
    junior: priceCellSchema.optional(),
    confirmed: priceCellSchema.optional(),
    senior: priceCellSchema.optional(),
    range: z.object({ min: z.number().positive(), max: z.number().positive() }).strict().optional(),
  })
  .strict()

const priceGridSchema = z
  .object({
    currency: z.enum(MARKET_CURRENCIES),
    period: text,
    sample_size: count,
    source_kind: z.enum(MARKET_PRICE_SOURCE_KINDS),
    top_client: z.object({ name: text, n: count }).strict().optional(),
    rows: z.array(priceRowSchema),
  })
  .strict()

const priceTrendSchema = z.object({ year: z.number().int(), needs: count, median: z.number().positive() }).strict()

const clientSchema = z
  .object({
    name: text,
    sector: text.optional(),
    size: text.optional(),
    profiles: count.optional(),
    externals: count.optional(),
    cities: z.array(text),
    families: text.optional(),
    reading: text.optional(),
  })
  .strict()

const groupSchema = z
  .object({
    name: text,
    note: text.optional(),
    members: z.array(
      z
        .object({ name: text, profiles: count.optional(), externals: count.optional(), needs: count.optional() })
        .strict(),
    ),
  })
  .strict()

const calendarSchema = z
  .object({ label: text, actors: text.optional(), when: text, detail: text.optional(), source: text.optional() })
  .strict()

const ruleSchema = z.object({ rule: text, regime: text.optional(), known: text, meaning: text }).strict()

export const marketBriefSchema = z
  .object({
    zone: marketZoneSchema,
    generated_at: z.string().datetime({ offset: true }),
    kpis: z.array(briefKpiSchema).max(6),
    what_i_know: z.array(briefKnowledgeRowSchema).min(1),
    charts: z.array(briefChartSchema),
    esn: z.array(briefEsnSchema),
    people: z.array(briefPersonSchema),
    sections: z.array(briefSectionSchema),
    guardrails: z.array(briefGuardrailSchema).min(1),
    price_grid: priceGridSchema.optional(),
    price_trend: z.array(priceTrendSchema).optional(),
    clients: z.array(clientSchema).optional(),
    groups: z.array(groupSchema).optional(),
    calendar: z.array(calendarSchema).optional(),
    rules: z.array(ruleSchema).optional(),
  })
  .strict()

export type MarketBrief = z.infer<typeof marketBriefSchema>
