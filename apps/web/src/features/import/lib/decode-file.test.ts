import { describe, expect, it } from 'vitest'
import { decodeBytes } from './decode-file'

/**
 * Le défaut : `file.text()` décode en UTF-8 sans condition et sans le dire.
 * Excel FR écrit en Windows-1252 dès qu'on choisit « CSV » plutôt que « CSV
 * UTF-8 » — et c'est le choix par défaut.
 */
describe('décodage d’un fichier déposé', () => {
  it('lit de l’UTF-8 et le dit', () => {
    const bytes = new TextEncoder().encode('Société;Nom')
    expect(decodeBytes(bytes)).toEqual({ text: 'Société;Nom', encoding: 'utf-8' })
  })

  it('retire le BOM et le SIGNALE', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Email')])
    const decoded = decodeBytes(bytes)
    expect(decoded.text).toBe('Email')
    expect(decoded.encoding).toBe('utf-8-bom')
  })

  it('retombe sur Windows-1252 plutôt que de rendre des losanges', () => {
    // « Société » en cp1252 : le 0xE9 est un « é » ici, et une séquence UTF-8
    // invalide là. Sans ce repli, l'en-tête n'est plus reconnu et l'écran
    // annonce « aucune colonne reconnue » sur un fichier valide.
    const bytes = new Uint8Array([0x53, 0x6f, 0x63, 0x69, 0xe9, 0x74, 0xe9])
    const decoded = decodeBytes(bytes)
    expect(decoded.text).toBe('Société')
    expect(decoded.encoding).toBe('windows-1252')
  })

  it('n’essaie JAMAIS Windows-1252 en premier', () => {
    // Il ne peut pas échouer — chaque octet y a une place — donc il accepterait
    // de l'UTF-8 en le massacrant en silence.
    const bytes = new TextEncoder().encode('café')
    expect(decodeBytes(bytes).encoding).toBe('utf-8')
  })
})
