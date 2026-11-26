/**
 * #3718.6 — le verrou de tick du balayage des réponses, fourni par
 * `mailbox.module.ts` sous forme de JETON (même patron que
 * `business-metrics/module-tokens.ts`) : GA-07 interdit à un service d'importer
 * le service d'un autre module, et le balayeur n'a pas besoin du service de
 * verrous — il a besoin de « ne tourne qu'une fois ».
 */
export const MAILBOX_SINGLETON_LOCK = 'MAILBOX_SINGLETON_LOCK'

export type MailboxUnderSingletonLock = (name: string, run: () => Promise<void>) => Promise<void>
