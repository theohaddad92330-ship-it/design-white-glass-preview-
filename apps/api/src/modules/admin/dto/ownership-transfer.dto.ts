import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #4158.33 — le nouveau propriétaire est une personne précise, choisie par l'opérateur.
export const ownershipTransferSchema = z.object({ newOwnerUserId: z.string().guid() })
export class OwnershipTransferDto extends createZodDto(ownershipTransferSchema) {}
export class OwnershipTransferQueryDto extends createZodDto(ownershipTransferSchema) {}
