import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// #3400 — le corps de la lecture d'opérateur « pourquoi cet enrichissement serait-il refusé ? ».
// UN utilisateur nommé (son espace actif décide du pool lu), `.strict()` : aucun champ de plus.
const enrichmentDiagnosticSchema = z.object({ userId: z.string().guid() }).strict()

export class EnrichmentDiagnosticDto extends createZodDto(enrichmentDiagnosticSchema) {}
