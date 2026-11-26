import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vu en passant (recette prod 10/10) : sur /chat, un conteneur `overflow-hidden` prenait
// scrollTop = 108 (focus du composeur, scrollIntoView d'un bloc) — en-tête à y = -46, bande vide
// de 118 px. Seul le fil défile : la coque et son enveloppe de route sont en `overflow-clip`.
const read = (relative: string) => readFileSync(resolve(__dirname, relative), 'utf8')

describe('/chat — la coque ne défile jamais', () => {
  it('la coque de Chat est en overflow-clip, jamais overflow-hidden', () => {
    const source = read('./Chat.tsx')
    const shell = source.match(/<section\s+aria-label=\{t\('panel\.aria'\)\}\s+className="([^"]+)"/)
    // La garde sait LIRE : si la coque change de forme, ce test rougit au lieu de passer à vide.
    expect(shell).not.toBeNull()
    expect(shell?.[1]).toContain('overflow-clip')
    expect(shell?.[1]).not.toContain('overflow-hidden')
  })

  it('l’enveloppe de la route /chat est en overflow-clip', () => {
    const source = read('../../../routes/chat/index.tsx')
    expect(source).toContain('className="flex h-full min-h-0 flex-col overflow-clip"')
  })
})
