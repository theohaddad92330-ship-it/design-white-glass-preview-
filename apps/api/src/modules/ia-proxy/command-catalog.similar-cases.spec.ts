import { commandReads } from '@bellum/contracts'
import { COMMAND_CATALOG } from './command-catalog'

/**
 * #3246 (épopée #3210, lot E16) — recette Y19 (02/10) : en démo, aucune amorce
 * scriptée n'amenait au cas « Banque Exemplaire » bien que `find_similar_cases`
 * sache répondre depuis le 30/09/2026 (lot P10). Cette commande ferme ce
 * manque — elle sait dire NON si quelqu'un la retire ou la renomme en silence.
 */
describe('#3246 — à quoi ce compte ressemble (cas gagnés/perdus)', () => {
  const command = COMMAND_CATALOG.find(item => item.key === 'account_similar_cases')

  it('existe, rangée sous « ouvrir un compte », et pose la question rejouée en recette', () => {
    expect(command).toBeDefined()
    expect(command?.category).toBe('accounts')
    expect(command?.moment).toBe('open_account')
    expect(command?.prompt.fr).toBe('À quoi ressemble ce compte par rapport à ce qu’on a gagné ou perdu ?')
    expect(command?.prompt.en).toContain('resemble')
  })

  it('appelle find_similar_cases, et seulement lui — aucun connecteur requis', () => {
    expect(command?.tools).toEqual(['find_similar_cases'])
    expect(command?.requires).toEqual([])
  })

  it('sa donnée se dérive de l’outil — account_dossiers, comme get_account_briefing/compare_accounts', () => {
    expect(commandReads(command!)).toEqual(['account_dossiers'])
  })

  it('sait dire NON — une seule commande porte cette clé', () => {
    expect(COMMAND_CATALOG.filter(item => item.key === 'account_similar_cases')).toHaveLength(1)
  })
})
