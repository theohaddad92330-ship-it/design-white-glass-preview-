import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { voiceMessageEraserFrom } from './voice-message-eraser'

/**
 * #1939.9 — le port d'effacement n'atteint QUE la voix.
 *
 * Le stockage a quatre façons d'effacer ou de lire des octets (`remove`,
 * `purgeExpired`, `byIds`, `eraseVoiceMessagesUploadedBy`). Trois d'entre elles
 * atteindraient un justificatif comptable ou une pièce d'affaire — des pièces
 * que la suppression d'un compte ne libère d'aucune obligation de conservation.
 * Le port n'en touche qu'une, et c'est ce test qui le dit.
 */
describe('#1939.9 — VOICE_MESSAGE_ERASER', () => {
  it('ne lit QU’UNE méthode du stockage, et lui passe la personne et le jour tels quels', async () => {
    const accessed = new Set<string>()
    const eraseVoiceMessagesUploadedBy = jest.fn().mockResolvedValue({ erased: 2, deferred: 0 })
    // Un Proxy plutôt qu'un objet : il enregistre CHAQUE propriété lue — un
    // `remove` ou un `purgeExpired` appelé en passant se verrait ici.
    const storage = new Proxy(
      { eraseVoiceMessagesUploadedBy },
      {
        get(target, property) {
          if (typeof property === 'string') accessed.add(property)
          return Reflect.get(target, property)
        },
      },
    )

    const erase = voiceMessageEraserFrom(storage)
    expect(await erase('u-1', '2026-09-13')).toEqual({ erased: 2, deferred: 0 })

    expect([...accessed]).toEqual(['eraseVoiceMessagesUploadedBy'])
    expect(eraseVoiceMessagesUploadedBy).toHaveBeenCalledWith('u-1', '2026-09-13')
  })

  it('le module BRANCHE le port sur le stockage — sinon l’effacement de compte ne résoudrait pas', () => {
    const module = readFileSync(join(__dirname, 'privacy.module.ts'), 'utf8')
    expect(module).toContain('provide: VOICE_MESSAGE_ERASER')
    expect(module).toContain('useFactory: voiceMessageEraserFrom')
    expect(module).toContain('inject: [StorageService]')
    expect(module).toContain('StorageModule,')
  })

  it('le port n’importe rien d’un autre module — il reste hors du compte de GA-07 sans le tromper', () => {
    const source = readFileSync(join(__dirname, 'voice-message-eraser.ts'), 'utf8')
    expect(source.length).toBeGreaterThan(500)
    expect(source).not.toMatch(/from '\.\.\//)
  })
})
