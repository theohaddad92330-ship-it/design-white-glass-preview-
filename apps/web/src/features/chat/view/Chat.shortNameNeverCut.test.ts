import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #3769 (recette R31, 1512 px) — un nom court ne se coupe JAMAIS.
 * Mesuré : « SNCF » 32 > 22 (ellipsis) et « Maëlle » 37 > 17 (clip) dans la liste latérale ;
 * « Laura » 38 > 30 sur /chat vierge. Garde de structure (les classes, pas les pixels : jsdom ne mesure pas).
 */
const read = (f: string) => readFileSync(join(__dirname, f), 'utf8')

describe('#3769 — troncatures restantes de /chat', () => {
  it('le titre « Laura » de l’en-tête ne rétrécit pas (la portée cède, pas le nom)', () => {
    const src = read('Chat.tsx')
    const h1 = src.match(
      /<Text element="h1" size="sm" weight="semibold" className="([^"]*)">\s*\{t\('header\.titleDefault'\)\}/,
    )
    expect(h1).not.toBeNull()
    expect(h1?.[1]).toContain('shrink-0')
    expect(h1?.[1]).toContain('whitespace-nowrap')
    // La garde GA-255 reste tenue : pas de `truncate` sur un élément qui ne rétrécit pas.
    expect(h1?.[1]).not.toContain('truncate')
  })

  it('la ligne méta d’un fil passe à la ligne (flex-wrap) au lieu de rogner compte/auteur', () => {
    const src = read('ConversationsPanel.tsx')
    const meta = src.indexOf('<span className="flex min-w-0 flex-wrap items-center gap-x-1.5">')
    expect(meta).toBeGreaterThan(-1)
    const block = src.slice(meta, meta + 2500)
    // Le nom du compte garde une borne (max-w-full) pour qu’un nom LONG tronque, un court non.
    expect(block).toMatch(/className="max-w-full truncate"/)
    // Le prénom de l’auteur ne rétrécit pas.
    expect(block).toMatch(/size="meta"\s+className="shrink-0"/)
  })

  it('MessageAuthor : le prénom est insécable', () => {
    expect(read('MessageAuthor.tsx')).toContain('whitespace-nowrap')
  })
})
