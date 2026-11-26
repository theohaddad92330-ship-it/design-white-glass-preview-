import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #3769 — recette R29 : des libellés du /chat étaient COUPÉS (« Laura », « SNCF », « Maëlle », la portée
 * « Tout mon espace · 18 comptes a… », la rangée Exporter). Une ellipse (`truncate`) sur un texte court qui
 * porte le sens est un défaut ; ces libellés passent à la ligne ou gardent leur largeur.
 */
const read = (relative: string): string => readFileSync(join(__dirname, '..', relative), 'utf8')

describe('#3769 — les libellés courts du /chat ne sont plus coupés', () => {
  it('le nom « Laura » de l’en-tête garde sa largeur (aucune ellipse)', () => {
    const chat = read('view/Chat.tsx')
    const h1 = /<Text element="h1"[^>]*className="([^"]*)"/.exec(chat)?.[1]
    expect(h1).toBeDefined()
    expect(h1).not.toContain('truncate')
    expect(h1).toContain('whitespace-nowrap')
  })

  it('la rangée d’actions de l’en-tête (Exporter) ne rétrécit pas sous son contenu', () => {
    expect(read('view/Chat.tsx')).toMatch(/<div className="flex shrink-0 items-center gap-1">\s*\{\/\* #5047/)
  })

  it('la portée passe à la ligne au lieu de s’arrêter sur une ellipse', () => {
    const scope = read('scope/ScopeButton.tsx')
    expect(scope).not.toContain('truncate')
    expect(scope).toContain('line-clamp-2')
  })

  it('les chips de contexte (« SNCF ») et le prénom d’un auteur (« Maëlle ») ne portent pas `truncate`', () => {
    expect(read('view/reply-kit/header.tsx')).not.toMatch(/<span className="truncate">\{chip\./)
    expect(read('view/MessageAuthor.tsx')).not.toContain('truncate')
  })
})
