import { Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { AccountClaimBus, type AccountClaimedEvent } from './account-claim.bus'
import { DiscoverCandidateNotesService } from './discover-candidate-notes.service'

/**
 * Écoute « un candidat Découvrir vient de devenir un compte » et retague les
 * notes déjà écrites sur ce SIREN. Seul appelant, en production, de
 * `AccountClaimBus` côté écoute — `AccountsService` ne connaît plus
 * `DiscoverCandidateNotesService` (GA-07).
 *
 * Best-effort à l'écoute : `claimForAccount` attrape déjà ses propres erreurs
 * (voir son docblock) et ne les laisse jamais remonter — un incident sur la
 * reprise des notes ne doit jamais faire échouer la création du compte, dont
 * le geste a déjà réussi au moment où ce handler tourne.
 */
@Injectable()
export class AccountClaimListener implements OnModuleInit {
  private readonly logger = new Logger(AccountClaimListener.name)

  constructor(
    private readonly bus: AccountClaimBus,
    private readonly notes: DiscoverCandidateNotesService,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe(this.handle)
  }

  private handle = async (event: AccountClaimedEvent): Promise<void> => {
    try {
      await this.notes.claimForAccount(event.workspaceId, event.siren, event.accountId)
    } catch (cause) {
      this.logger.warn('discover candidate notes claim failed', {
        error: cause,
        tags: { accountId: event.accountId },
      })
    }
  }
}
