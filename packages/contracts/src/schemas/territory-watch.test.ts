import { describe, expect, it } from 'vitest'
import {
  MIN_SNAPSHOTS_FOR_BASELINE,
  type TerritorySnapshot,
  hiringBaseline,
  isMeaningfulShift,
  territoryChanges,
} from './territory-watch.js'

const photo = (over: Partial<TerritorySnapshot> = {}): TerritorySnapshot => ({
  takenOn: '2026-08-23',
  offers: 120,
  esnPresent: 340,
  openTenders: 6,
  awardedContracts: 12,
  esnHiring: [],
  ...over,
})

describe('isMeaningfulShift — ce qui vaut une interruption', () => {
  it('lit une petite base en NOMBRE, pas en pourcentage', () => {
    // 4 → 7 est « +75 % » et ne veut rien dire.
    expect(isMeaningfulShift(4, 7)).toBe(false)
    // 4 → 20 est un vrai réveil de territoire.
    expect(isMeaningfulShift(4, 20)).toBe(true)
  })

  it('lit un gros volume en proportion', () => {
    expect(isMeaningfulShift(200, 215)).toBe(false)
    expect(isMeaningfulShift(200, 260)).toBe(true)
  })

  it('ne bouge pas sur une stabilité parfaite', () => {
    expect(isMeaningfulShift(120, 120)).toBe(false)
  })
})

describe('territoryChanges — ce qui a bougé', () => {
  it('ne compare RIEN quand la semaine n’a pas été mesurée', () => {
    // Le défaut qu'on évite : « −100 % d'offres » un jour de maintenance de la
    // source. `null` veut dire « je n'ai pas regardé », pas « il n'y a rien ».
    const changes = territoryChanges(photo({ offers: 120 }), photo({ offers: null }))
    expect(changes.filter(c => c.kind === 'offers')).toEqual([])
  })

  it('annonce une hausse d’offres qui dépasse le bruit', () => {
    const changes = territoryChanges(photo({ offers: 100 }), photo({ offers: 145 }))
    expect(changes).toContainEqual(expect.objectContaining({ kind: 'offers', from: 100, to: 145 }))
  })

  it('annonce une BAISSE aussi — un territoire qui se ferme se voit', () => {
    const changes = territoryChanges(photo({ offers: 200 }), photo({ offers: 120 }))
    expect(changes).toContainEqual(expect.objectContaining({ kind: 'offers', from: 200, to: 120 }))
  })

  it('signale une ESN qui n’était pas là la semaine dernière', () => {
    const changes = territoryChanges(
      photo({ esnHiring: [{ name: 'SII', offers: 4 }] }),
      photo({
        esnHiring: [
          { name: 'SII', offers: 4 },
          { name: 'Sopra', offers: 9 },
        ],
      }),
    )
    expect(changes).toContainEqual(expect.objectContaining({ kind: 'new_esn', subject: 'Sopra', to: 9 }))
  })

  it('signale une accélération, jamais un ralentissement d’ESN', () => {
    // Une ESN qui recrute MOINS n'est pas un partenaire à appeler cette
    // semaine : c'est une information sans geste associé.
    const up = territoryChanges(
      photo({ esnHiring: [{ name: 'SII', offers: 4 }] }),
      photo({ esnHiring: [{ name: 'SII', offers: 30 }] }),
    )
    expect(up).toContainEqual(expect.objectContaining({ kind: 'esn_surge', subject: 'SII' }))
    const down = territoryChanges(
      photo({ esnHiring: [{ name: 'SII', offers: 30 }] }),
      photo({ esnHiring: [{ name: 'SII', offers: 4 }] }),
    )
    expect(down.filter(c => c.kind === 'esn_surge')).toEqual([])
  })

  it('rend une liste vide sans photo précédente — la première semaine ne dit rien', () => {
    expect(territoryChanges(null, photo())).toEqual([])
  })
})

describe('hiringBaseline — le « d’habitude » qui manquait', () => {
  const series = (values: number[]): TerritorySnapshot[] =>
    values.map((offers, i) => photo({ takenOn: `2026-0${(i % 9) + 1}-01`, esnHiring: [{ name: 'SII', offers }] }))

  it('rend null sous un trimestre d’historique', () => {
    // C'est l'état d'aujourd'hui : l'axe « Volume » du score de débordement
    // n'est PAS mesurable, et il doit le dire.
    expect(hiringBaseline(series([5, 6, 7]), 'SII')).toBeNull()
  })

  it('rend la MÉDIANE une fois le trimestre atteint', () => {
    const values = Array.from({ length: MIN_SNAPSHOTS_FOR_BASELINE }, () => 6)
    expect(hiringBaseline(series(values), 'SII')).toBe(6)
  })

  it('ne se laisse pas déplacer par une semaine de campagne', () => {
    const values = [...Array.from({ length: MIN_SNAPSHOTS_FOR_BASELINE - 1 }, () => 5), 200]
    // Une moyenne rendrait 20 et ferait passer SII pour un débordeur permanent.
    expect(hiringBaseline(series(values), 'SII')).toBe(5)
  })

  it('rend null pour une ESN absente de l’historique', () => {
    const values = Array.from({ length: MIN_SNAPSHOTS_FOR_BASELINE }, () => 6)
    expect(hiringBaseline(series(values), 'Inconnue')).toBeNull()
  })
})
