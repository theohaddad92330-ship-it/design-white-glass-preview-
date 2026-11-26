import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPLY_BLOCK_TYPES } from '@bellum/contracts'
import { machineReplyText } from './reply-plain-text'

/**
 * #1914 — CE QUE L'API RELAIE HORS DE L'ÉCRAN EST DU TEXTE.
 *
 * Deux sorties de l'API ne passent pas par les cartes du web : la réponse de
 * `ask_bellum` (lue par un client MCP, donc un modèle) et le résumé roulant du
 * fil (qui repart dans le prompt). Elles reçoivent le texte de la carte, jamais
 * la clôture `bellum-block` ni son JSON.
 *
 * Le jeu est celui du contrat, lu sur le disque : il tient les libellés de
 * l'API au même texte que le web et le service IA — les 25 libellés sont tous
 * exercés par les huit textes attendus.
 */
type PlainTextFixtures = {
  valid: Record<string, unknown>
  plain_text: { by_type: Record<string, string> }
}

const fixtures = JSON.parse(
  readFileSync(join(__dirname, '../../../../packages/contracts/src/schemas/reply-blocks.fixtures.json'), 'utf8'),
) as PlainTextFixtures

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

describe('#1914 — machineReplyText', () => {
  it('le jeu partagé est lu — sinon cette suite garderait du vide', () => {
    expect(Object.keys(fixtures.plain_text.by_type).sort()).toEqual([...REPLY_BLOCK_TYPES].sort())
  })

  it.each([...REPLY_BLOCK_TYPES])('« %s » : le même texte que le contrat', type => {
    const out = machineReplyText(fence(fixtures.valid[type]))
    expect(out).toBe(fixtures.plain_text.by_type[type])
    expect(out).not.toContain('```')
  })

  it('une réponse sans carte ressort à l’identique', () => {
    expect(machineReplyText('Priorise EDF et SNCF.')).toBe('Priorise EDF et SNCF.')
  })
})
