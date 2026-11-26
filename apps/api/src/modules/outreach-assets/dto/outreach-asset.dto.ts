import { createZodDto } from 'nestjs-zod'
import { createOutreachAssetSchema, updateOutreachAssetSchema, uploadOutreachAssetFileSchema } from '@bellum/contracts'

export class CreateOutreachAssetDto extends createZodDto(createOutreachAssetSchema) {}
export class UpdateOutreachAssetDto extends createZodDto(updateOutreachAssetSchema) {}
export class UploadOutreachAssetFileDto extends createZodDto(uploadOutreachAssetFileSchema) {}
