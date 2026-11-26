import { describe, expect, it } from 'vitest'
import { formatDateRange } from './locale'

/**
 * LA PÉRIODE D'UNE MISSION — #1381.
 *
 * « Transformer "08/05/2026 – 01/10/2026" en "8 mai → 1 oct. 2026" ».
 */
describe('formatDateRange (#1381)', () => {
  it('n’écrit l’année qu’une fois quand les deux bornes la partagent', () => {
    expect(formatDateRange('2026-05-08', '2026-10-01')).toBe('8 mai → 1 oct. 2026')
  })

  it('écrit les DEUX années quand elles diffèrent — sinon la première est fausse', () => {
    expect(formatDateRange('2025-12-08', '2026-10-01')).toBe('8 déc. 2025 → 1 oct. 2026')
  })

  it('rend `null` dès qu’une borne manque — une période à une seule borne n’en est pas une', () => {
    // C'est à l'écran de dire « sans date de fin » : « 8 mai → … » ferait
    // parler français à un fichier qui ne connaît pas la langue de l'appelant.
    expect(formatDateRange('2026-05-08', null)).toBeNull()
    expect(formatDateRange(null, '2026-10-01')).toBeNull()
    expect(formatDateRange(null, null)).toBeNull()
  })

  it('rend `null` sur une date illisible, jamais « Invalid Date » ni 1970', () => {
    expect(formatDateRange('pas une date', '2026-10-01')).toBeNull()
    expect(formatDateRange('2026-05-08', '')).toBeNull()
  })
})
