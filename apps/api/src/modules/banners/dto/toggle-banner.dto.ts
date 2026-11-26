import { createZodDto } from 'nestjs-zod'
import { toggleBannerSchema } from '@bellum/contracts'

/** Body of `PATCH /internal/admin/banners/:id/toggle`. */
export class ToggleBannerDto extends createZodDto(toggleBannerSchema) {}
