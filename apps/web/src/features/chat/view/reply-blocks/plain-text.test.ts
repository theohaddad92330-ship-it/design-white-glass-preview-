import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPLY_BLOCK_TYPES } from '@bellum/contracts'
import { replyPlainText } from './plain-text'

/**
 * #1914 — le web, l'API et le service IA écrivent le MÊME texte pour une carte :
 * une implémentation par langage, et un jeu partagé qui les tient. Les huit
 * textes attendus exercent les 25 libellés — donc les traductions françaises du
 * web sont, mot pour mot, celles que l'API et le service IA portent.
 */
const sharedFixtures = JSON.parse(
  readFileSync(
    join(__dirname, '../../../../../../../packages/contracts/src/schemas/reply-blocks.fixtures.json'),
    'utf8',
  ),
) as { valid: Record<string, unknown>; plain_text: { by_type: Record<string, string> } }

describe('#1914 — le texte du web est celui du contrat', () => {
  it.each([...REPLY_BLOCK_TYPES])('« %s »', type => {
    const block = ['```bellum-block', JSON.stringify(sharedFixtures.valid[type]), '```'].join('\n')
    expect(replyPlainText(block)).toBe(sharedFixtures.plain_text.by_type[type])
  })
})

/**
 * #1914 — CE QUI QUITTE L'ÉCRAN QUITTE LA CARTE.
 *
 * Copier une réponse (#1953), l'épingler en mémoire, la lire dans la bulle : ces
 * trois gestes reçoivent le TEXTE. Une carte leur arriverait sinon en JSON brut —
 * une régression de la copie livrée la veille.
 */
const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

describe('replyPlainText', () => {
  it('une réponse sans carte ressort à l’identique', () => {
    const text = 'Bonjour.\n\n- un point\n**Objectif :** gagner.'
    expect(replyPlainText(text)).toBe(text)
  })

  it('un classement se lit en texte, dans son ordre, avec ses axes', () => {
    const out = replyPlainText(
      `Voici.\n\n${fence({
        type: 'account_ranking',
        axes: ['Signal daté'],
        items: [
          {
            name: 'Alpha',
            why: ['Signal cyber.'],
            limits: ['Budget non confirmé.'],
            action: { label: 'Ouvrir le dossier', href: '/accounts/a' },
          },
          { name: 'Beta', why: ['Contact connu.'] },
        ],
      })}`,
    )
    expect(out).toContain('Voici.')
    expect(out).toContain('Signal daté')
    expect(out).toMatch(/1\. Alpha/)
    expect(out).toMatch(/2\. Beta/)
    expect(out).toContain('Signal cyber.')
    expect(out).toContain('Budget non confirmé.')
    expect(out).toContain('Ouvrir le dossier')
    expect(out).not.toContain('```')
    expect(out).not.toContain('{')
  })

  it('une case de comparaison inconnue se copie « non mesuré », jamais 0', () => {
    const out = replyPlainText(
      fence({ type: 'comparison', columns: ['A', 'B'], rows: [{ label: 'ESN en place', cells: [null, 'Deux'] }] }),
    )
    expect(out).toContain('ESN en place')
    expect(out).toContain('- A — non mesuré')
    expect(out).toContain('- B — Deux')
  })

  it('un bloc refusé ou en cours d’écriture ne laisse aucune syntaxe', () => {
    expect(replyPlainText(fence({ type: 'dashboard', items: ['Un tableau'] }))).toBe('- Un tableau')
    expect(replyPlainText('Je prépare.\n```bellum-block\n{"type":"verd')).toBe('Je prépare.')
  })
})
