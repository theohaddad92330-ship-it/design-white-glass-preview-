import { Body, Controller, Optional, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { DeliveryService } from '../delivery/delivery.service'

class CopilotMissionsEndedDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Missions TERMINÉES depuis N jours (période passée). */
      endedSinceDays: z.number().int().min(1).max(1500),
    })
    .strict(),
) {}

const DAY = 86_400_000

/**
 * #4065.9 — « les missions terminées ce trimestre » : la période PASSÉE. `missions/ending` ne lit que
 * l'à-venir (il sert à agir) ; celle-ci relit la MÊME liste (`DeliveryService.list`) et ne garde que les
 * fins déjà passées. `canReadFinance: false` EN DUR (aucun rôle à faire valoir sur ce pont) : ni marge,
 * ni photo — la mission, son compte, ses dates.
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotMissionsEndedController {
  constructor(
    private readonly delivery: DeliveryService,
    @Optional() private readonly clock: () => Date = () => new Date(),
  ) {}

  @Post('missions/ended')
  async ended(@Body() dto: CopilotMissionsEndedDto) {
    const { missions } = await this.delivery.list(dto.userId, { canReadFinance: false })
    const now = this.clock().getTime()
    const since = now - dto.endedSinceDays * DAY
    const rows = missions
      .flatMap(mission => {
        const end = mission.ends_on ? Date.parse(mission.ends_on) : Number.NaN
        // Fin STRICTEMENT passée : une mission qui finit aujourd'hui est encore en cours.
        if (!Number.isFinite(end) || end >= startOfDay(now) || end < since) return []
        return [
          {
            id: mission.id,
            label: mission.label,
            accountName: mission.accountName ?? null,
            starts_on: mission.started_on ?? null,
            ends_on: mission.ends_on,
          },
        ]
      })
      .sort((a, b) => Date.parse(b.ends_on ?? '') - Date.parse(a.ends_on ?? ''))
    return { missions: rows }
  }
}

function startOfDay(ms: number): number {
  return Math.floor(ms / DAY) * DAY
}
