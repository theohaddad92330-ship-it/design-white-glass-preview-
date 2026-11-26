import { createZodDto } from 'nestjs-zod'
import { updateBannerSchema } from '@bellum/contracts'

/** Body of `PATCH /internal/admin/banners/:id` — every field optional. */
export class UpdateBannerDto extends createZodDto(updateBannerSchema) {}
