import { describe, expect, it } from 'vitest'
import { CHANGELOG_IDS, changelogFr } from '../changelog/index.js'
import { WELCOME_REDESIGN_CHANGELOG_ID, WELCOME_REDESIGN_DATE } from './welcome-redesign.js'

/**
 * #2897 (#2091.36) — la « date de refonte » n'est pas un texte libre : elle
 * CITE une entrée réelle du changelog produit. Ce test refuse que l'id
 * référencé disparaisse (renommage, purge d'anciennes entrées) sans que le
 * seuil de la bannière soit revu — une citation qui pointe dans le vide
 * serait pire qu'une date écrite en dur.
 */
describe('WELCOME_REDESIGN_CHANGELOG_ID (#2897)', () => {
  it('cite une entrée de changelog qui existe RÉELLEMENT', () => {
    expect(CHANGELOG_IDS.map(entry => entry.id)).toContain(WELCOME_REDESIGN_CHANGELOG_ID)
  })

  it("la date figée correspond au libellé de l'entrée citée (« 21 juillet 2026 »)", () => {
    const entry = changelogFr.entries[WELCOME_REDESIGN_CHANGELOG_ID]
    expect(entry?.date).toBe('21 juillet 2026')
    expect(WELCOME_REDESIGN_DATE).toBe('2026-07-21T00:00:00.000Z')
  })

  it("l'entrée citée annonce bien l'écran Welcome, pas une autre fonctionnalité du même jour", () => {
    const entry = changelogFr.entries[WELCOME_REDESIGN_CHANGELOG_ID]
    expect(entry?.title).toMatch(/bienvenue/i)
  })
})
