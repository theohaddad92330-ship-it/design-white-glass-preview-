import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** `YYYY-MM` — la même forme que la contrainte SQL des deux tables. */
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Le mois s’écrit AAAA-MM.')

/**
 * Figer un mois à la main, depuis le back-office.
 *
 * `month` est facultatif : sans lui, c'est le mois qui vient de finir — la même
 * cible que le passage du 1er. Le préciser sert au premier instantané de la
 * série, celui qu'on ne veut pas attendre un mois pour avoir.
 */
export const takeSnapshotSchema = z.object({ month: monthSchema.optional() })
export class TakeSnapshotDto extends createZodDto(takeSnapshotSchema) {}

/**
 * Un montant saisi, en CENTIMES.
 *
 * ⚠️ `null` est une valeur, pas une absence : il EFFACE le champ. Un champ
 * simplement omis reste tel qu'il était. C'est ce qui permet de corriger une
 * seule case sans que les trois autres soient réécrites — et, surtout, de
 * remettre un champ à « non mesuré », ce qu'un `0` ne dirait pas.
 */
const centsSchema = z.coerce.number().int().nullable()

/** La saisie d'un mois de trésorerie (#1649). */
export const saveTreasurySchema = z
  .object({
    bankBalanceCents: centsSchema.optional(),
    fixedExpensesCents: centsSchema.optional(),
    variableExpensesCents: centsSchema.optional(),
    collectedCents: centsSchema.optional(),
  })
  .refine(dto => Object.keys(dto).length > 0, {
    message: 'Indiquer au moins un montant à écrire.',
  })
export class SaveTreasuryDto extends createZodDto(saveTreasurySchema) {}
