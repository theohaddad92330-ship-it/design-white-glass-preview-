import { COMMAND_CATALOG } from './command-catalog'

/**
 * #2319.24 — « j'ai rendez-vous dans trente minutes » : la demande a sa
 * commande, et elle ne passe que par des LECTURES (l'agenda du jour, le point
 * sur le compte). Aucune écriture, aucun envoi.
 */
describe('#2319.24 — le rendez-vous dans trente minutes', () => {
  const command = COMMAND_CATALOG.find(item => item.key === 'meeting_imminent')

  it('existe, rangée sous « préparer un rendez-vous »', () => {
    expect(command).toBeDefined()
    expect(command?.moment).toBe('prepare_meeting')
    expect(command?.prompt.fr).toContain('dans trente minutes')
    expect(command?.prompt.en).toContain('in thirty minutes')
  })

  it('passe par les outils EXISTANTS de lecture, et seulement eux', () => {
    expect(command?.tools).toEqual(['prepare_day_brief', 'get_account_briefing'])
    // Les mêmes que « préparer mes rendez-vous de demain » : même chemin.
    const tomorrow = COMMAND_CATALOG.find(item => item.key === 'agenda_tomorrow')
    expect(command?.tools).toEqual(tomorrow?.tools)
  })

  it('sait dire NON — aucune commande du catalogue ne se fait passer pour elle', () => {
    expect(COMMAND_CATALOG.filter(item => item.key === 'meeting_imminent')).toHaveLength(1)
    expect(COMMAND_CATALOG.length).toBeGreaterThan(10)
  })
})
