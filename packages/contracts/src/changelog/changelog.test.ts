import { describe, expect, it } from 'vitest'
import {
  CHANGELOG_IDS,
  LATEST_CHANGELOG_ID,
  changelogEn,
  changelogEntriesSince,
  changelogFr,
  resolveChangelogEntries,
  resolveChangelogLanguage,
} from './index.js'

/**
 * The catalogue's sync guard, moved here with the catalogue itself.
 *
 * It used to live in `apps/web` and cover the web JSON only. Now that the API
 * emails these very entries, this is the single place where a drift can be
 * caught — a missing EN item would otherwise ship an email with a hole in it.
 */

type Catalog = { entries: Record<string, Record<string, string>> }

function itemKeys(entry: Record<string, string>): string[] {
  return Object.keys(entry)
    .filter(k => /^item\d+$/.test(k))
    .sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))
}

const catalogs: Array<{ lang: string; catalog: Catalog }> = [
  { lang: 'fr', catalog: changelogFr },
  { lang: 'en', catalog: changelogEn },
]

describe('changelog registry ↔ label catalogs', () => {
  const registryIds = CHANGELOG_IDS.map(e => e.id)

  it('has unique ids', () => {
    expect(new Set(registryIds).size).toBe(registryIds.length)
  })

  it('exposes the newest entry as LATEST_CHANGELOG_ID', () => {
    expect(LATEST_CHANGELOG_ID).toBe(registryIds[0])
  })

  it.each(catalogs)('registry ids match the $lang catalog exactly', ({ catalog }) => {
    expect([...registryIds].sort()).toEqual(Object.keys(catalog.entries).sort())
  })

  it.each(catalogs)('every $lang entry has a date, a title and itemCount items', ({ catalog }) => {
    for (const { id, itemCount } of CHANGELOG_IDS) {
      const entry = catalog.entries[id]
      expect(entry, `missing entry ${id}`).toBeDefined()
      expect(entry?.['date']?.trim()).toBeTruthy()
      expect(entry?.['title']?.trim()).toBeTruthy()
      expect(itemKeys(entry ?? {}), `item count for ${id}`).toEqual(
        Array.from({ length: itemCount }, (_, i) => `item${i + 1}`),
      )
    }
  })

  it('FR and EN describe the exact same key tree (an email must never ship a hole)', () => {
    const flatten = (catalog: Catalog): string[] =>
      Object.entries(catalog.entries)
        .flatMap(([id, entry]) => Object.keys(entry).map(key => `${id}.${key}`))
        .sort()
    expect(flatten(changelogFr)).toEqual(flatten(changelogEn))
  })
})

describe('resolveChangelogEntries', () => {
  it.each(['fr', 'en'] as const)('resolves every entry with real labels in %s', lang => {
    const entries = resolveChangelogEntries(lang)
    expect(entries.map(e => e.id)).toEqual(CHANGELOG_IDS.map(e => e.id))
    entries.forEach((entry, i) => {
      expect(entry.date.trim()).toBeTruthy()
      expect(entry.title.trim()).toBeTruthy()
      expect(entry.items).toHaveLength(CHANGELOG_IDS[i]?.itemCount ?? -1)
      entry.items.forEach(item => expect(item.trim()).toBeTruthy())
    })
  })

  it('reads FR and EN as genuinely different catalogues', () => {
    expect(resolveChangelogEntries('fr')[0]?.title).not.toBe(resolveChangelogEntries('en')[0]?.title)
  })
})

describe('changelogEntriesSince (the newsletter delta)', () => {
  const ids = CHANGELOG_IDS.map(e => e.id)

  it('returns nothing when the reader is already on the newest entry', () => {
    expect(changelogEntriesSince('fr', LATEST_CHANGELOG_ID)).toEqual([])
  })

  it('returns only the entries newer than the marker, newest first', () => {
    const delta = changelogEntriesSince('fr', ids[3] as string)
    expect(delta.map(e => e.id)).toEqual(ids.slice(0, 3))
  })

  it('returns nothing for a null marker (a new reader is never blasted with the backlog)', () => {
    expect(changelogEntriesSince('fr', null)).toEqual([])
  })

  it('returns nothing for a marker that is no longer in the catalogue', () => {
    expect(changelogEntriesSince('fr', 'retired-entry-id')).toEqual([])
  })
})

describe('resolveChangelogLanguage', () => {
  it.each(['fr', 'FR', 'fr-FR', 'fr-BE'])('maps francophone %s to fr', value => {
    expect(resolveChangelogLanguage(value)).toBe('fr')
  })

  it.each(['en', 'en-US', 'EN-gb'])('maps anglophone %s to en', value => {
    expect(resolveChangelogLanguage(value)).toBe('en')
  })

  it.each([null, undefined, '', 'de'])('falls back to the product default FR for %s', value => {
    expect(resolveChangelogLanguage(value)).toBe('fr')
  })
})
