import { createZodDto } from 'nestjs-zod'
import { updateBtmmpSchema } from '@bellum/contracts'

/** Body de PATCH /opportunities/:id/btmmp — qualification BTMMP (annexe p21). */
export class UpdateBtmmpDto extends createZodDto(updateBtmmpSchema) {}
