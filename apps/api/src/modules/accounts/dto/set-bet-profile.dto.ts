import { createZodDto } from 'nestjs-zod'
import { setBetProfileSchema } from '@bellum/contracts'

export class SetBetProfileDto extends createZodDto(setBetProfileSchema) {}
