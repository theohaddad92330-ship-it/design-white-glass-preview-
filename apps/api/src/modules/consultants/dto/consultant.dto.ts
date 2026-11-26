import { createZodDto } from 'nestjs-zod'
import {
  consultantUpsertSchema,
  recordConsultantFieldReportSchema,
  recordTalentInterviewTraitSchema,
  recordTalentRampUpSchema,
  setConsultantOwnerSchema,
} from '@bellum/contracts'

/** Body de POST /consultants et PUT /consultants/:id — le vivier p22. */
export class ConsultantUpsertDto extends createZodDto(consultantUpsertSchema) {}

/** #2185.10 — Body de PATCH /consultants/:id/owner. */
export class SetConsultantOwnerDto extends createZodDto(setConsultantOwnerSchema) {}

/** BEL-SC-238 (#3267) — Body de POST /consultants/:id/interview-traits. */
export class RecordInterviewTraitDto extends createZodDto(recordTalentInterviewTraitSchema) {}

/** BEL-SC-238 (#3267) — Body de POST /consultants/:id/ramp-up. */
export class RecordRampUpDto extends createZodDto(recordTalentRampUpSchema) {}

/** #3406 — Body de POST /consultants/:id/field-reports. */
export class RecordFieldReportDto extends createZodDto(recordConsultantFieldReportSchema) {}
