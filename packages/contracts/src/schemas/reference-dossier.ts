import { z } from 'zod'

/**
 * Théo A comptes-fiche-reference.N1/N2/N3/R3 — ce que montre un DOSSIER DE RÉFÉRENCE de plus
 * que la fiche standard : programmes cités, pratiques achats, organisation par regroupements,
 * expertises, TJM historiques par circuit, historique des besoins, écosystème.
 *
 * Aucune colonne : un bloc `raw_analysis.reference_dossier`, posé par l'import d'une archive
 * (jamais par une analyse en ligne). Chaque champ vient d'une ligne du relevé ; ce que le relevé
 * ne dit pas reste `null` — jamais deviné. Un bloc mal formé se lit comme « absent ».
 */
export const REFERENCE_DOSSIER_KEY = 'reference_dossier'

const text = z.string().min(1)
const nullableText = text.nullable()

const programmeSchema = z.object({
  /** « 2026-2027 » — `null` quand le relevé ne date pas le programme. */
  period: nullableText,
  /** « Relevé du 01/10/2026 » — le relevé fourni, pas un éditeur. */
  statement_label: text,
  title: text,
  summary: nullableText,
  /** « Ce que le relevé en déduit » — une lecture, pas une demande confirmée. */
  reading: nullableText,
  /** Le conseil d'approche que le relevé en tire. */
  angle: nullableText,
})

const purchasingStepSchema = z.object({
  title: text,
  note: nullableText,
  /** La fiabilité du relevé : « Confirmé », « Observé », « Garde-fou »… */
  reliability: nullableText,
})

const organisationUnitSchema = z.object({
  kind: text,
  name: text,
  note: nullableText,
})

const ecosystemActorSchema = z.object({
  name: text,
  perimeter: nullableText,
  /** `observed` = observé dans le relevé ; `indirect` = signal indirect (anciens du compte). */
  nature: z.enum(['observed', 'indirect']),
  observation: nullableText,
  /** « Détail & réserve » — ce qui borne la lecture. */
  reserve: nullableText,
})

const referenceDossierSchema = z.object({
  counts: z.object({
    units: z.number().int().nonnegative(),
    historical_needs: z.number().int().nonnegative(),
    tjm_observations: z.number().int().nonnegative(),
    contacts: z.number().int().nonnegative(),
  }),
  programmes: z.array(programmeSchema),
  purchasing: z.array(purchasingStepSchema),
  organisation: z.array(z.object({ label: text, units: z.array(organisationUnitSchema) })),
  expertises: z.array(z.object({ label: text, count: z.number().int().positive() })),
  /** Un circuit, jamais de moyenne entre direct et intermédiaire (MSP). */
  tjm: z.array(
    z.object({
      channel: z.enum(['msp', 'direct']),
      observations: z.number().int().positive(),
      min: z.number().positive(),
      max: z.number().positive(),
    }),
  ),
  needs: z.array(
    z.object({
      title: text,
      entity: nullableText,
      period: nullableText,
      /** €/jour observé — `null` quand le relevé n'en publie pas. */
      rate: z.number().positive().nullable(),
    }),
  ),
  ecosystem: z.array(ecosystemActorSchema),
})

export type ReferenceDossier = z.infer<typeof referenceDossierSchema>

export function readReferenceDossier(raw: Record<string, unknown> | null | undefined): ReferenceDossier | null {
  const parsed = referenceDossierSchema.safeParse(raw?.[REFERENCE_DOSSIER_KEY])
  return parsed.success ? parsed.data : null
}
