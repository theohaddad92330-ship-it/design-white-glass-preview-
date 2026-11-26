import { createZodDto } from 'nestjs-zod'
import {
  externalSourcingPartnerBriefFeedbackSchema,
  externalSourcingPartnerBriefPrepareSchema,
} from '@bellum/contracts'

/** `partnerName` est un texte LIBRE — voir le docblock de `external-sourcing.ts`. */
export class ExternalSourcingPartnerBriefPrepareDto extends createZodDto(externalSourcingPartnerBriefPrepareSchema) {}

/** Un retour vide est refusé AVANT d'atteindre le service. */
export class ExternalSourcingPartnerBriefFeedbackDto extends createZodDto(externalSourcingPartnerBriefFeedbackSchema) {}
