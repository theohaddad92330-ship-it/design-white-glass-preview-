import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { imageAttachmentEraserFrom } from './image-attachment-eraser'

/**
 * #2876 (#2433.4) — le port d'effacement n'atteint QUE les images de chat.
 *
 * Même garde que `voice-message-eraser.spec.ts` (#1939.9), pour la même
 * raison : le stockage a plusieurs façons d'effacer ou de lire des octets,
 * et ce port n'en touche qu'une.
 */
describe('#2876 (#2433.4) — IMAGE_ATTACHMENT_ERASER', () => {
  it('ne lit QU’UNE méthode du stockage, et lui passe la personne et le jour tels quels', async () => {
    const accessed = new Set<string>()
    const eraseChatImageAttachmentsUploadedBy = jest.fn().mockResolvedValue({ erased: 2, deferred: 0 })
    const storage = new Proxy(
      { eraseChatImageAttachmentsUploadedBy },
      {
        get(target, property) {
          if (typeof property === 'string') accessed.add(property)
          return Reflect.get(target, property)
        },
      },
    )

    const erase = imageAttachmentEraserFrom(storage)
    expect(await erase('u-1', '2026-09-28')).toEqual({ erased: 2, deferred: 0 })

    expect([...accessed]).toEqual(['eraseChatImageAttachmentsUploadedBy'])
    expect(eraseChatImageAttachmentsUploadedBy).toHaveBeenCalledWith('u-1', '2026-09-28')
  })

  it('le module BRANCHE le port sur le stockage — sinon l’effacement de compte ne résoudrait pas', () => {
    const module = readFileSync(join(__dirname, 'privacy.module.ts'), 'utf8')
    expect(module).toContain('provide: IMAGE_ATTACHMENT_ERASER')
    expect(module).toContain('useFactory: imageAttachmentEraserFrom')
    expect(module).toContain('inject: [StorageService]')
    expect(module).toContain('StorageModule,')
  })

  it('le port n’importe rien d’un autre module — il reste hors du compte de GA-07 sans le tromper', () => {
    const source = readFileSync(join(__dirname, 'image-attachment-eraser.ts'), 'utf8')
    expect(source.length).toBeGreaterThan(500)
    expect(source).not.toMatch(/from '\.\.\//)
  })
})
