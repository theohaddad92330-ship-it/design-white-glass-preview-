import { DEMO_CONSULTANTS, DEMO_STAFFING } from './demo-dataset'

/**
 * Lot L9 (#2176.55, craft rule n°9) — la ligne « Coût / marge » de la
 * comparaison se lit EN DÉMO, dans ses deux états, sans semis de plus :
 * `seedStaffing` pose le coût chargé de quelques salariés du vivier
 * (`DEMO_STAFFING.dailyCostCents`), et un profil du vivier n'en a pas — la
 * ligne dit alors « Coût non renseigné », jamais un 0.
 */
describe('démo — coût et marge du comparateur de matching (#2176.55)', () => {
  const byName = new Map(DEMO_CONSULTANTS.map(consultant => [consultant.full_name, consultant]))

  it('au moins un SALARIÉ du vivier a un coût chargé ET un TJM : la marge se calcule', () => {
    const priced = Object.keys(DEMO_STAFFING.dailyCostCents)
      .map(name => byName.get(name))
      .filter(consultant => consultant?.contract_type === 'cdi' && consultant.tjm != null)
    expect(priced.length).toBeGreaterThan(0)
  })

  it('au moins un profil du vivier n’a AUCUN coût : l’absence se nomme', () => {
    const unpriced = DEMO_CONSULTANTS.filter(consultant => !(consultant.full_name in DEMO_STAFFING.dailyCostCents))
    expect(unpriced.length).toBeGreaterThan(0)
  })
})
