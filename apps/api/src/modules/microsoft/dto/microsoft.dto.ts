import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/**
 * Send a single email through the connected Microsoft 365 mailbox. ONE recipient
 * per call — the outbound garde-fou (#394): opt-out is checked server-side before
 * anything leaves.
 */
export const microsoftSendMailSchema = z
  .object({
    to: z.string().email(),
    subject: z.string().trim().min(1).max(300),
    body: z.string().min(1).max(50_000),
    bodyType: z.enum(['Text', 'HTML']).optional(),
  })
  .strict()

export class MicrosoftSendMailDto extends createZodDto(microsoftSendMailSchema) {}

/** Create an Outlook calendar event on the connected mailbox. `start`/`end` are
 *  ISO datetimes; `timeZone` defaults to UTC server-side. */
export const microsoftCalendarEventSchema = z
  .object({
    subject: z.string().trim().min(1).max(300),
    body: z.string().max(50_000).optional(),
    bodyType: z.enum(['Text', 'HTML']).optional(),
    start: z.string().datetime({ offset: true }),
    end: z.string().datetime({ offset: true }),
    timeZone: z.string().trim().min(1).max(100).optional(),
    location: z.string().trim().min(1).max(300).optional(),
    attendees: z
      .array(z.object({ email: z.string().email(), name: z.string().trim().min(1).max(200).optional() }).strict())
      .max(50)
      .optional(),
  })
  .strict()

export class MicrosoftCalendarEventDto extends createZodDto(microsoftCalendarEventSchema) {}
