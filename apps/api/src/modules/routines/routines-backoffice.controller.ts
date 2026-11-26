import { BadRequestException, Body, Controller, Get, HttpCode, Put, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { type RoutineBackofficeRuns, RoutinesService } from './routines.service'

/**
 * #2843.19/.21/.24 (lot L13) — le coût d'exécution d'une routine, côté
 * BACK-OFFICE SEUL (arbitrage Louis 31/10/2026, c132 crédits implicites) :
 * tentatives, durée, échecs par routine. Aucune de ces valeurs ne sort par
 * `routines.controller.ts` (garde : `routines-retry.spec.ts`).
 *
 * `InternalSecretGuard` (en-tête secret, aucun JWT utilisateur) : la console
 * d'opération l'appelle, jamais l'application. La lecture est bornée à UN
 * utilisateur à la fois — rien n'est agrégé entre comptes ni entre espaces
 * (GA-43).
 */
@Controller('internal/admin/routines')
@UseGuards(InternalSecretGuard)
export class RoutinesBackofficeController {
  constructor(private readonly routines: RoutinesService) {}

  @Get('runs')
  runs(@Query('userId') userId?: string): Promise<RoutineBackofficeRuns> {
    if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) throw new BadRequestException('userId (uuid) requis.')
    return this.routines.backofficeRuns(userId)
  }

  /**
   * #2843.19 — le plafond de coût d'UNE routine pour UN utilisateur (`null` l'efface).
   * Même garde que la lecture : un utilisateur d'espace est refusé (403).
   */
  @Put('caps')
  @HttpCode(200)
  async setCap(@Body() body: { userId?: unknown; routineKey?: unknown; capUsd?: unknown }): Promise<{ ok: true }> {
    const { userId, routineKey, capUsd } = body ?? {}
    if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) {
      throw new BadRequestException('userId (uuid) requis.')
    }
    if (typeof routineKey !== 'string') throw new BadRequestException('routineKey requis.')
    if (capUsd !== null && typeof capUsd !== 'number') throw new BadRequestException('capUsd (nombre ou null) requis.')
    await this.routines.setBudgetCap(userId, routineKey, capUsd)
    return { ok: true }
  }
}
