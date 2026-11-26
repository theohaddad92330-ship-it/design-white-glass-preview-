import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import { ChatMessageEntity, type ChatMessageRole } from '../../database/entities/chat-message.entity'

type ChatTurnReplayMessage = {
  id: string
  role: ChatMessageRole
  content: string
  createdAt: string
  context: unknown
  attachments: { id: string; name: string }[] | null
}

/**
 * #2905 (#2442.16) — REPLAY EN LECTURE SEULE d'un tour de Laura : ce que le
 * tour a effectivement porté (message, contexte re-rendu, pièces jointes),
 * sans jamais relancer le modèle ni un outil. « Outils d'écriture
 * neutralisés, aucun crédit débité, aucun message sortant » est vrai ici par
 * CONSTRUCTION : la route ne fait qu'une LECTURE de `chat_messages`,
 * cross-tenant, derrière `InternalSecretGuard` — même porte que
 * `InternalTelemetryController`.
 *
 * ⚠️ Ce n'est PAS un rejeu du PIPELINE (relancer le modèle et ses outils
 * contre des résultats enregistrés en sandbox, tel que décrit par #2442 —
 * « RUN REPLAY ») : aucune trace d'entrée/sortie d'outil n'est aujourd'hui
 * persistée hors Langfuse (`apps/ia/app/services/turn_trace.py`), et Langfuse
 * n'est pas interrogeable depuis ce process. Reconstruire CE rejeu-là suppose
 * soit d'intégrer l'API Langfuse, soit d'enregistrer nous-mêmes chaque appel
 * outil pour rejeu — un chantier distinct, plus large que ce qu'un lot de
 * nuit peut prouver avec des tests ciblés. Cette route couvre le NO-GO nommé
 * par #2442 pour le support (« l'équipe doit accéder manuellement au compte
 * du client... sans audit ») : elle remplace un accès manuel non tracé par un
 * accès journalisé (voir l'appelant back-office, qui appelle
 * `journaliserAccesDepuisComposant` — même précédent que #2442.19).
 */
@Controller('internal/chat-turn')
@UseGuards(InternalSecretGuard)
export class InternalChatTurnController {
  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly messages: Repository<ChatMessageEntity>,
  ) {}

  @Get(':turnId')
  async replay(@Param('turnId') turnId: string): Promise<ChatTurnReplayMessage[]> {
    const rows = await this.messages.find({ where: { turn_id: turnId }, order: { created_at: 'ASC' } })
    if (rows.length === 0) {
      throw new NotFoundException(`Chat turn ${turnId} not found`)
    }
    return rows.map(row => ({
      id: row.id,
      role: row.role,
      content: row.content,
      createdAt: row.created_at.toISOString(),
      context: row.context,
      attachments: row.attachments,
    }))
  }
}
