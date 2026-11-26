import { z } from 'zod'

/**
 * #3413 « autre BU » (lot D2 02/10, décision Louis 02/10 QCM) — le TRANSFERT RÉEL
 * d'une mission vers une autre business unit de NOTRE espace (les BU de l'ESN
 * utilisatrice — jamais les divisions du client, qui vivent dans
 * `account_entities`).
 *
 * Un GESTE explicite : `confirm` est un littéral `true`, refusé sinon — rien ne
 * déplace une mission « en passant » (même discipline que le consentement de
 * `external-sourcing.ts`). La mission change de BU propriétaire ; le transfert
 * est journalisé (qui, quand, BU source → BU cible) dans le journal d'écriture de
 * la fiche, jamais supprimé : on archive, on ne supprime pas.
 */
export const missionBusinessUnitTransferInputSchema = z.object({
  targetBusinessUnitId: z.string().guid(),
  confirm: z.literal(true),
})
export type MissionBusinessUnitTransferInput = z.infer<typeof missionBusinessUnitTransferInputSchema>

const businessUnitRefSchema = z.object({ id: z.string().guid(), name: z.string() })

export const missionBusinessUnitTransferResultSchema = z.object({
  missionId: z.string().guid(),
  /** `null` = la mission n'avait AUCUNE BU propriétaire (ni la sienne, ni celle de
   *  son compte) — « pas de BU » se nomme, ce n'est pas une BU inventée. */
  from: businessUnitRefSchema.nullable(),
  to: businessUnitRefSchema,
})
export type MissionBusinessUnitTransferResult = z.infer<typeof missionBusinessUnitTransferResultSchema>
