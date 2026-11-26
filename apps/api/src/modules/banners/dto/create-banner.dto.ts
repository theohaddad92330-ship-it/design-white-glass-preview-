import { createZodDto } from 'nestjs-zod'
import { createBannerSchema } from '@bellum/contracts'

/** Body of `POST /internal/admin/banners`. Validated by the global
 *  `ZodValidationPipe` against the shared contract schema (defaults +
 *  window/CTA refinements applied). */
export class CreateBannerDto extends createZodDto(createBannerSchema) {}
