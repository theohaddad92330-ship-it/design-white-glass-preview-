import { REMINDER_TONES } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Les entrées de la relance d'une facture en retard (#1655).
 *
 * ⚠️ Fichier SÉPARÉ de `provision-client.dto.ts`, et c'est délibéré : le
 * provisionnement décrit un CONTRAT, la relance décrit un GESTE sur une facture.
 * Les mêler aurait fait grossir un fichier que plusieurs lots ouvrent en même
 * temps, pour aucun gain de lecture.
 *
 * ⚠️ Le vocabulaire des tons vient de `REMINDER_TONES` (`@bellum/contracts`),
 * jamais recopié : un réglage vit à un seul endroit (GA-26), et un quatrième ton
 * écrit ici serait un ton que la cadence ne sait pas produire.
 */

/** `neutral` / `firm` / `escalate` — les trois tons du produit, lus à la source. */
const reminderTone = z.enum(REMINDER_TONES)

/**
 * Préparer la relance d'une période : sur quelle période, et sur quel ton.
 *
 * `tone` est le ton CHOISI par l'opérateur (règle 3). Absent, c'est la cadence
 * qui décide — et la réponse porte les deux, pour que l'écran puisse dire « ton
 * forcé » plutôt que de laisser croire que la cadence a changé d'avis.
 */
export const prepareReminderQuerySchema = z.object({
  workspaceId: z.string().guid(),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Période attendue au format YYYY-MM-DD'),
  tone: reminderTone.optional(),
})
export class PrepareReminderQueryDto extends createZodDto(prepareReminderQuerySchema) {}

/**
 * CONSIGNER une relance qu'un humain vient d'envoyer.
 *
 * ⚠️ Il n'y a PAS de champ « destinataire », « corps » ni « pièce jointe » : ce
 * geste n'envoie rien. Il enregistre que quelqu'un a envoyé le message préparé,
 * pour que la cadence avance et que la trace existe.
 *
 * `actor` est l'adresse authentifiée de l'opérateur (#1668), propagée par le
 * back-office. Sans elle, la trace dit « quelqu'un », ce qui n'est pas une trace.
 */
export const logReminderSchema = z.object({
  tone: reminderTone,
  actor: z.string().trim().min(1).max(320),
})
export class LogReminderDto extends createZodDto(logReminderSchema) {}

/**
 * Déclarer un litige, ou le lever.
 *
 * Le motif est OBLIGATOIRE à la déclaration — « en litige » sans rien d'autre ne
 * se relit pas — et c'est ce que le client REPROCHE, dans les mots de celui qui
 * l'a entendu. `resolve: true` lève le litige sans effacer sa déclaration : on
 * archive, on ne supprime pas.
 */
export const setInvoiceDisputeSchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
    resolve: z.coerce.boolean().optional(),
  })
  .refine(input => Boolean(input.resolve) !== Boolean(input.reason), {
    message: 'Déclarer un litige demande un motif ; le lever demande `resolve: true`. Jamais les deux.',
  })
export class SetInvoiceDisputeDto extends createZodDto(setInvoiceDisputeSchema) {}
