import { describe, expect, it } from 'vitest'
import { fileToBase64 } from './fileToBase64'

/**
 * #2569.1 — l'archive ZIP voyage en base64 vers `POST /talents/intake/zip`,
 * exactement comme un CV unitaire vers `POST /talents/intake` (`CvDropZone`).
 * Le lecteur du navigateur préfixe toujours `data:<mime>;base64,` — ce
 * préfixe ne doit jamais atteindre le serveur, qui décode le champ tel quel.
 */
describe('fileToBase64', () => {
  it('rend le contenu SANS le préfixe data: URL', async () => {
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' })
    const result = await fileToBase64(file)
    expect(result).not.toMatch(/^data:/)
    expect(result).toBe(Buffer.from('hello').toString('base64'))
  })
})
