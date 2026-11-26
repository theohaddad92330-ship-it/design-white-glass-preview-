/**
 * #2876 (#2433.4) — LE PORT D'EFFACEMENT DES IMAGES DE CHAT.
 *
 * Même raison que {@link VOICE_MESSAGE_ERASER} (`voice-message-eraser.ts`,
 * #1939.9) : `PrivacyDeletionService` doit effacer TOUT DE SUITE les images
 * jointes au chat d'une personne, sans importer `StorageService` (GA-07,
 * `module-boundaries.spec.ts`). Le service DÉCLARE ce dont il a besoin, et le
 * module de composition (`privacy.module.ts`) le branche sur le stockage.
 */

/** Le jeton d'injection du port. */
export const IMAGE_ATTACHMENT_ERASER = Symbol('IMAGE_ATTACHMENT_ERASER')

/** Efface les images de chat d'une personne. `deferred` : reprises par la purge de la nuit. */
export type ImageAttachmentEraser = (userId: string, today: string) => Promise<{ erased: number; deferred: number }>

/** Ce que le port exige de sa source — une seule méthode, bornée au domaine image de chat. */
type ImageAttachmentEraserSource = {
  eraseChatImageAttachmentsUploadedBy(userId: string, today: string): Promise<{ erased: number; deferred: number }>
}

/**
 * Le branchement. N'appelle QU'UNE méthode de la source — jamais `remove`,
 * `purgeExpired` ni `byIds`, qui atteindraient les pièces de l'entreprise.
 */
export function imageAttachmentEraserFrom(source: ImageAttachmentEraserSource): ImageAttachmentEraser {
  return (userId, today) => source.eraseChatImageAttachmentsUploadedBy(userId, today)
}
