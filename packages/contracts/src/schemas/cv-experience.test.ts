import { describe, expect, it } from 'vitest'
import {
  formatExperienceDate,
  fromStoredExperienceDate,
  planExperienceWrites,
  readExperiencesFromDetection,
  toStoredExperienceDate,
  type CvExperience,
} from './cv-experience.js'

const exp = (over: Partial<CvExperience> = {}): CvExperience => ({
  role: 'Cheffe de projet SI',
  entreprise: 'Cabinet de conseil',
  date_debut: '2023-01-01',
  date_fin: null,
  realisations: null,
  ...over,
})

describe('#3935.2b — readExperiencesFromDetection', () => {
  it('découpe le format fermé « rôle | entreprise | début | fin | réalisations »', () => {
    expect(
      readExperiencesFromDetection([
        'Cheffe de projet SI senior | Cabinet de conseil | 2023-01 | 2025-06 | Deux migrations menées en parallèle',
      ]),
    ).toEqual([
      {
        role: 'Cheffe de projet SI senior',
        entreprise: 'Cabinet de conseil',
        date_debut: '2023-01',
        date_fin: '2025-06',
        realisations: 'Deux migrations menées en parallèle',
      },
    ])
  })

  it('jamais un champ inventé : un segment vide reste nul, « en cours » ne devient pas une fin', () => {
    expect(readExperiencesFromDetection('Chargée de projet junior |  |  | en cours')).toEqual([
      { role: 'Chargée de projet junior', entreprise: null, date_debut: null, date_fin: null, realisations: null },
    ])
  })

  // #3935 (lot P03, décision Louis 09/10) — « 2019 – 2021 » est GARDÉE à
  // l'année : la lecture rend « 2019 », jamais « 2019-01 » ni `null`.
  it('une année seule est GARDÉE à l’année, jamais complétée en mois', () => {
    expect(readExperiencesFromDetection('Chargée de projet junior |  | 2019 | 2021')).toEqual([
      { role: 'Chargée de projet junior', entreprise: null, date_debut: '2019', date_fin: '2021', realisations: null },
    ])
  })

  it('accepte MM/AAAA et une date complète', () => {
    const [read] = readExperiencesFromDetection(['Dev | ACME | 03/2020 | 2021-11-15 |'])
    expect(read?.date_debut).toBe('2020-03')
    expect(read?.date_fin).toBe('2021-11-15')
  })

  it('sait dire NON : une date qui n’est ni AAAA, ni un mois, ni un jour reste nulle', () => {
    const [read] = readExperiencesFromDetection(['Dev | ACME | 19 | 2019-13 |'])
    expect(read?.date_debut).toBeNull()
    expect(read?.date_fin).toBeNull()
  })

  it('sait dire NON : une ligne en texte libre ou sans rôle ni entreprise est ignorée', () => {
    expect(readExperiencesFromDetection(['2019-2021 — Chargée de projet junior.'])).toEqual([])
    expect(readExperiencesFromDetection([' |  | 2019-01 | 2020-01 | Rien qui la désigne'])).toEqual([])
    expect(readExperiencesFromDetection(null)).toEqual([])
    expect(readExperiencesFromDetection(12)).toEqual([])
  })
})

