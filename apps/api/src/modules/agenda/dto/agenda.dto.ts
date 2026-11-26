import {
  agendaCalendarRefSchema,
  agendaEventDraftSchema,
  agendaRescheduleSchema,
  agendaRangeRequestSchema,
  agendaSelectionSchema,
  freeSlotsRequestSchema,
} from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Un booléen de query string.
 *
 * `z.coerce.boolean()` ne convient pas ici : il rend `true` pour la chaîne
 * `"false"`, si bien que `?allCalendars=false` lirait TOUS les agendas — un
 * paramètre qui fait l'inverse de ce qu'il dit.
 */
const queryBoolean = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform(value => value === true || value === 'true' || value === '1')

/** Fenêtre d'agenda passée en query string (les nombres arrivent en texte). */
export const agendaRangeQuerySchema = agendaRangeRequestSchema.extend({
  allCalendars: queryBoolean.optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
})

export class AgendaRangeQueryDto extends createZodDto(agendaRangeQuerySchema) {}

export const freeSlotsQuerySchema = freeSlotsRequestSchema.extend({
  durationMinutes: z.coerce.number().int().min(15).max(480).default(60),
  workdayStartHour: z.coerce.number().int().min(0).max(23).default(9),
  workdayEndHour: z.coerce.number().int().min(1).max(24).default(18),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})

export class FreeSlotsQueryDto extends createZodDto(freeSlotsQuerySchema) {}

export class AgendaEventDraftDto extends createZodDto(agendaEventDraftSchema) {}

/** Le déplacement d'un rendez-vous : nouvelles bornes + faut-il prévenir. */
export class AgendaRescheduleDto extends createZodDto(agendaRescheduleSchema) {}

/** Le couple fournisseur + agenda choisi dans le sélecteur. */
export class AgendaCalendarRefDto extends createZodDto(agendaCalendarRefSchema) {}

/** Les agendas cochés — la liste ENTIÈRE à chaque fois, jamais un delta : un
 *  « ajoute celui-ci » perdu en route laisserait deux écrans en désaccord sur
 *  ce que Bellum lit. */
export class AgendaSelectionDto extends createZodDto(agendaSelectionSchema) {}
