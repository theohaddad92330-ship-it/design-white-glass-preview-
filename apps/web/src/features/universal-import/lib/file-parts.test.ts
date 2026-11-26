import { describe, expect, it } from 'vitest'
import { bytesToBase64, partCountOf, readPartB64 } from './file-parts'

describe('upload fractionné', () => {
  it('aucun plafond : un fichier de 1 Go se découpe, il n’est pas refusé', () => {
    expect(partCountOf(1024 ** 3, 4 * 1024 ** 2)).toBe(256)
    expect(partCountOf(0)).toBe(1)
  })

  it('les parts recollées rendent EXACTEMENT le fichier — coupure au milieu d’un caractère comprise', async () => {
    const text = 'Nom;Prénom\nHélène;Zoé\n'
    const file = new Blob([text])
    const parts = partCountOf(file.size, 5)
    let joined = ''
    for (let index = 0; index < parts; index += 1) joined += atob(await readPartB64(file, index, 5))
    const bytes = Uint8Array.from(joined, char => char.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toBe(text)
  })

  it('encode un grand tampon sans dépasser la pile', () => {
    expect(bytesToBase64(new Uint8Array(200_000)).length).toBeGreaterThan(0)
  })
})
