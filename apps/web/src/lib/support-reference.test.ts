import { describe, expect, it, beforeEach } from 'vitest'
import { lastSupportReference, readSupportReference, rememberSupportReference } from './support-reference'

/**
 * #2442.5 — la référence support, côté écran.
 *
 * Elle est CALCULÉE par l'API (`common/observability-privacy.ts`) et voyage
 * dans le corps de la réponse d'erreur. Le navigateur ne la fabrique pas : il
 * la LIT, il en vérifie la forme, et il refuse tout le reste.
 */
describe('#2442.5 — lire une référence support sans jamais afficher ce que le serveur a écrit', () => {
  beforeEach(() => rememberSupportReference(null))

  it('lit la référence d’un corps d’erreur', () => {
    expect(readSupportReference({ message: 'Échec', supportReference: 'BLM-3F2A1B4C' })).toBe('BLM-3F2A1B4C')
  })

  it('rend `null` quand il n’y en a pas — une absence ne fait AUCUNE ligne', () => {
    expect(readSupportReference({ message: 'Échec' })).toBeNull()
    expect(readSupportReference(null)).toBeNull()
    expect(readSupportReference('pas un objet')).toBeNull()
    expect(readSupportReference(undefined)).toBeNull()
  })

  it('SAIT DIRE NON — une valeur qui n’a pas la forme d’une référence est REFUSÉE, pas affichée', () => {
    // Le corps d'une réponse est ce que le serveur a eu le temps d'écrire : on
    // ne rend jamais une chaîne arbitraire sur un écran au motif qu'elle
    // s'appelait `supportReference`.
    for (const wrong of [
      '<img src=x onerror=alert(1)>',
      'BLM-3f2a1b4c',
      'BLM-3F2A1B4',
      'BLM-3F2A1B4CD',
      'XXX-3F2A1B4C',
      '3F2A1B4C',
      '',
      42,
      { toString: () => 'BLM-3F2A1B4C' },
    ]) {
      expect(readSupportReference({ supportReference: wrong })).toBeNull()
    }
  })

  it('retient la DERNIÈRE référence vue, et la rend telle quelle', () => {
    expect(lastSupportReference()).toBeNull()
    rememberSupportReference('BLM-3F2A1B4C')
    expect(lastSupportReference()).toBe('BLM-3F2A1B4C')
    rememberSupportReference('BLM-AAAABBBB')
    expect(lastSupportReference()).toBe('BLM-AAAABBBB')
  })

  it('ne retient JAMAIS une valeur mal formée — même chemin, même refus', () => {
    rememberSupportReference('<script>alert(1)</script>')
    expect(lastSupportReference()).toBeNull()
  })
})
