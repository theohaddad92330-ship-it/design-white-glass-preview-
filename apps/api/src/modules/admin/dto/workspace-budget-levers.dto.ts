import { createZodDto } from 'nestjs-zod'
import { workspaceBudgetLeversSchema } from '@bellum/contracts'

/** Les cinq leviers admin (#2440.83-89) — le schéma vit dans `@bellum/contracts`
 *  (partagé avec la porte pure `checkBudgetGate`) ; ce fichier ne fait que le
 *  brancher sur la validation HTTP, comme les autres DTO du module. */
export class WorkspaceBudgetLeversDto extends createZodDto(workspaceBudgetLeversSchema) {}
