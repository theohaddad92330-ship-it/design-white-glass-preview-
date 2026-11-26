import { workspaceRecallContextFor, type WorkspaceRecallInput } from './workspace-recall-context'

const NOW = new Date('2026-10-13T10:00:00Z')

const base: WorkspaceRecallInput = { searches: [], targetLists: [], conversations: [], now: NOW }

describe('workspaceRecallContextFor (#4071.3)', () => {
  it('rend null quand rien n’existe : le prompt reste identique au byte près', () => {
    expect(workspaceRecallContextFor(base)).toBeNull()
  })

  it('date chaque ligne, plus récent d’abord, sans nommer de source', () => {
    const text = workspaceRecallContextFor({
      ...base,
      searches: [
        { name: 'ESN cyber IDF', objective: 'trouver des cibles', at: new Date('2026-10-12T08:00:00Z') },
        { name: 'Industrie Lyon', objective: null, at: new Date('2025-08-01T08:00:00Z') },
      ],
      targetLists: [{ name: 'Campagne rentrée', objective: 'relancer', at: new Date('2026-09-13T08:00:00Z') }],
      conversations: [{ summary: 'On a parlé de la stratégie Renault.', at: new Date('2026-10-13T07:00:00Z') }],
    })
    expect(text).toContain('Recherche enregistrée : ESN cyber IDF')
    expect(text).toContain('il y a 1 jour')
    expect(text).toContain('Liste de cibles : Campagne rentrée')
    expect(text).toContain('Conversation passée : On a parlé de la stratégie Renault.')
    expect(text).toContain('aujourd')
    expect(text!.indexOf('ESN cyber IDF')).toBeLessThan(text!.indexOf('Industrie Lyon'))
    expect(text).toMatch(/il y a \d+ mois/)
    expect(text).not.toMatch(/saved_views|Discover|Découvrir|Pappers|DataForge/i)
  })

  it('borne chaque famille et DIT ce qui reste', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      name: `Recherche ${i}`,
      objective: null,
      at: new Date(NOW.getTime() - i * 86_400_000),
    }))
    const text = workspaceRecallContextFor({ ...base, searches: many })!
    expect(text).toContain('Recherche 0')
    expect(text).not.toContain('Recherche 19')
    expect(text).toMatch(/\d+ recherches? enregistrées? plus anciennes? non listées?/)
  })

  it('coupe le résumé d’une conversation : jamais le texte entier', () => {
    const long = 'x'.repeat(2000)
    const text = workspaceRecallContextFor({ ...base, conversations: [{ summary: long, at: NOW }] })!
    expect(text.length).toBeLessThan(600)
  })

  it('ignore un résumé vide', () => {
    expect(workspaceRecallContextFor({ ...base, conversations: [{ summary: '   ', at: NOW }] })).toBeNull()
  })
})
