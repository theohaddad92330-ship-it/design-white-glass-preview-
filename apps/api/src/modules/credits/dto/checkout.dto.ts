import { createZodDto } from 'nestjs-zod'
import { checkoutSchema } from '@bellum/contracts'

export class CheckoutDto extends createZodDto(checkoutSchema) {}
