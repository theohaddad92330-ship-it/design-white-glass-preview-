import { BadRequestException, Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common'
import { profilerEventSchema, type ProfilerEvent } from '@bellum/contracts'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { ProfilerGateway } from './profiler.gateway'

@Controller('internal/profiler')
@UseGuards(InternalSecretGuard)
export class ProfilerProgressController {
  constructor(private readonly gateway: ProfilerGateway) {}

  @Post('progress')
  @HttpCode(204)
  async progress(@Body() raw: unknown): Promise<void> {
    const parsed = profilerEventSchema.safeParse(raw)
    if (!parsed.success) {
      throw new BadRequestException('Invalid profiler event payload')
    }
    const dto: ProfilerEvent = parsed.data
    if (dto.kind === 'field') {
      await this.gateway.emitField(dto.userId, dto.field, dto.label, dto.preview)
      return
    }
    switch (dto.status) {
      case 'started':
        await this.gateway.emitPhaseStarted(dto.userId, dto.phase, dto.message)
        break
      case 'complete':
        // 'done' phase is a marker — the real `profiler:done` socket event
        // fires from persistSuccess after the API has actually persisted
        // the new profile_context. Otherwise the client refetches before
        // the row is updated.
        await this.gateway.emitPhaseComplete(dto.userId, dto.phase, dto.message)
        break
      case 'error':
        await this.gateway.emitError(dto.userId, dto.message)
        break
    }
  }
}
