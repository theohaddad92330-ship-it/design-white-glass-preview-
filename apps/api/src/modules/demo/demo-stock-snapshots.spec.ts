import {
  METRIC_POPULATION_KEYS,
  METRIC_SNAPSHOT_DENOMINATOR,
  RITUAL_CATALOG,
  STOCK_METRIC_KEYS,
  detectRitualEffectiveness,
  metricDelta,
  metricSeriesDelta,
  monthsBackLastDay,
} from '@bellum/contracts'
import { DEMO_SNAPSHOT_MONTHS, demoStockSnapshotRows } from './demo-stock-snapshots'

/**
 * La salle de démonstration montre-t-elle VRAIMENT une variation ?
 *
 * C'est la seule question qui compte ici, et elle ne se vérifie pas en lisant
 * le jeu de données : elle se vérifie en faisant tourner la MÊME lecture que
 * l'écran (`metricDelta`) sur ce que le semis écrit. Un jeu de données correct
 * lu par une fonction qui répond « non mesuré » est un écran vide en réunion.
 */

const NOW = new Date('2026-08-15T09:00:00Z')

describe('la salle de démonstration porte assez de mois pour qu’une variation existe', () => {
  it('sème au moins DEUX mois — un seul ne produirait aucune variation', () => {
    // La borne dure du lot : sous deux photos, `metricDelta` répond
    // `no_previous_snapshot` sur tous les indicateurs.
    expect(DEMO_SNAPSHOT_MONTHS).toBeGreaterThanOrEqual(2)
  })

  it('écrit les neuf indicateurs pour CHAQUE mois', () => {
    const rows = demoStockSnapshotRows('ws-demo', NOW)
    expect(rows).toHaveLength(STOCK_METRIC_KEYS.length * DEMO_SNAPSHOT_MONTHS)

    const months = [...new Set(rows.map(row => row.takenOn))]
    expect(months).toHaveLength(DEMO_SNAPSHOT_MONTHS)
    for (const month of months) {
      expect(
        rows
          .filter(row => row.takenOn === month)
          .map(row => row.metricKey)
          .sort(),
      ).toEqual([...STOCK_METRIC_KEYS].sort())
    }
  })

  it('date la photo la plus récente du DERNIER JOUR DU MOIS ÉCOULÉ — comme le balayage', () => {
    // Si cette date diverge de celle du balayage mensuel, `baselineFor` ne
    // trouve rien et la salle redevient muette sans qu'aucun test ne rougisse.
    const rows = demoStockSnapshotRows('ws-demo', NOW)
    const mostRecent = rows
      .map(row => row.takenOn)
      .sort()
      .at(-1)
    expect(mostRecent).toBe(monthsBackLastDay(NOW, 1))
    expect(mostRecent).toBe('2026-07-31')
  })

  it('les dates sont CALCULÉES — elles suivent le mois du semis', () => {
    // Une date écrite en dur cesserait d'être « le mois dernier » au premier
    // changement de mois : la donnée périmerait, pas le code.
    const later = demoStockSnapshotRows('ws-demo', new Date('2026-11-03T09:00:00Z'))
    expect(
      later
        .map(row => row.takenOn)
        .sort()
        .at(-1),
    ).toBe('2026-10-31')
  })

  it('un prospect voit une VARIATION MESURÉE sur chaque indicateur, pas « non mesuré »', () => {
    // Le test qui vaut le chantier : on rejoue la lecture de l'écran.
    const rows = demoStockSnapshotRows('ws-demo', NOW)
    const previousMonth = monthsBackLastDay(NOW, 2).slice(0, 7)
    const lastMonth = monthsBackLastDay(NOW, 1).slice(0, 7)

    const unmeasured: string[] = []
    for (const key of STOCK_METRIC_KEYS) {
      const at = (month: string) => {
        const row = rows.find(r => r.metricKey === key && r.takenOn.startsWith(month))
        return row ? { month, value: row.value, denominator: row.denominator } : null
      }
      const delta = metricDelta({ unit: 'count', previous: at(previousMonth), current: at(lastMonth) })
      if (!delta.measured) unmeasured.push(`${key} → ${delta.gap}`)
    }
    expect(unmeasured).toEqual([])
  })

  it('n’INVENTE pas de population là où la production n’en lit aucune', () => {
    // Montrer « sur 40 » en démonstration pour un indicateur dont la dérivation
    // ne rend aucun total serait promettre une capacité qui n'existe pas.
    const rows = demoStockSnapshotRows('ws-demo', NOW)
    const wrong = rows.filter(
      row => METRIC_SNAPSHOT_DENOMINATOR[row.metricKey as never] === null && row.denominator !== null,
    )
    expect(wrong).toEqual([])
  })

  it('les populations semées sont cohérentes avec leur valeur — jamais un compte SUPÉRIEUR à sa population', () => {
    const rows = demoStockSnapshotRows('ws-demo', NOW)
    const impossible = rows.filter(row => row.denominator !== null && row.value > row.denominator)
    expect(impossible).toEqual([])
  })

  /**
   * Le second test qui vaut le chantier : les SIX POPULATIONS aussi.
   *
   * « Besoins ouverts », « missions actives » et « comptes suivis » ne sont pas
   * des clés de métrique — ce sont les DÉNOMINATEURS de trois lignes d'hygiène,
   * et c'est par là que les écrans les lisent depuis le 31/08/2026. Semer les
   * valeurs sans semer les populations rendrait donc « non mesuré » sur les
   * trois compteurs les plus visibles des maquettes, et personne ne le verrait
   * avant la réunion.
   */
  it('un prospect voit une variation MESURÉE sur chaque POPULATION, pas seulement sur les valeurs', () => {
    const rows = demoStockSnapshotRows('ws-demo', NOW)
    const response = {
      monthsCovered: DEMO_SNAPSHOT_MONTHS,
      series: STOCK_METRIC_KEYS.map(key => ({
        metricKey: key,
        unit: 'count' as const,
        points: rows
          .filter(row => row.metricKey === key)
          .map(row => ({
            month: row.takenOn.slice(0, 7),
            value: row.value,
            ...(row.denominator === null ? {} : { denominator: row.denominator }),
          })),
      })),
    }

    const unmeasured: string[] = []
    for (const population of METRIC_POPULATION_KEYS) {
      const delta = metricSeriesDelta(response, population)
      if (!delta.measured) unmeasured.push(`${population} → ${delta.gap}`)
    }
    expect(METRIC_POPULATION_KEYS.length).toBeGreaterThan(0)
    expect(unmeasured).toEqual([])
  })

  /**
   * #3298 reste (30/09/2026) : la recette prod n'a trouvé, en salle, aucun
   * rituel au verdict « Aucun effet mesurable depuis N mois ». Ce test rejoue
   * la MÊME lecture que l'écran (`RitualsPanel` → `GET /pilotage/rituals` →
   * `detectRitualEffectiveness`) sur ce que le semis écrit réellement, pour la
   * revue mensuelle — le seul rituel du catalogue qui observe un compteur de
   * stock (la revue trimestrielle ne `watch` rien).
   */
  it('la revue mensuelle affiche « aucun effet mesurable », prouvable en salle', () => {
    const rows = demoStockSnapshotRows('ws-demo', NOW)
    const series = STOCK_METRIC_KEYS.map(key => ({
      metricKey: key,
      unit: 'count' as const,
      points: rows
        .filter(row => row.metricKey === key)
        .map(row => ({ month: row.takenOn.slice(0, 7), value: row.value })),
    }))

    const monthly = RITUAL_CATALOG.find(ritual => ritual.key === 'monthly')
    if (!monthly) throw new Error('rituel `monthly` absent du catalogue')

    const report = detectRitualEffectiveness({ ritual: monthly, series, monthsCovered: DEMO_SNAPSHOT_MONTHS })

    expect(report?.verdict).toBe('no_measurable_effect')
    expect(report?.sinceMonth).not.toBeNull()

    const quarterly = RITUAL_CATALOG.find(ritual => ritual.key === 'quarterly')
    if (!quarterly) throw new Error('rituel `quarterly` absent du catalogue')
    // Confirme le constat du docblock : la trimestrielle n'observe rien, donc
    // ne peut jamais afficher ce verdict — la mensuelle est la seule route.
    expect(detectRitualEffectiveness({ ritual: quarterly, series, monthsCovered: DEMO_SNAPSHOT_MONTHS })).toBeNull()
  })
})
