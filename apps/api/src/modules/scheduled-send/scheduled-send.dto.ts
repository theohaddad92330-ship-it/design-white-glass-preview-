import { rescheduleMessageSendRequestSchema, scheduleMessageSendRequestSchema } from '@bellum/contracts'
import { createZodDto } from 'nestjs-zod'

// Théo M2 — envoi programmé — corps validés par le contrat partagé, jamais un espace ni un utilisateur.
export class ScheduleMessageSendDto extends createZodDto(scheduleMessageSendRequestSchema) {}
export class RescheduleMessageSendDto extends createZodDto(rescheduleMessageSendRequestSchema) {}
