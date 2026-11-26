import { assignApprovalRequestSchema, atsConnectSchema, snoozeApprovalRequestSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export class AtsConnectDto extends createZodDto(atsConnectSchema) {}

/** Bornes des deux fenêtres du rapport : fin de mission J-30, intercontrat > 30 j. */
export const atsSnapshotQuerySchema = z
  .object({
    endingWithinDays: z.coerce.number().int().min(1).max(180).optional(),
    benchMinDays: z.coerce.number().int().min(1).max(365).optional(),
  })
  .strict()

export class AtsSnapshotQueryDto extends createZodDto(atsSnapshotQuerySchema) {}

/**
 * Une demande d'écriture dans l'ERP (décision Louis du 03/08 : autorisée, après
 * approbation explicite).
 *
 * Un schéma par type d'écriture plutôt qu'un objet libre : ce qui part dans
 * l'ERP d'une ESN engage sa facturation, et un corps générique finirait par
 * transporter n'importe quoi.
 */
export const atsWriteRequestSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('create_mission'),
      clientName: z.string().trim().min(1).max(200),
      consultantName: z.string().trim().min(1).max(200),
      startDate: z.string().trim().min(4).max(40),
      endDate: z.string().trim().max(40).optional(),
      dailyRate: z.number().finite().nonnegative().max(10_000).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('update_tjm'),
      // L'identifiant de la ressource ERP à CORRIGER (l'id BoondManager de la
      // mission). Sans lui, ce n'est pas une mise à jour, c'est une création
      // déguisée : `BoondManagerClient.update()` la refuse.
      resourceId: z.string().trim().min(1).max(120),
      consultantName: z.string().trim().min(1).max(200),
      missionReference: z.string().trim().min(1).max(120),
      dailyRate: z.number().finite().nonnegative().max(10_000),
      effectiveFrom: z.string().trim().max(40).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('update_need_status'),
      resourceId: z.string().trim().min(1).max(120),
      needReference: z.string().trim().min(1).max(120),
      status: z.string().trim().min(1).max(80),
      comment: z.string().trim().max(2000).optional(),
    })
    .strict(),
  // #4692 — compte rendu d'appel. `summary` = le texte du commercial (jamais le corps d'un message, doctrine) ;
  // `typeOf` = une valeur du dictionnaire de l'instance, validée à l'exécution (jamais un id codé en dur).
  z
    .object({
      kind: z.literal('log_call'),
      contactId: z.string().trim().min(1).max(120),
      contactName: z.string().trim().min(1).max(200),
      typeOf: z.string().trim().regex(/^\d+$/).max(20),
      title: z.string().trim().min(1).max(200),
      summary: z.string().trim().min(1).max(2000),
      startDate: z.string().datetime({ offset: true }),
      endDate: z.string().datetime({ offset: true }).optional(),
      companyId: z.string().trim().min(1).max(120).optional(),
    })
    .strict(),
])

/**
 * Le DTO enveloppe l'union dans un objet : `createZodDto` ne sait pas dériver
 * une classe d'une union discriminée, et l'aplatir en un objet à champs
 * optionnels ferait perdre exactement ce qu'on veut garder — qu'un TJM soit
 * obligatoire pour un changement de TJM, et absent partout ailleurs.
 */
export const atsWriteRequestBodySchema = z.object({ write: atsWriteRequestSchema }).strict()

export class AtsWriteRequestDto extends createZodDto(atsWriteRequestBodySchema) {}

/** La décision d'un responsable sur une demande d'écriture. */
export const atsWriteDecisionSchema = z.object({ decision: z.enum(['approve', 'reject']) }).strict()

export class AtsWriteDecisionDto extends createZodDto(atsWriteDecisionSchema) {}

/**
 * #2864 — reste du lot précédent : CONFIER une écriture ERP en attente à un
 * collègue. Même contrat que `assignApprovalRequestSchema` (Action OS) et que
 * `AssignCrmWriteRequestDto` (écritures CRM) — GA-26, un réglage vit à un
 * seul endroit.
 */
export class AtsAssignWriteRequestDto extends createZodDto(assignApprovalRequestSchema) {}

/**
 * #2856 — reste du lot précédent : REPORTER une écriture ERP en attente.
 * Même contrat que `snoozeApprovalRequestSchema` (Action OS) — GA-26.
 */
export class AtsSnoozeWriteRequestDto extends createZodDto(snoozeApprovalRequestSchema) {}
