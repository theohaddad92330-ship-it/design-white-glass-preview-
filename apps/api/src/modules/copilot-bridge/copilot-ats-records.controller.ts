import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AtsService } from '../ats/ats.service'

class CopilotAtsRecordsDto extends createZodDto(
  z
    .object({
      userId: z.string().guid(),
      /** Fenêtre des missions qui se terminent, en jours (défaut : celui de l'instantané). */
      endingWithinDays: z.number().int().min(1).max(400).optional(),
      /** #4065.9 — missions TERMINÉES depuis N jours. */
      endedSinceDays: z.number().int().min(1).max(1500).optional(),
      /** #4065.9 — candidats vus en entretien depuis N jours. */
      interviewedSinceDays: z.number().int().min(1).max(1500).optional(),
    })
    .strict(),
) {}

/**
 * #4065 — « liste-moi… » depuis l'ATS branché : les missions qui se terminent, les consultants sans
 * mission, les besoins ouverts. AUCUNE lecture neuve : c'est l'instantané que la routine hebdo du
 * business manager lit déjà (`AtsService.snapshot`), avec la configuration de CET utilisateur.
 *
 * Ce qui ne sort pas : le nom de l'éditeur (`status.provider`) et le taux journalier — Laura n'a
 * aucun rôle financier à faire valoir (même règle que `talents/search`, `finance: false`).
 */
@Controller('internal/copilot')
@UseGuards(InternalSecretGuard)
export class CopilotAtsRecordsController {
  constructor(private readonly ats: AtsService) {}

  @Post('ats/records')
  async records(@Body() dto: CopilotAtsRecordsDto) {
    const snapshot = await this.ats.snapshot(dto.userId, {
      ...(dto.endingWithinDays ? { endingWithinDays: dto.endingWithinDays } : {}),
      ...(dto.endedSinceDays ? { endedSinceDays: dto.endedSinceDays } : {}),
      ...(dto.interviewedSinceDays ? { interviewedSinceDays: dto.interviewedSinceDays } : {}),
    })
    return {
      connected: snapshot.status.connected,
      endingMissions: snapshot.endingMissions,
      // #4065.9 — les listings PASSÉS : présents seulement quand la fenêtre passée est demandée.
      ...(snapshot.endedMissions ? { endedMissions: snapshot.endedMissions } : {}),
      ...(snapshot.interviewedCandidates
        ? { interviewedCandidates: snapshot.interviewedCandidates, candidatesRead: snapshot.candidatesRead === true }
        : {}),
      benchedConsultants: snapshot.benchedConsultants.map(({ dailyRate: _dailyRate, ...consultant }) => consultant),
      openNeeds: snapshot.openNeeds,
    }
  }
}
