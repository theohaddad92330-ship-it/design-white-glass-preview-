import { describe, expect, it } from 'vitest'
import { talentPhotoSrc } from './talentPhoto'

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('talentPhotoSrc', () => {
  it('rend une image encodée valide TELLE QUELLE', () => {
    expect(talentPhotoSrc(PIXEL)).toBe(PIXEL)
  })

  it('rend `null` pour `null`/`undefined` — pas de photo n’est pas une erreur', () => {
    expect(talentPhotoSrc(null)).toBeNull()
    expect(talentPhotoSrc(undefined)).toBeNull()
  })

  it('refuse une URL ordinaire — ce n’est jamais ce que le serveur écrit sur ce champ', () => {
    expect(talentPhotoSrc('https://exemple.test/photo.png')).toBeNull()
  })

  it('refuse un `data:` hors image — c’est le vecteur XSS que le motif ferme', () => {
    expect(talentPhotoSrc('data:text/html;base64,PHNjcmlwdD48L3NjcmlwdD4=')).toBeNull()
  })
})
