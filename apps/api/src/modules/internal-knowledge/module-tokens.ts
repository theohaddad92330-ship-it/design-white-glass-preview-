/**
 * #3586 — le jeton du verrou de la synchro, jamais `SingletonLockService` importé directement : GA-07
 * (`module-boundaries.spec.ts`) est un CLIQUET au plafond sur « un service importe le service d'un autre
 * module ». La composition se fait dans `internal-knowledge.module.ts` (même patron que
 * `weakest-link-diagnosis/module-tokens.ts`).
 */
export const SINGLETON_LOCK = 'INTERNAL_KNOWLEDGE_SINGLETON_LOCK'

/** « Exécute ceci une seule fois, quel que soit le nombre de replicas. » Sans verrou, exécute quand même. */
export type UnderSingletonLock = (name: string, run: () => Promise<void>) => Promise<void>
