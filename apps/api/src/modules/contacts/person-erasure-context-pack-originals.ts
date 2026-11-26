/**
 * #4573 — LE PORT D'EFFACEMENT DES ORIGINAUX DE PACK.
 *
 * Un original d'import de pack suit le sort de la donnée qu'il a servi à créer : l'effacement d'une personne à sa
 * demande (c67, #2297) l'emporte. Même raison que les ports de `privacy` (`image-attachment-eraser.ts`) :
 * `PersonErasureService` n'importe pas le service d'un autre module (GA-07). Il DÉCLARE ce dont il a besoin, et
 * `contacts.module.ts` le branche sur `ContextPackOriginalsService` (module `context-pack-originals.module.ts`).
 */

/** Le jeton d'injection du port. */
export const CONTEXT_PACK_ORIGINAL_ERASER = Symbol('CONTEXT_PACK_ORIGINAL_ERASER')

/** Efface les originaux de pack d'UN espace. `deferred` : refusés par le seau, retrouvés au prochain effacement. */
export type ContextPackOriginalEraser = (workspaceId: string) => Promise<{ erased: number; deferred: number }>
