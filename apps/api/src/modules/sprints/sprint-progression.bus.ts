import { Injectable } from '@nestjs/common'
import type { SprintEvent } from '@bellum/contracts'

/**
 * La charge utile du canal « l'issue d'un contact a été enregistrée » —
 * l'espace, le compte, l'événement de sprint qu'elle produit, et la
 * référence de cause qui porte l'idempotence côté `SprintsService`.
 */
export interface ContactOutcomeRecordedEvent {
  workspaceId: string
  accountId: string
  event: SprintEvent
  sourceRef: string
}

type Handler = (event: ContactOutcomeRecordedEvent) => Promise<void>

/**
 * GA-07 (§3.2) : `ContactsService` important `SprintsService` a fait passer
 * le cliquet de 239 à 240. La garde elle-même nomme la sortie — un contrat
 * partagé, un événement, ou le contrôleur (hors jeu ici : `updateStatus` est
 * un geste utilisateur unique, pas une orchestration à deux domaines
 * demandée depuis la route).
 *
 * `@nestjs/event-emitter` est documenté « global » par
 * `controller-services-exported.spec.ts` (GA-42), mais n'est en réalité
 * installé NULLE PART dans ce dépôt (aucune entrée dans `package.json`,
 * aucun `EventEmitterModule.forRoot()`, aucun `@OnEvent` — vérifié avant
 * d'écrire ce fichier). Le seul bus RÉELLEMENT câblé
 * (`apps/api/src/modules/outbox/event-bus.token.ts`, Redis Streams) est fait
 * pour un usage différent : durable, inter-PROCESSUS, au moins une fois — son
 * schéma vit dans `packages/events`, hors du périmètre de ce correctif, et son
 * relais tourne dans une boucle `XREADGROUP` séparée du geste utilisateur.
 * Ni l'un ni l'autre ne peut être suivi sans toucher un fichier hors
 * périmètre (`package.json`, `app.module.ts`, `packages/events`).
 *
 * Ce bus est donc volontairement minimal — un canal, en mémoire, dans le
 * module qui ÉCOUTE (`sprints`), suivant le même contrat que `emitAsync` :
 * `emit` attend ses écouteurs, pour que `ContactsService.updateStatus` réponde
 * seulement APRÈS que la bascule (ou son best-effort) a eu lieu. Il ne prétend
 * pas remplacer l'un des deux mécanismes ci-dessus pour un usage plus large.
 */
@Injectable()
export class SprintProgressionBus {
  private readonly handlers: Handler[] = []

  /** Un seul abonné en production (`SprintProgressionListener`) ; plusieurs
   *  sont supportés pour ne pas figer cette hypothèse dans la forme du bus. */
  subscribe(handler: Handler): void {
    this.handlers.push(handler)
  }

  /** Attend TOUS les écouteurs — comme `EventEmitter2.emitAsync`. Chaque
   *  écouteur attrape déjà ses propres erreurs (voir `SprintProgressionListener`) ;
   *  cette méthode ne les avale pas une seconde fois, elle les laisse
   *  remonter si un écouteur a un défaut — c'est à L'ÉMETTEUR de rester
   *  best-effort en s'enveloppant lui-même (comme `ContactsService` le fait
   *  déjà pour l'auto-pause des séquences, au même endroit). */
  async emit(event: ContactOutcomeRecordedEvent): Promise<void> {
    await Promise.all(this.handlers.map(handler => handler(event)))
  }
}
