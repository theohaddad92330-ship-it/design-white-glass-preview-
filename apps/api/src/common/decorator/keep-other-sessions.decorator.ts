import { SetMetadata } from '@nestjs/common'

export const KEEP_OTHER_SESSIONS_KEY = 'bellum:keep-other-sessions'

/**
 * #4608 — la session émise par cette route ne purge PAS les autres identités du
 * navigateur. Réservé à la salle de démonstration : on l'ouvre en réunion depuis
 * le navigateur où l'on est déjà connecté, et elle ne doit jamais coûter sa
 * session réelle. Toute autre connexion garde « un navigateur = UNE identité ».
 */
export const KeepOtherSessions = (): MethodDecorator => SetMetadata(KEEP_OTHER_SESSIONS_KEY, true)
