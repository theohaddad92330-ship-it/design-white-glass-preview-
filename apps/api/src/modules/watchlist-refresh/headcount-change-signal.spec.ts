import { newSignalItems, signalItemsAcrossSources, type RegistrySignalRow } from './watchlist-refresh.queue'

/**
 * #3921 (R17 15/10) — aucune notification `headcount_change` sur 2 400 : la veille déduplique ses signaux par URL,
 * et toutes les lignes d'effectif d'un SIREN portaient la MÊME page d'entreprise. Le premier changement sonnait,
 * tous les suivants étaient déjà « vus ». Le jour d'observation est dans l'URL.
 */
const SIREN = '403355726'
const row = (day: string, label: string, url: string): RegistrySignalRow =>
  ({
    siren: SIREN,
    source: 'sirene',
    ref: `headcount:${day}`,
    kind: 'headcount_change',
    family_label: label,
    published_on: day,
    url,
  }) as RegistrySignalRow

describe('headcount_change — un second changement sonne aussi', () => {
  const NOW = new Date('2026-10-15T08:00:00Z')
  const first = row(
    '2026-10-14',
    'Effectif observé — 100 à 199 salariés',
    `https://annuaire-entreprises.data.gouv.fr/entreprise/${SIREN}#effectif-2026-10-14`,
  )
  const second = row(
    '2026-10-15',
    'Effectif observé — 200 à 249 salariés',
    `https://annuaire-entreprises.data.gouv.fr/entreprise/${SIREN}#effectif-2026-10-15`,
  )

  it('le deuxième changement est un signal NEUF', () => {
    const before = signalItemsAcrossSources({ recentSignals: [], registry: [first] }, NOW)
    const after = signalItemsAcrossSources({ recentSignals: [], registry: [first, second] }, NOW)
    expect(newSignalItems(before, after)).toHaveLength(1)
  })

  it('l’ancienne forme (même URL) le taisait — le témoin qui sait dire NON', () => {
    const page = `https://annuaire-entreprises.data.gouv.fr/entreprise/${SIREN}`
    const a = row('2026-10-14', 'Effectif observé — 100 à 199 salariés', page)
    const b = row('2026-10-15', 'Effectif observé — 200 à 249 salariés', page)
    const before = signalItemsAcrossSources({ recentSignals: [], registry: [a] }, NOW)
    const after = signalItemsAcrossSources({ recentSignals: [], registry: [a, b] }, NOW)
    expect(newSignalItems(before, after)).toHaveLength(0)
  })
})
