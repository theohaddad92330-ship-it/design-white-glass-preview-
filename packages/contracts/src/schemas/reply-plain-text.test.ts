import { describe, expect, it } from 'vitest'
import fixtures from './reply-blocks.fixtures.json' with { type: 'json' }
import { REPLY_BLOCK_FENCE, REPLY_BLOCK_TYPES } from './reply-blocks.js'
import { REPLY_PLAIN_TEXT_LABEL_KEYS, replyPlainText } from './reply-plain-text.js'

/**
 * #1914 — CE QUI QUITTE L'ÉCRAN QUITTE LA CARTE.
 *
 * La copie, la bulle, le client MCP, le résumé roulant et l'historique relu par
 * le modèle reçoivent du TEXTE — jamais la clôture `bellum-block` ni son JSON.
 * UNE implémentation par langage : celle-ci pour TypeScript (web et API), et
 * `reply_blocks_as_text` pour Python, tenues l'une à l'autre par ce jeu.
 */
const fence = (block: unknown) => ['```' + REPLY_BLOCK_FENCE, JSON.stringify(block), '```'].join('\n')
const { labels, by_type: byType, cases } = fixtures.plain_text

describe('#1914 — une réponse à cartes, en texte', () => {
  it('le jeu porte un libellé par clé déclarée — ni plus, ni moins', () => {
    expect(Object.keys(labels).sort()).toEqual([...REPLY_PLAIN_TEXT_LABEL_KEYS].sort())
  })

  it('chaque type déclaré a son texte attendu', () => {
    expect(Object.keys(byType).sort()).toEqual([...REPLY_BLOCK_TYPES].sort())
  })

  it.each([...REPLY_BLOCK_TYPES])('« %s » se lit en texte, sans aucune syntaxe', type => {
    const out = replyPlainText(fence(fixtures.valid[type]), labels)
    expect(out).toBe(byType[type])
    expect(out).not.toContain('```')
    expect(out).not.toContain('"type"')
  })

  it.each(cases.map(entry => [entry.why, entry] as const))('%s', (_why, entry) => {
    expect(replyPlainText(entry.text, labels)).toBe(entry.expected)
  })

  it('un libellé vient de l’appelant : le contrat ne porte aucun texte d’interface', () => {
    const out = replyPlainText(fence(fixtures.valid.verdict), { ...labels, why: 'Why' })
    expect(out).toContain('\nWhy\n')
    expect(out).not.toContain('Pourquoi')
  })
})

// Théo B l1-laura — la copie en texte porte l'adresse de la source, comme la carte.
describe('Théo B l1-laura — le lien de la source dans la copie en texte', () => {
  it('« Source : label · date · url »', () => {
    const text = replyPlainText(
      fence({
        type: 'account_card',
        name: 'Banque Valmont',
        href: '/accounts/a-1',
        highlights: ['Appel d’offres publié'],
        source: { label: 'Site carrière', as_of: '2026-10', url: 'https://www.sg.fr/carrieres' },
      }),
      labels,
    )
    expect(text).toContain('Site carrière · 2026-10 · https://www.sg.fr/carrieres')
  })
})
