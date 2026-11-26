import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { SprintProgressionBus, type ContactOutcomeRecordedEvent } from './sprint-progression.bus'
import { SprintsService } from './sprints.service'

/**
 * Écoute « l'issue d'un contact a été enregistrée » et applique la bascule de
 * sprint correspondante. Seul appelant, en production, de
 * `SprintProgressionBus` côté écoute — `ContactsService` ne connaît plus
 * `SprintsService` (GA-07).
 *
 * Best-effort À L'ÉCOUTE, comme demandé : le geste de l'utilisateur qui a
 * émis l'événement a déjà réussi (le statut du contact et sa trace au journal
 * sont persistés) au moment où ce handler tourne. Une bascule ratée reste
 * donc une PROPOSITION manquée, jamais un échec remonté à l'émetteur.
 */
@Injectable()
export class SprintProgressionListener implements OnModuleInit {
  private readonly logger = new Logger(SprintProgressionListener.name)

  constructor(
    private readonly bus: SprintProgressionBus,
    private readonly sprints: SprintsService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe(this.handle)
  }

  private handle = async (event: ContactOutcomeRecordedEvent): Promise<void> => {
    try {
      await this.sprints.applyEvent(event.workspaceId, event.accountId, event.event, event.sourceRef)
    } catch (cause) {
      this.logger.warn('sprint switch failed', {
        error: cause,
        tags: { accountId: event.accountId, sprintEvent: event.event },
      })
    }
  }
}
