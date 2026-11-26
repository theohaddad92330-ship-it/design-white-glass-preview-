// #1792 — pièces jointes d'un signalement : collées (Ctrl/Cmd+V), glissées-
// déposées sur le panneau, ou choisies via un `<input type="file">`.
//
// ─────────────────────────────────────────────────────────────────────────
// POURQUOI CES BORNES SONT DUPLIQUÉES ICI
// ─────────────────────────────────────────────────────────────────────────
// L'autorité est côté serveur (`apps/api/src/modules/feedback/dto/feedback.dto.ts`)
// — c'est LUI qui refuse, jamais ce fichier. `packages/contracts` est hors
// périmètre de ce lot (voir CLAUDE.md), donc ce reflet n'a pas d'autre
// endroit où vivre : un futur changement de borne doit toucher LES DEUX
// fichiers, et `attachments.test.ts` fixe les valeurs pour que l'oubli
// d'un côté casse un test plutôt que de laisser diverger le refus client
// du refus serveur.
//
// L'extension écrite sur le disque n'est JAMAIS décidée ici : le serveur relit
// la signature octets du contenu déposé (`github-issue.service.ts`). Ce
// fichier ne fait qu'éviter un aller-retour réseau pour dire ce qu'on peut
// déjà dire — jamais l'inverse.

export type FeedbackAttachment = {
  name: string
  mimeType: string
  /** Base64 BRUT, sans le préfixe `data:...;base64,`. */
  dataBase64: string
}

/** Même repère que le champ `screenshot` existant (4 Mo), par fichier. */
export const ATTACHMENT_MAX_RAW_BYTES = 4_000_000
/** Pièces jointes par signalement. */
export const ATTACHMENTS_MAX_COUNT = 5
/** Volontairement < `ATTACHMENTS_MAX_COUNT × ATTACHMENT_MAX_RAW_BYTES` — voir dto/feedback.dto.ts. */
export const ATTACHMENTS_MAX_TOTAL_RAW_BYTES = 10_000_000

/**
 * LISTE BLANCHE — jamais liste noire. Images, PDF, texte brut. Aucun
 * exécutable, aucun HTML, aucun SVG : un SVG est un document actif, il porte
 * du script. Reflet exact de `ALLOWED_ATTACHMENT_MIME_TYPES` côté API.
 */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
] as const
const IMAGE_MIME_TYPES = new Set<string>(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export type AttachmentRejection = {
  reason: 'type' | 'size' | 'count' | 'total'
  name: string
}

function isAllowedAttachmentType(type: string): boolean {
  return (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(type)
}

/**
 * Valide un fichier CÔTÉ CLIENT, en miroir du refus serveur : le même fichier
 * envoyé quand même serait refusé par l'API avec le même motif. `existingSizes`
 * porte les tailles (en octets) des pièces déjà acceptées dans CE
 * signalement — nécessaire pour juger `count` et `total`, qui dépendent de ce
 * qui est déjà là.
 *
 * `null` = accepté. Jamais un échec silencieux : chaque refus porte un motif
 * et le nom du fichier concerné, pour un message clair côté écran.
 */
export function rejectAttachment(file: File, existingSizes: readonly number[]): AttachmentRejection | null {
  if (!isAllowedAttachmentType(file.type)) return { reason: 'type', name: file.name }
  if (file.size > ATTACHMENT_MAX_RAW_BYTES) return { reason: 'size', name: file.name }
  if (existingSizes.length >= ATTACHMENTS_MAX_COUNT) return { reason: 'count', name: file.name }
  const total = existingSizes.reduce((sum, size) => sum + size, 0) + file.size
  if (total > ATTACHMENTS_MAX_TOTAL_RAW_BYTES) return { reason: 'total', name: file.name }
  return null
}

/** Lit le fichier en base64 BRUT (sans le préfixe `data:...;base64,`). */
export function readFileAsAttachment(file: File): Promise<FeedbackAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const dataBase64 = result.slice(result.indexOf(',') + 1)
      resolve({ name: file.name, mimeType: file.type, dataBase64 })
    }
    reader.readAsDataURL(file)
  })
}

// #1792 — GÉNÉRIQUE À DESSEIN : le collage (Ctrl/Cmd+V) et le glisser-déposer
// portent tous les deux leurs fichiers dans un `DataTransfer` — c'est la même
// forme côté navigateur pour les deux gestes. Une seule fonction d'extraction
// pour les deux évite que l'un des trois chemins (coller / glisser-déposer /
// choisir) diverge silencieusement de l'autre : `FeedbackWidget.tsx` l'appelle
// depuis `onPasteAttachment` ET depuis `onDropAttachment`, avant de rejoindre
// le MÊME `addAttachments`. Les items texte sont ignorés dans les deux cas.
export function filesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return []
  return Array.from(data.items)
    .filter(item => item.kind === 'file')
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null)
}

/** Une image s'affiche en aperçu et s'EMBED dans l'issue ; un PDF/texte se lie. */
export function isImageAttachment(attachment: FeedbackAttachment): boolean {
  return IMAGE_MIME_TYPES.has(attachment.mimeType)
}
