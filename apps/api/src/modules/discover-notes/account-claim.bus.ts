import { Injectable } from '@nestjs/common'

/**
 * La charge utile du canal « un candidat Découvrir vient de devenir un compte
 * de l'espace » — le SIREN qui identifiait le candidat (peut être `null`, un
 * candidat sans SIREN n'a jamais de note à reprendre) et l'`accountId` créé.
 */
export interface AccountClaimedEvent {
  workspaceId: string
  siren: string | null
  accountId: string
}

type Handler = (event: AccountClaimedEvent) => Promise<void>

/**
 * GA-07 (§3.2) : `AccountsService` important `DiscoverCandidateNotesService`
 * pour la reprise à la conversion (#2151.59) a fait passer le cliquet de 261
 * à 264, sur un fichier neuf en plus. Même issue que
 * `sprints/sprint-progression.bus.ts` (m18, `ContactsService`→`SprintsService`) :
 * un canal minimal, en mémoire, possédé par le module qui ÉCOUTE
 * (`discover-notes`) — `AccountsService` ne connaît plus
 * `DiscoverCandidateNotesService`.
 *
 * `emit` attend ses écouteurs (comme `emitAsync`), pour que `create` et
 * `addToPortfolio` retournent APRÈS la reprise (ou son best-effort) — la même
 * garantie que la version directe offrait. Best-effort côté ÉCOUTE
 * (`AccountClaimListener` attrape ses propres erreurs) : un incident sur la
 * reprise des notes ne doit jamais faire échouer la création du compte.
 */
@Injectable()
export class AccountClaimBus {
  private readonly handlers: Handler[] = []

  /** Un seul abonné en production (`AccountClaimListener`) ; plusieurs sont
   *  supportés pour ne pas figer cette hypothèse dans la forme du bus. */
  subscribe(handler: Handler): void {
    this.handlers.push(handler)
  }

  async emit(event: AccountClaimedEvent): Promise<void> {
    await Promise.all(this.handlers.map(handler => handler(event)))
  }
}
