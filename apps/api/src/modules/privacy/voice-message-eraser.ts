/**
 * #1939.9 — LE PORT D'EFFACEMENT DES ENREGISTREMENTS VOCAUX.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN PORT, ET PAS `StorageService` INJECTÉ DANS L'EFFACEMENT DE COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `PrivacyDeletionService` doit effacer TOUT DE SUITE la voix d'une personne
 * (décision Louis du 12/09), au point exact où il anonymise ses messages — après
 * ses gardes (confirmation, salle de démonstration), avant la révocation des
 * sessions. Importer `StorageService` depuis ce service aurait ajouté un import
 * service → service d'un autre module : GA-07 (`module-boundaries.spec.ts`) le
 * refuse, son plafond ne se relève que sur un arbitrage écrit, et la règle qu'il
 * tient (§3.2) est précisément « aucun service n'importe le service d'un voisin ».
 *
 * Le service DÉCLARE donc ce dont il a besoin — une fonction « efface la voix de
 * cette personne à cette date » — et le MODULE (`privacy.module.ts`, la couche de
 * composition) la branche sur le stockage. Le service ne connaît ni le stockage,
 * ni un chemin, ni un domaine : il ne peut rien effacer d'autre, par construction.
 *
 * ⚠️ Le type de la source est STRUCTUREL, et ce fichier n'importe rien d'un
 * autre module : c'est ce qui le garde hors du compte de GA-07 sans le tromper.
 */

/** Le jeton d'injection du port. */
export const VOICE_MESSAGE_ERASER = Symbol('VOICE_MESSAGE_ERASER')

/** Efface les enregistrements vocaux d'une personne. `deferred` : repris par la purge de la nuit. */
export type VoiceMessageEraser = (userId: string, today: string) => Promise<{ erased: number; deferred: number }>

/** Ce que le port exige de sa source — une seule méthode, bornée au domaine vocal. */
type VoiceMessageEraserSource = {
  eraseVoiceMessagesUploadedBy(userId: string, today: string): Promise<{ erased: number; deferred: number }>
}

/**
 * Le branchement. N'appelle QU'UNE méthode de la source — jamais `remove`,
 * `purgeExpired` ni `byIds`, qui atteindraient les pièces de l'entreprise
 * (`voice-message-eraser.spec.ts`).
 */
export function voiceMessageEraserFrom(source: VoiceMessageEraserSource): VoiceMessageEraser {
  return (userId, today) => source.eraseVoiceMessagesUploadedBy(userId, today)
}
