import { describe, expect, it } from 'vitest'
import { dedupeReplyOptionGroups } from './reply-options-dedupe'

const group = (...options: string[]) => ({ question: 'Quel canal ?', options })

/**
 * R10B-FIX.4 — « prépare un message d'approche directe pour Cindy Tsai » : E-mail / Message LinkedIn /
 * Script d'appel s'affichaient DEUX fois (la carte de clarification ET le groupe de précisions
 * portaient les mêmes boutons). Chaque libellé n'est offert qu'UNE fois sous une réponse.
 */
describe('dedupeReplyOptionGroups', () => {
  const channels = ['E-mail', 'Message LinkedIn', "Script d'appel"]

  it('retire un groupe dont tous les boutons sont déjà offerts par la clarification', () => {
    expect(dedupeReplyOptionGroups([group(...channels)], channels)).toEqual([])
  })

  it('un seul bouton de chaque quand la clarification et le groupe se recouvrent', () => {
    const groups = dedupeReplyOptionGroups([group(...channels, 'Autre canal')], channels)
    expect(groups.flatMap(g => g.options)).toEqual(['Autre canal'])
  })

  it('retire un second groupe identique au premier (deux appels du modèle)', () => {
    const groups = dedupeReplyOptionGroups([group(...channels), group(...channels)], [])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.options).toEqual(channels)
  })

  it('compare sans tenir compte de la casse, des espaces ni de la ponctuation finale', () => {
    expect(dedupeReplyOptionGroups([group(' e-mail ', 'Script d’appel.')], ['E-mail', "Script d'appel"])).toEqual([])
  })

  it('SAIT DIRE NON — des options différentes restent toutes là', () => {
    const groups = dedupeReplyOptionGroups([group('Oui', 'Non')], channels)
    expect(groups).toEqual([group('Oui', 'Non')])
  })

  it('lit le libellé des options structurées (fiches homonymes)', () => {
    const groups = dedupeReplyOptionGroups(
      [{ question: 'Laquelle ?', options: [{ label: 'Sophie Martin', company: 'A' }] }],
      [{ label: 'Sophie Martin', company: 'A' }],
    )
    expect(groups).toEqual([])
  })
})
