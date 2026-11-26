import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import {
  confirmSmsVerificationSchema,
  notificationInboxScopeSchema,
  startSmsVerificationSchema,
  updateNotificationPreferencesSchema,
  updateSmsTypeOptInsSchema,
} from '@bellum/contracts'

/** PATCH /notifications/preferences — every toggle optional (single-flip). */
export class UpdateNotificationPreferencesDto extends createZodDto(updateNotificationPreferencesSchema) {}

/**
 * #1938.4 — décision Louis 13/09 batch 13. Trois corps, chacun sa liste
 * blanche : les choix SMS ne portent QUE des types (jamais un numéro ni une date
 * de vérification), la demande de code QUE le numéro, la saisie QUE le code.
 */
export class UpdateSmsTypeOptInsDto extends createZodDto(updateSmsTypeOptInsSchema) {}
export class StartSmsVerificationDto extends createZodDto(startSmsVerificationSchema) {}
export class ConfirmSmsVerificationDto extends createZodDto(confirmSmsVerificationSchema) {}

/** GET /notifications — page/size query, coerced from the query string. */
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(50).default(20),
  // #4158.14 — « Équipe » est un FILTRE de la boîte, pas une seconde cloche.
  scope: notificationInboxScopeSchema.default('all'),
})

export class ListNotificationsQueryDto extends createZodDto(listNotificationsQuerySchema) {}
