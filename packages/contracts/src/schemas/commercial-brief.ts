import { z } from 'zod'

/**
 * Brief commercial d'un compte (chantier « briefs comptes », 01/10/2026).
 *
 * UN contrat pour trois consommateurs : la salle démo (semée depuis des
 * classeurs), le pipeline IA de tout compte payant (apps/ia, via la copie
 * JSON Schema `packages/shared/schemas/commercial-brief.schema.json`) et
 * l'écran « Ce que je sais ». Les contrôles MÉTIER (siège contredit, entité
 * sortie non marquée, prix moyenné…) vivent dans
 * `../commercial-brief/controls.ts` ; ce schéma ne tient que la FORME.
 *
 * Nom `CommercialBrief` et non `AccountBrief` : ce dernier est déjà un
 * composant web (`apps/web/src/features/brief/view/AccountBrief.tsx`).
 *
 * Contrat FERMÉ (`.strict()`) : une colonne recopiée d'un fichier brut ne
 * s'y glisse pas en silence — c'est ainsi que « Strasbourg » est sorti comme
 * siège de BPCE.
 */

const text = z.string().trim().min(1)
/** Colonne FIABILITÉ des classeurs, recopiée telle quelle quand elle existe. */
const reliability = text.optional()
const iso2 = z.string().regex(/^[A-Z]{2}$/)

/** Aucun canal « mixte » : un prix sans sa source ne se compare à rien. */
export const PRICE_CHANNELS = ['direct', 'msp', 'portage', 'framework', 'sector_reference'] as const
/** Périmètre : la France pour tous les comptes ; la Suisse pour ABB Suisse (décision Louis 04/10/2026, D4). Jamais mêlés. */
const BRIEF_SCOPES = ['france', 'suisse'] as const
const SITE_KINDS = ['headquarters', 'secondary', 'industrial', 'other'] as const
const ENTITY_STATUSES = ['active', 'exited'] as const
const ESN_EVIDENCE_LEVELS = ['confirmed', 'observed', 'hint'] as const
const PERSON_ROLES = ['decision_maker', 'manager', 'contact', 'external', 'alumni'] as const

const headquartersSchema = z.object({ label: text, city: text, address: text.optional() }).strict()

const kpiSchema = z
  .object({ label: text, value: z.union([z.string().trim().min(1), z.number()]), caption: text.optional() })
  .strict()

const knowledgeRowSchema = z.object({ rubric: text, known: text, meaning: text }).strict()

const chartSchema = z
  .object({ title: text, items: z.array(z.object({ label: text, value: z.number() }).strict()) })
  .strict()

const entitySchema = z
  .object({
    name: text,
    nature: text.optional(),
    status: z.enum(ENTITY_STATUSES),
    country: iso2.optional(),
    note: text.optional(),
    reliability,
  })
  .strict()

const siteSchema = z
  .object({ name: text, city: text, country: iso2, kind: z.enum(SITE_KINDS), why: text.optional(), reliability })
  .strict()

const priceSchema = z
  .object({
    label: text,
    amount_eur_per_day: z.number().positive(),
    channel: z.enum(PRICE_CHANNELS),
    note: text.optional(),
    reliability,
  })
  .strict()

const esnSchema = z
  .object({
    name: text,
    evidence_level: z.enum(ESN_EVIDENCE_LEVELS),
    proof: text,
    perimeter: text.optional(),
    reliability,
  })
  .strict()

const personSchema = z
  .object({
    name: text,
    function: text.optional(),
    entity: text.optional(),
    department: text.optional(),
    manager: text.optional(),
    city: text.optional(),
    email: text.optional(),
    mobile: text.optional(),
    phone: text.optional(),
    linkedin: text.optional(),
    hook: text.optional(),
    role: z.enum(PERSON_ROLES).optional(),
    exited: z.boolean().optional(),
    reliability,
  })
  .strict()

/** Cellule de section : `boolean` en plus de la forme proposée, pour qu'une
 *  ligne puisse porter `exited: true` (contrôle EXITED_ENTITY_UNMARKED). */
const cellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])

const sectionSchema = z
  .object({
    key: text,
    title: text,
    columns: z.array(z.object({ key: text, label: text }).strict()),
    rows: z.array(z.record(z.string(), cellSchema)),
  })
  .strict()

const guardrailSchema = z.object({ point: text, detail: text }).strict()

export const commercialBriefSchema = z
  .object({
    account_name: text,
    generated_at: z.string().datetime({ offset: true }),
    scope: z.enum(BRIEF_SCOPES),
    headquarters: headquartersSchema,
    kpis: z.array(kpiSchema).max(6),
    what_i_know: z.array(knowledgeRowSchema).min(1),
    charts: z.array(chartSchema),
    entities: z.array(entitySchema),
    sites: z.array(siteSchema),
    prices: z.array(priceSchema),
    esn: z.array(esnSchema),
    people: z.array(personSchema),
    sections: z.array(sectionSchema),
    guardrails: z.array(guardrailSchema).min(1),
  })
  .strict()

export type CommercialBrief = z.infer<typeof commercialBriefSchema>

/**
 * Sous-schémas réutilisés par `MarketBrief` (marchés locaux, 04/10/2026) — mêmes
 * objets, aucune copie : le brief d'un marché et celui d'un compte ne divergent
 * pas sur la forme d'une ligne. Alias préfixés : `index.ts` ré-exporte tout en
 * `export *`, et `kpiSchema`/`personSchema`… existent déjà ailleurs.
 */
export {
  chartSchema as briefChartSchema,
  esnSchema as briefEsnSchema,
  guardrailSchema as briefGuardrailSchema,
  kpiSchema as briefKpiSchema,
  knowledgeRowSchema as briefKnowledgeRowSchema,
  personSchema as briefPersonSchema,
  priceSchema as briefPriceSchema,
  sectionSchema as briefSectionSchema,
}
