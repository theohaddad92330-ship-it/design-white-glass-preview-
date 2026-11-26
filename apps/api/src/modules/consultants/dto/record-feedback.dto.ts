import { createZodDto } from 'nestjs-zod'
import { recordPushFeedbackSchema } from '@bellum/contracts'

/** Body de POST /consultants/:id/feedback — REX d'un push (annexe méthodo p22). */
export class RecordFeedbackDto extends createZodDto(recordPushFeedbackSchema) {}
