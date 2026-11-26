import { describe, expect, it } from 'vitest'
import fixtures from './reply-blocks.fixtures.json' with { type: 'json' }
import { REPLY_BLOCK_FENCE, REPLY_BLOCK_TYPES } from './reply-blocks.js'
import { replyCompact, replyMarkdown } from './reply-export.js'
import { replyPlainText } from './reply-plain-text.js'

/**
 * #3770 — la copie structurée et la copie compacte d'une réponse riche.
 * Même jeu de libellés que `replyPlainText` : la vue écran et la copie disent
 * la même chose.
 */
const fence = (block: unknown) => ['```' + REPLY_BLOCK_FENCE, JSON.stringify(block), '```'].join('\n')
const { labels } = fixtures.plain_text

describe('#3770 — copie structurée et compacte', () => {
  it.each([...REPLY_BLOCK_TYPES])('« %s » : ni clôture ni JSON, et le compact n’est jamais plus long', type => {
    const text = fence(fixtures.valid[type])
    const md = replyMarkdown(text, labels)
    const compact = replyCompact(text, labels)
    for (const out of [md, compact]) {
      expect(out.trim()).not.toBe('')
      expect(out).not.toContain('```')
      expect(out).not.toContain('"type"')
    }
    expect(compact.length).toBeLessThanOrEqual(md.length)
  })

  it('une réponse sans carte reste à l’octet près', () => {
    expect(replyMarkdown('Bonjour **toi**', labels)).toBe('Bonjour **toi**')
  })

  it('une comparaison devient un tableau, et une case inconnue dit « non mesuré », jamais 0', () => {
    const md = replyMarkdown(fence(fixtures.valid.comparison), labels)
    expect(md).toContain('| --- | --- | --- |')
    expect(md).toContain(`| ESN en place | ${labels.notMeasured} | Deux ESN identifiées |`)
    expect(md).not.toMatch(/\|\s*0\s*\|/)
  })

  it('un plan d’action devient des étapes à cocher, avec échéance et responsable', () => {
    const md = replyMarkdown(fence(fixtures.valid.action_plan), labels)
    expect(md).toContain('## Plan sur deux semaines')
    expect(md).toContain("- [ ] Qualifier le besoin cloud — Relire l'appel d'offres. (Cette semaine · Toi)")
    expect(md).toContain('- [ ] Proposer deux consultants')
  })

  it('le classement garde ses titres numérotés ; le compact garde le rang sans le détail', () => {
    const text = fence(fixtures.valid.account_ranking)
    expect(replyMarkdown(text, labels)).toMatch(/^### 1\. /m)
    const compact = replyCompact(text, labels)
    expect(compact).toMatch(/^1\. /m)
    expect(compact).not.toContain(labels.why)
  })

  it('un bloc refusé redevient ses textes, un bloc coupé ne laisse rien', () => {
    expect(replyMarkdown(fence({ type: 'verdict', conclusion: 'Oui' }), labels)).toContain('Oui')
    expect(replyMarkdown('Avant\n\n```bellum-block\n{"type":"verd', labels)).toBe('Avant')
  })

  it('le texte nu et le markdown portent les mêmes mots (hors syntaxe)', () => {
    const text = fence(fixtures.valid.verdict)
    const strip = (s: string) =>
      s
        .replace(/[*#|\-[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    const plain = strip(replyPlainText(text, labels))
    const md = strip(replyMarkdown(text, labels))
    for (const word of plain.split(' ')) expect(md).toContain(word)
  })
})
