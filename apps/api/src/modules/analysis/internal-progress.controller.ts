import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { AnalysisGateway } from './analysis.gateway'
import { AnalysisProgressDto } from './dto/analysis-progress.dto'

@Controller('internal/analysis')
@UseGuards(InternalSecretGuard)
export class InternalProgressController {
  constructor(private readonly gateway: AnalysisGateway) {}

  @Post('progress')
  @HttpCode(204)
  progress(@Body() dto: AnalysisProgressDto): void {
    this.gateway.emitPhaseProgress(dto.accountId, dto.jobId, dto.phase, dto.step, dto.percent, dto.message)
  }
}
