import { oauthAccessLevelSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Create a Calendar event / relance reminder. `startDateTime` is an RFC3339
 * timestamp WITH offset (or `Z`); `endDateTime` defaults to +30 min server-side.
 * `link` is an optional Bellum account/contact URL appended to the description.
 */
export const createCalendarEventSchema = z
  .object({
    summary: z.string().trim().min(1).max(300),
    startDateTime: z.string().datetime({ offset: true }),
    endDateTime: z.string().datetime({ offset: true }).optional(),
    description: z.string().trim().max(8000).optional(),
    attendees: z.array(z.string().email()).max(50).optional(),
    link: z.string().url().max(1000).optional(),
    calendarId: z.string().trim().min(1).max(200).optional(),
  })
  .strict()

export class CreateCalendarEventDto extends createZodDto(createCalendarEventSchema) {}

/**
 * Send a single email from the connected Gmail mailbox. Deliberately ONE
 * recipient per call (no `to[]`) — the same "no uncontrolled mass send" guardrail
 * the outreach mailer enforces; the service also checks the opt-out list.
 */
export const sendGmailSchema = z
  .object({
    to: z.string().email(),
    subject: z.string().trim().min(1).max(500),
    body: z.string().trim().min(1).max(50_000),
  })
  .strict()

export class SendGmailDto extends createZodDto(sendGmailSchema) {}

/**
 * #2078.23 — la demande de consentement NOMME son niveau (lecture ; lecture +
 * écriture). Obligatoire : un appelant qui l'oublie ne reçoit ni le lot complet
 * par défaut (élévation implicite) ni la lecture par défaut (rétrogradation
 * silencieuse) — il reçoit un 400.
 */
export const googleAuthorizeQuerySchema = z.object({ level: oauthAccessLevelSchema }).strict()

export class GoogleAuthorizeQueryDto extends createZodDto(googleAuthorizeQuerySchema) {}

/** List Drive files (Google Docs + PDFs). `search` matches on the file name. */
export const driveFilesQuerySchema = z
  .object({
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
    pageToken: z.string().min(1).max(4000).optional(),
    search: z.string().trim().min(1).max(200).optional(),
  })
  .strict()

export class DriveFilesQueryDto extends createZodDto(driveFilesQuerySchema) {}

/** Ingest one selected Drive file into the existing RAG store. */
export const driveIngestSchema = z.object({ fileId: z.string().trim().min(1).max(200) }).strict()

export class DriveIngestDto extends createZodDto(driveIngestSchema) {}

/** Read recent Gmail exchanges with one contact (metadata only). */
export const gmailThreadsQuerySchema = z
  .object({
    email: z.string().email(),
    maxResults: z.coerce.number().int().min(1).max(25).optional(),
  })
  .strict()

export class GmailThreadsQueryDto extends createZodDto(gmailThreadsQuerySchema) {}

/** List upcoming calendar events, optionally filtered by an account domain/name. */
export const upcomingEventsQuerySchema = z
  .object({
    query: z.string().trim().min(1).max(200).optional(),
    maxResults: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict()

export class UpcomingEventsQueryDto extends createZodDto(upcomingEventsQuerySchema) {}

/**
 * Export a grid (already assembled client-side, mirroring the CSV export columns)
 * into a new Google Sheet. Bounded to keep the payload sane — this is a contacts
 * export, not a bulk data pipe.
 */
export const exportSheetSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    columns: z.array(z.string().max(500)).min(1).max(40),
    rows: z.array(z.array(z.string().max(2000)).max(40)).max(5000),
  })
  .strict()

export class ExportSheetDto extends createZodDto(exportSheetSchema) {}

/** Recherche dans le CONTENU des documents, pas seulement dans leur nom. */
export const driveSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(200),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()

export class DriveSearchQueryDto extends createZodDto(driveSearchQuerySchema) {}

/**
 * Classer un message : une étiquette, et l'archivage en option.
 *
 * `archive` est explicite et par défaut FAUX. Retirer un message de la boîte de
 * réception est une action que l'utilisateur doit demander, pas un effet de bord
 * d'un étiquetage.
 */
export const googleClassifyMessageSchema = z
  .object({
    messageId: z.string().trim().min(1).max(200),
    labelName: z.string().trim().min(1).max(120),
    archive: z.boolean().default(false),
  })
  .strict()

export class GoogleClassifyMessageDto extends createZodDto(googleClassifyMessageSchema) {}
