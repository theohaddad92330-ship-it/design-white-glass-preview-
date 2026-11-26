import { createZodDto } from 'nestjs-zod'
import { companySearchQuerySchema } from '@bellum/contracts'

export class SearchCompaniesDto extends createZodDto(companySearchQuerySchema) {}
