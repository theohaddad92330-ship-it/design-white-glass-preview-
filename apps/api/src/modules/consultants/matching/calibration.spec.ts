import { calibrate, MIN_SUBMISSIONS } from './calibration'

function rows(spec: { pushable: number; interviews: number; total: number }[]) {
  return spec.flatMap(entry =>
    Array.from({ length: entry.total }, (_, index) => ({
      pushable: entry.pushable,
      reachedInterview: index < entry.interviews,
    })),
  )
}

describe('la calibration du score poussable (§14)', () => {
  it('rend null sur une tranche vide, jamais 0 %', () => {
    // « 0 % d'entretiens » ferait chercher une panne là où il n'y a qu'une
    // absence de données.
    const calibration = calibrate(rows([{ pushable: 90, interviews: 3, total: 5 }]))
    expect(calibration.bands.find(band => band.band === '80-100')?.rate).toBe(60)
    expect(calibration.bands.find(band => band.band === '<40')?.rate).toBeNull()
  })

  it('ne propose RIEN sous trente positionnements', () => {
    const calibration = calibrate(
      rows([
        { pushable: 90, interviews: 0, total: 3 },
        { pushable: 50, interviews: 2, total: 2 },
      ]),
    )
    expect(calibration.enough).toBe(false)
    expect(calibration.proposal).toBeNull()
  })

  it('propose une revue quand les courbes se croisent, au-delà du seuil', () => {
    const calibration = calibrate(
      rows([
        { pushable: 90, interviews: 2, total: 20 },
        { pushable: 50, interviews: 15, total: 20 },
      ]),
    )
    expect(calibration.total).toBeGreaterThanOrEqual(MIN_SUBMISSIONS)
    expect(calibration.crossed).toBe(true)
    expect(calibration.proposal).toContain('pondération')
  })

  it('ne propose rien quand les tranches sont dans le bon ordre', () => {
    const calibration = calibrate(
      rows([
        { pushable: 90, interviews: 16, total: 20 },
        { pushable: 50, interviews: 3, total: 20 },
      ]),
    )
    expect(calibration.crossed).toBe(false)
    expect(calibration.proposal).toBeNull()
  })

  it('ignore les tranches vides dans la comparaison plutôt que de les croiser', () => {
    // Sans cela, une tranche absente vaudrait zéro et croiserait tout le temps.
    const calibration = calibrate(rows([{ pushable: 90, interviews: 10, total: 40 }]))
    expect(calibration.crossed).toBe(false)
  })

  it('n’applique jamais rien — elle propose', () => {
    const calibration = calibrate(rows([{ pushable: 90, interviews: 0, total: 40 }]))
    expect(Object.keys(calibration)).toEqual(['bands', 'total', 'enough', 'crossed', 'proposal'])
  })
})
