import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

/** #3904.3 — body of POST internal/copilot/sources/connections. */
export class CopilotSourceConnectionsDto extends createZodDto(z.object({ userId: z.string().guid() }).strict()) {}
