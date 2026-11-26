import { describe, expect, it } from 'vitest'
import { replyTransformRequestFor } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { demoReplyTransformTurn } from './demo-turn'

const SOURCE = [
  'Comptes à traiter :',
  '1. Alpha — contrat en fin de cycle',
  '2. Beta — nouveau DSI',
  '3. Gamma — appel d’offres',
  '4. Delta — budget gelé',
  'La cartographie est partielle : seuls les comptes déjà analysés sont couverts.',
].join('\n')

const t = i18n.getFixedT('fr', 'chat')

describe('demoReplyTransformTurn (#3768)', () => {
  it('transforme la réponse source en démo, sans réseau et sans rien inventer', () => {
    const { reply } = demoReplyTransformTurn(replyTransformRequestFor('priorities_only', SOURCE), t)
    expect(reply).toContain('Alpha')
    expect(reply).not.toContain('Delta')
    expect(reply).toContain('1 élément mis de côté.')
    expect(reply).toContain('La cartographie est partielle')
  })

  it('dit ce qui manque plutôt que de fabriquer une suite pour un geste qui exige de nouvelles données', () => {
    const { reply } = demoReplyTransformTurn(replyTransformRequestFor('more_accounts', SOURCE), t)
    expect(reply).toContain('Voir plus de comptes')
    expect(reply).toContain('nouvelles données')
    expect(reply).not.toContain('Epsilon')
  })

  it('dit qu’il n’y a rien à retravailler quand la source n’a aucun élément', () => {
    const { reply } = demoReplyTransformTurn(replyTransformRequestFor('exportable_list', 'Une phrase.'), t)
    expect(reply).toContain('Reformater en liste exportable')
    expect(reply).toContain('pas d’éléments')
  })
})
