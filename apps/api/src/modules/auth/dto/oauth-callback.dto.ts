import { createZodDto } from 'nestjs-zod'
import { oauthCallbackSchema } from '@bellum/contracts'

export class OauthCallbackDto extends createZodDto(oauthCallbackSchema) {}
