import { ForbiddenException } from '@nestjs/common'

/**
 * Épopée #2879 (#2442.14) — un membre authentifié a tenté un geste que son
 * rôle ne permet pas. Même statut et même message qu'avant (403), mais le
 * type porte la distinction que `GlobalExceptionFilter` lit pour compter une
 * tentative d'escalade à part d'un simple accès refusé.
 */
export class InsufficientRoleException extends ForbiddenException {
  constructor() {
    super('Rôle insuffisant pour cette action')
  }
}
