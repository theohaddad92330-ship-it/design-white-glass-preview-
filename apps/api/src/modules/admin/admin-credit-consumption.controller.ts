import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AdminCreditConsumptionService } from './admin-credit-consumption.service'
import type { ConsumptionReport } from './credit-consumption'

/**
 * #4467 — `GET internal/admin/credit-consumption`, pour `/revenus/consommation`
 * du back-office. Lecture seule, derrière le secret interne comme le reste de
 * `internal/admin`. Chemin LITTÉRAL : aucun `:id` voisin ne peut l'avaler.
 *
 * L'horloge est lue ICI (le service la reçoit), comme `client-health`.
 */
@Controller('internal/admin')
@UseGuards(InternalSecretGuard)
export class AdminCreditConsumptionController {
  constructor(private readonly consumption: AdminCreditConsumptionService) {}

  @Get('credit-consumption')
  report(@Query('search') search?: string, @Query('days') days?: string): Promise<ConsumptionReport> {
    return this.consumption.report({
      search: search?.trim() || undefined,
      days: days === undefined || days.trim() === '' ? undefined : Number(days),
      now: new Date(),
    })
  }
}
