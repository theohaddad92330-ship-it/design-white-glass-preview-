import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { ChatEvalSamplingService, type ReplaySample } from './chat-eval-sampling.service'

/**
 * #2899 / #2443.10 — LE LECTEUR du corpus « erreurs production anonymisées ». Le service IA
 * (`apps/ia/app/eval/chat_prod_samples.py`) relit ici ce que les espaces qui ont COCHÉ ont versé,
 * déjà anonymisé. Secret interne seul ; la réponse ne porte ni espace, ni identifiant, ni personne.
 */
@Controller('internal/chat-eval-samples')
@UseGuards(InternalSecretGuard)
export class InternalChatEvalSamplesController {
  constructor(private readonly sampling: ChatEvalSamplingService) {}

  @Get()
  async list(@Query('limit') limit?: string): Promise<{ samples: ReplaySample[] }> {
    const parsed = limit === undefined ? undefined : Number.parseInt(limit, 10)
    return { samples: await this.sampling.listForReplay(parsed) }
  }
}