describe('#3935.2b — planExperienceWrites', () => {
  it('une expérience inconnue devient une ligne neuve, chaque champ lu en provenance model', () => {
    const plan = planExperienceWrites({ incoming: [exp()], existing: [], source: 'model' })
    expect(plan.inserts).toEqual([
      { values: exp(), provenance: { role: 'model', entreprise: 'model', date_debut: 'model' } },
    ])
    expect(plan.updates).toEqual([])
  })

  it('une correction humaine gagne toujours : un champ tenu par un humain n’est pas réécrit', () => {
    const plan = planExperienceWrites({
      incoming: [exp({ date_debut: '2023-01-01', realisations: 'Migration' })],
      existing: [
        {
          id: 'x1',
          values: exp({ role: 'cheffe de projet si', date_debut: '2022-09-01' }),
          provenance: { role: 'human', entreprise: 'human', date_debut: 'human' },
        },
      ],
      source: 'model',
    })
    expect(plan.inserts).toEqual([])
    // seul le champ VIDE (réalisations) se remplit ; la date humaine reste.
    expect(plan.updates).toEqual([
      { id: 'x1', patch: { realisations: 'Migration' }, provenance: { realisations: 'model' } },
    ])
  })

  it('une ligne antérieure sans provenance (inconnue) n’est jamais écrasée par le modèle', () => {
    const plan = planExperienceWrites({
      incoming: [exp({ date_debut: '2024-01-01' })],
      existing: [{ id: 'x2', values: exp({ date_debut: '2023-01-01' }), provenance: {} }],
      source: 'model',
    })
    expect(plan.updates).toEqual([])
    expect(plan.inserts).toEqual([])
  })

  it('une relecture plus récente du modèle met à jour ce que le modèle avait écrit', () => {
    const plan = planExperienceWrites({
      incoming: [exp({ date_fin: '2025-06-01' })],
      existing: [{ id: 'x3', values: exp({ date_fin: '2024-12-01' }), provenance: { date_fin: 'model' } }],
      source: 'model',
    })
    expect(plan.updates).toEqual([{ id: 'x3', patch: { date_fin: '2025-06-01' }, provenance: { date_fin: 'model' } }])
  })

  it('sait dire NON : une expérience lue deux fois n’est insérée qu’une fois, rien n’est retiré', () => {
    const plan = planExperienceWrites({
      incoming: [exp(), exp({ role: 'CHEFFE DE PROJET SI' })],
      existing: [{ id: 'other', values: exp({ role: 'Autre rôle' }), provenance: { role: 'human' } }],
      source: 'model',
    })
    expect(plan.inserts).toHaveLength(1)
    expect(plan.updates).toEqual([])
  })
})

describe('#3935 (lot P03) — une date d’expérience garde sa précision, du CV à l’écran', () => {
  it('stocke l’année au 1er janvier AVEC la précision `year`, le mois au 1er avec `month`', () => {
    expect(toStoredExperienceDate('2019')).toEqual({ date: '2019-01-01', precision: 'year' })
    expect(toStoredExperienceDate('2019-03')).toEqual({ date: '2019-03-01', precision: 'month' })
    expect(toStoredExperienceDate('2019-03-15')).toEqual({ date: '2019-03-15', precision: null })
    expect(toStoredExperienceDate(null)).toEqual({ date: null, precision: null })
  })

  it('relit le stockage dans la forme de la lecture — l’arbitre compare des valeurs de même précision', () => {
    expect(fromStoredExperienceDate('2019-01-01', 'year')).toBe('2019')
    expect(fromStoredExperienceDate('2019-03-01', 'month')).toBe('2019-03')
    expect(fromStoredExperienceDate('2019-03-15', null)).toBe('2019-03-15')
    expect(fromStoredExperienceDate(null, 'year')).toBeNull()
  })

  it('l’écran affiche « 2019 » pour une année, jamais un mois inventé', () => {
    expect(formatExperienceDate('2019-01-01', 'year')).toBe('2019')
    expect(formatExperienceDate('2019-03-01', 'month')).toBe('2019-03')
    // Sans précision (saisie à la main, ligne antérieure) : lue au mois, comme avant.
    expect(formatExperienceDate('2019-03-15', null)).toBe('2019-03')
    expect(formatExperienceDate(null, null)).toBeNull()
  })

  it('une lecture à l’année COMPLÈTE une date absente, jamais une date humaine', () => {
    const plan = planExperienceWrites({
      incoming: [exp({ date_debut: '2019', date_fin: '2021' })],
      existing: [
        {
          id: 'y1',
          values: exp({ date_debut: fromStoredExperienceDate('2018-06-01', null), date_fin: null }),
          provenance: { role: 'model', entreprise: 'model', date_debut: 'human' },
        },
      ],
      source: 'model',
    })
    expect(plan.updates).toEqual([{ id: 'y1', patch: { date_fin: '2021' }, provenance: { date_fin: 'model' } }])
  })
})
