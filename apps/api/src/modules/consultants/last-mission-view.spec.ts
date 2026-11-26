import { lastMissionView } from './last-mission-view'

// #4016.8e — le dernier TJM vendu : propagé EN LECTURE SEULE depuis la mission la plus récente
// (`missions.daily_rate`, rendu à tout membre — D45), jamais un champ saisi sur la fiche (c57).
describe('lastMissionView — #4016.8e', () => {
  const row = { label: 'TMA', account_name: 'SNCF', ends_on: '2026-12-31', daily_rate: 650 }

  it('porte le dernier TJM vendu de la mission la plus récente', () => {
    expect(lastMissionView(row)).toEqual({
      label: 'TMA',
      accountName: 'SNCF',
      endsOn: '2026-12-31',
      startsOn: null,
      dailyRate: 650,
    })
  })

  it('un TJM non saisi reste `null` — jamais 0', () => {
    expect(lastMissionView({ ...row, daily_rate: null })?.dailyRate).toBeNull()
  })

  it('un TJM à zéro ou négatif n’est pas un tarif vendu : `null`', () => {
    expect(lastMissionView({ ...row, daily_rate: 0 })?.dailyRate).toBeNull()
    expect(lastMissionView({ ...row, daily_rate: -5 })?.dailyRate).toBeNull()
  })

  it('porte le début de l’affectation (Théo C talents-vivier.R4 — démarrage prévu)', () => {
    expect(lastMissionView({ ...row, starts_on: '2026-11-03' })?.startsOn).toBe('2026-11-03')
  })

  it('aucune mission ⇒ aucune ligne', () => {
    expect(lastMissionView(undefined)).toBeNull()
  })

  it('un numérique renvoyé en texte par le pilote est lu comme un nombre', () => {
    expect(lastMissionView({ ...row, daily_rate: '650.00' as unknown as number })?.dailyRate).toBe(650)
  })
})
