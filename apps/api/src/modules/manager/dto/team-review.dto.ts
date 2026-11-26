import { createZodDto } from 'nestjs-zod'
import { saveTeamReviewSchema } from '@bellum/contracts'

export class SaveTeamReviewDto extends createZodDto(saveTeamReviewSchema) {}
