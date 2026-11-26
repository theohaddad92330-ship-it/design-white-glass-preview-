// #1792 — TDD : ces tests sont écrits AVANT `attachments.ts`.
//
// Le reflet client des bornes serveur (`apps/api/.../dto/feedback.dto.ts`) :
// même liste blanche, mêmes plafonds. Un fichier refusé ici serait de toute
// façon refusé par l'API — l'inverse (accepté ici, refusé côté serveur)
// romprait la promesse « refus CLAIR quand ça dépasse », d'où les tests de
// PARITÉ des constantes en fin de fichier.
import { describe, expect, it } from 'vitest'
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  ATTACHMENT_MAX_RAW_BYTES,
  ATTACHMENTS_MAX_COUNT,
  ATTACHMENTS_MAX_TOTAL_RAW_BYTES,
  filesFromDataTransfer,
  isImageAttachment,
  readFileAsAttachment,
  rejectAttachment,
} from './attachments'

/** Un `File` jsdom minimal — son contenu réel n'importe pas à ces tests. */
function makeFile(name: string, type: string, size: number): File {
  const content = new Uint8Array(size)
  return new File([content], name, { type })
}

describe('rejectAttachment', () => {
  it('accepte un fichier dans la liste blanche, sous les plafonds', () => {
    const file = makeFile('capture.png', 'image/png', 1000)
    expect(rejectAttachment(file, [])).toBeNull()
  })

  // ⚠️ Preuve que la garde sait dire NON : un type HORS liste blanche est
  // refusé, y compris un SVG (document actif) et un exécutable.
  it('refuse un type hors liste blanche (SVG, document actif)', () => {
    const file = makeFile('logo.svg', 'image/svg+xml', 500)
    expect(rejectAttachment(file, [])).toEqual({ reason: 'type', name: 'logo.svg' })
  })

  it('refuse un exécutable', () => {
    const file = makeFile('installeur.exe', 'application/x-msdownload', 500)
    expect(rejectAttachment(file, [])).toEqual({ reason: 'type', name: 'installeur.exe' })
  })

  it('refuse un fichier sans type reconnu par le navigateur', () => {
    const file = makeFile('mystere', '', 500)
    expect(rejectAttachment(file, [])).toEqual({ reason: 'type', name: 'mystere' })
  })

  it('refuse un fichier qui dépasse le plafond PAR FICHIER', () => {
    const file = makeFile('trop-gros.png', 'image/png', ATTACHMENT_MAX_RAW_BYTES + 1)
    expect(rejectAttachment(file, [])).toEqual({ reason: 'size', name: 'trop-gros.png' })
  })

  it('accepte un fichier pile au plafond', () => {
    const file = makeFile('pile.png', 'image/png', ATTACHMENT_MAX_RAW_BYTES)
    expect(rejectAttachment(file, [])).toBeNull()
  })

  it('refuse au-delà du NOMBRE maximum par signalement', () => {
    const existing = Array.from({ length: ATTACHMENTS_MAX_COUNT }, () => 1000)
    const file = makeFile('en-trop.png', 'image/png', 1000)
    expect(rejectAttachment(file, existing)).toEqual({ reason: 'count', name: 'en-trop.png' })
  })

  it('refuse quand la taille TOTALE dépasserait le plafond, même sous le plafond par fichier', () => {
    const existing = [ATTACHMENTS_MAX_TOTAL_RAW_BYTES - 100]
    const file = makeFile('petit-mais-de-trop.png', 'image/png', 200)
    expect(rejectAttachment(file, existing)).toEqual({ reason: 'total', name: 'petit-mais-de-trop.png' })
  })

  it('le type est vérifié AVANT la taille — un type refusé le reste même trop gros', () => {
    const file = makeFile('logo.svg', 'image/svg+xml', ATTACHMENT_MAX_RAW_BYTES + 1)
    expect(rejectAttachment(file, [])).toEqual({ reason: 'type', name: 'logo.svg' })
  })
})

describe('readFileAsAttachment', () => {
  it('lit le fichier en base64 BRUT, sans le préfixe data:...;base64,', async () => {
    const file = new File([new TextEncoder().encode('bonjour')], 'note.txt', { type: 'text/plain' })
    const attachment = await readFileAsAttachment(file)
    expect(attachment.name).toBe('note.txt')
    expect(attachment.mimeType).toBe('text/plain')
    expect(attachment.dataBase64).not.toContain('data:')
    expect(attachment.dataBase64).not.toContain(';base64,')
    expect(Buffer.from(attachment.dataBase64, 'base64').toString('utf8')).toBe('bonjour')
  })
})

// #1792 — même fonction pour le collage ET le glisser-déposer : les deux
// gestes portent leurs fichiers dans un `DataTransfer` identique côté
// navigateur (voir FeedbackWidget.tsx : `onPasteAttachment` et
// `onDropAttachment` appellent tous les deux `filesFromDataTransfer`, avant de
// rejoindre le même `addAttachments`).
describe('filesFromDataTransfer', () => {
  it('extrait les fichiers d’un presse-papiers ou d’un dépôt, en ignore les items texte', () => {
    const file = makeFile('collé.png', 'image/png', 10)
    const items = [
      { kind: 'file', getAsFile: () => file } as unknown as DataTransferItem,
      { kind: 'string', getAsFile: () => null } as unknown as DataTransferItem,
    ]
    const data = { items } as unknown as DataTransfer
    expect(filesFromDataTransfer(data)).toEqual([file])
  })

  it('rend un tableau vide sans presse-papiers ni dépôt', () => {
    expect(filesFromDataTransfer(null)).toEqual([])
  })
})

describe('isImageAttachment', () => {
  it('reconnaît les quatre types image de la liste blanche', () => {
    expect(isImageAttachment({ name: 'a', mimeType: 'image/png', dataBase64: '' })).toBe(true)
    expect(isImageAttachment({ name: 'a', mimeType: 'image/jpeg', dataBase64: '' })).toBe(true)
    expect(isImageAttachment({ name: 'a', mimeType: 'image/gif', dataBase64: '' })).toBe(true)
    expect(isImageAttachment({ name: 'a', mimeType: 'image/webp', dataBase64: '' })).toBe(true)
  })

  it('un PDF ou un texte ne sont pas des images', () => {
    expect(isImageAttachment({ name: 'a', mimeType: 'application/pdf', dataBase64: '' })).toBe(false)
    expect(isImageAttachment({ name: 'a', mimeType: 'text/plain', dataBase64: '' })).toBe(false)
  })
})

/**
 * `packages/contracts` est hors périmètre de ce lot (voir CLAUDE.md) : ces
 * bornes sont donc dupliquées à l'identique côté API
 * (`apps/api/src/modules/feedback/dto/feedback.dto.ts`). Ce test ne peut pas
 * lire l'autre fichier (paquets distincts), mais il FIXE les valeurs
 * attendues pour qu'un futur changement d'un seul côté casse ici plutôt que
 * de laisser diverger le refus client du refus serveur.
 */
describe('parité des bornes avec le contrat API (dupliquées, voir dto/feedback.dto.ts)', () => {
  it('mêmes nombres que le serveur', () => {
    expect(ATTACHMENT_MAX_RAW_BYTES).toBe(4_000_000)
    expect(ATTACHMENTS_MAX_COUNT).toBe(5)
    expect(ATTACHMENTS_MAX_TOTAL_RAW_BYTES).toBe(10_000_000)
    expect([...ALLOWED_ATTACHMENT_MIME_TYPES].sort()).toEqual(
      ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'].sort(),
    )
  })
})
