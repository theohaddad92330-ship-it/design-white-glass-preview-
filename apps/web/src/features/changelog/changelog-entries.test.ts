import { afterAll, describe, expect, it } from 'vitest'
import { CHANGELOG_IDS, getChangelog, LATEST_CHANGELOG_ID } from '@/features/changelog/changelog-entries'
import { i18n } from '@/i18n'

/**
 * Web-side half of the changelog guard: the catalogue shipped by
 * `@bellum/contracts` must actually be WIRED into the running i18n instance, in
 * both languages, with no raw key leaking into the "Nouveautés" panel.
 *
 * The catalogue's own consistency (ids ↔ FR/EN labels ↔ itemCount) is asserted
 * where the catalogue lives: `packages/contracts/src/changelog/changelog.test.ts`.
 */
describe('getChangelog resolves without leaking raw keys', () => {
  afterAll(async () => {
    await i18n.changeLanguage('fr')
  })

  it('re-exports the shared catalogue newest-first', () => {
    expect(LATEST_CHANGELOG_ID).toBe(CHANGELOG_IDS[0]?.id)
  })

  it.each(['fr', 'en'])('resolves real strings in %s', async lang => {
    await i18n.changeLanguage(lang)
    const entries = getChangelog()
    expect(entries.map(e => e.id)).toEqual(CHANGELOG_IDS.map(e => e.id))
    entries.forEach((entry, i) => {
      const values = [entry.date, entry.title, ...entry.items]
      for (const value of values) {
        expect(value.trim()).toBeTruthy()
        expect(value.startsWith('changelog:')).toBe(false)
      }
      expect(entry.items).toHaveLength(CHANGELOG_IDS[i].itemCount)
    })
  })

  it('follows the active language (FR and EN read differently)', async () => {
    await i18n.changeLanguage('fr')
    const fr = getChangelog()[0]?.title
    await i18n.changeLanguage('en')
    const en = getChangelog()[0]?.title
    expect(fr).toBeTruthy()
    expect(en).toBeTruthy()
    expect(fr).not.toBe(en)
  })
})
