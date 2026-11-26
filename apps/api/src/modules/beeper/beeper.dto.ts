import { beeperRegisterRequestSchema, beeperSendRequestSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'

export class BeeperRegisterDto extends createZodDto(beeperRegisterRequestSchema) {}

/** #4406.3 — l'envoi, sur le geste explicite de l'utilisateur. */
export class BeeperSendDto extends createZodDto(beeperSendRequestSchema) {}
