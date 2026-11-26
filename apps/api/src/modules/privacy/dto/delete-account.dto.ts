import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { DELETION_CONFIRMATION } from '../privacy-deletion.service'

/**
 * Body of `POST /privacy/delete-account`. The client MUST echo the exact
 * confirmation phrase — a Zod literal, so any other value is rejected with a 400
 * before the service runs. This is the irreversible-action safeguard required by
 * the erasure flow.
 */
export const deleteAccountSchema = z.object({
  confirm: z.literal(DELETION_CONFIRMATION, {
    error: `Tapez « ${DELETION_CONFIRMATION} » pour confirmer la suppression.`,
  }),
})

export class DeleteAccountDto extends createZodDto(deleteAccountSchema) {}
