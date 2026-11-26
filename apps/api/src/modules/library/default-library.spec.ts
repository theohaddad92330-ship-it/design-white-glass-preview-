import { libraryItemKindValues } from '@bellum/contracts'
import { DEFAULT_LIBRARY_ITEMS } from './default-library'

/**
 * Guards the built-in starter set — in particular the curated **method
 * playbooks** (the ESN plan-de-compte method) added for the Connaissances
 * « Méthode » section. These ship as real, editable seed rows, so they must be
 * well-formed (unique titles per kind for the lazy-seed unique index) and carry
 * genuine, non-generic method guidance — never lorem / placeholder copy.
 */
describe('DEFAULT_LIBRARY_ITEMS', () => {
  const methodPlaybooks = DEFAULT_LIBRARY_ITEMS.filter(item => item.kind === 'method_playbook')

  it('only uses kinds declared in the contracts enum', () => {
    for (const item of DEFAULT_LIBRARY_ITEMS) {
      expect(libraryItemKindValues).toContain(item.kind)
    }
  })

  it('ships a curated set of 4-6 method playbooks', () => {
    expect(methodPlaybooks.length).toBeGreaterThanOrEqual(4)
    expect(methodPlaybooks.length).toBeLessThanOrEqual(6)
  })

  it('gives every method playbook a title, a description and a substantial body', () => {
    for (const item of methodPlaybooks) {
      expect(item.title.trim().length).toBeGreaterThan(0)
      expect((item.description ?? '').trim().length).toBeGreaterThan(0)
      // Real method guidance is long-form (rich markdown), not a one-liner.
      expect(item.body.trim().length).toBeGreaterThan(400)
      // Method playbooks are strategy, not templated copy: no category badge.
      expect(item.category).toBeNull()
    }
  })

  it('keeps titles unique within each kind (lazy-seed unique index safety)', () => {
    const seen = new Set<string>()
    for (const item of DEFAULT_LIBRARY_ITEMS) {
      const key = `${item.kind}::${item.title}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
  })

  it('covers the core plan-de-compte method anchors across the set', () => {
    const corpus = methodPlaybooks.map(item => `${item.title} ${item.body}`.toLowerCase()).join('\n')
    // Multi-threading / 3 niveaux / 12 contacts.
    expect(corpus).toMatch(/multi-?thread/)
    expect(corpus).toContain('12 contacts')
    // Thread achats (référencement / procurement) launched early.
    expect(corpus).toContain('achats')
    // Champion → sponsor conversion.
    expect(corpus).toContain('champion')
    expect(corpus).toContain('sponsor')
    // Approaching a C-level (DSI).
    expect(corpus).toContain('dsi')
  })
})
