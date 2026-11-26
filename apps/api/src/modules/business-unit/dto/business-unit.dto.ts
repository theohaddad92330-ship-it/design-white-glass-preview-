import { createZodDto } from 'nestjs-zod'
import {
  createBusinessUnitSchema,
  requestBusinessUnitAccessSchema,
  setMemberBusinessUnitAccessSchema,
  updateBusinessUnitSchema,
} from '@bellum/contracts'

export class CreateBusinessUnitDto extends createZodDto(createBusinessUnitSchema) {}
export class UpdateBusinessUnitDto extends createZodDto(updateBusinessUnitSchema) {}
export class RequestBusinessUnitAccessDto extends createZodDto(requestBusinessUnitAccessSchema) {}
export class SetMemberBusinessUnitAccessDto extends createZodDto(setMemberBusinessUnitAccessSchema) {}
