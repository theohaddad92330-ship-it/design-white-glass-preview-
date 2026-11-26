import { createZodDto } from 'nestjs-zod'
import { cvCommitSchema } from '@bellum/contracts'

/** Ce qu'un humain a décidé, champ par champ, à l'écran de revue (§4.2). */
export class CvCommitDto extends createZodDto(cvCommitSchema) {}
