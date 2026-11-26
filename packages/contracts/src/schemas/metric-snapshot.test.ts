import { describe, expect, it } from 'vitest'
import {
  DELTA_PERCENT_DECIMALS,
  DELTA_POINTS_DECIMALS,
  METRIC_POPULATION_KEYS,
  METRIC_POPULATION_SOURCE,
  METRIC_SNAPSHOT_DENOMINATOR,
  METRIC_SNAPSHOT_UNIT,
  METRICS_NOT_PHOTOGRAPHED,
  METRICS_READ_AS_POPULATIONS,
  METRIC_UNITS,
  PERCENT_MIN_BASE,
  metricDelta,
  metricPointAt,
  metricPopulationPoints,
  metricSeriesDelta,
  type MetricPoint,
  type MetricSeries,
  type MetricSeriesResponse,
} from './metric-snapshot.js'
import { STOCK_METRIC_KEYS } from './stock-snapshot.js'

/* ------------------------------------------------------------------ */
/*  Le premier mois n'a pas de delta — et ce n'est PAS une panne       */
/* ------------------------------------------------------------------ */

describe('un mois sans photo n’est pas un mois à zéro', () => {
  it('sans photo précédente, la variation est NON MESURÉE et le dit', () => {
    const delta = metricDelta({
      unit: 'count',
      previous: null,
      current: { month: '2026-08', value: 12 },
    })
    expect(delta.measured).toBe(false)
    // La raison est NOMMÉE : l'écran écrit « non mesuré », jamais « +0 % ».
    expect(delta.measured === false && delta.gap).toBe('no_previous_snapshot')
  })

  it('sans photo courante non plus', () => {
    const delta = metricDelta({
      unit: 'count',
      previous: { month: '2026-07', value: 10 },
      current: null,
    })
    expect(delta.measured === false && delta.gap).toBe('no_current_snapshot')
  })

  it('ne rend JAMAIS 0 ni +0 % quand elle ne sait pas', () => {
    // Le cœur du lot. Un écran qui lit `change` sur un delta non mesuré doit
    // trouver le champ ABSENT, pas un zéro qui se recopie.
    const delta = metricDelta({ unit: 'count', previous: null, current: null })
    expect(delta.measured).toBe(false)
    expect(delta).not.toHaveProperty('change')
    expect(delta).not.toHaveProperty('percent')
  })

  it('une valeur illisible vaut une photo ABSENTE, jamais zéro', () => {
    // `NaN` arrive d'un `Number(row.value)` sur une colonne corrompue. Le
    // traiter comme 0 afficherait « −100 % » sur un écran de direction.
    const delta = metricDelta({
      unit: 'count',
      previous: { month: '2026-07', value: Number.NaN },
      current: { month: '2026-08', value: 12 },
    })
    expect(delta.measured === false && delta.gap).toBe('no_previous_snapshot')
  })
})

/* ------------------------------------------------------------------ */
/*  Un zéro MESURÉ reste un zéro — la règle n'est pas « jamais 0 »     */
/* ------------------------------------------------------------------ */

describe('un zéro mesuré est vrai, et il s’affiche', () => {
  it('deux photos égales donnent une variation de zéro, MESURÉE', () => {
    // La règle du dépôt est « absence ≠ 0 », pas « jamais 0 ». Confondre les
    // deux ferait disparaître une stabilité réelle, qui est une information.
    const delta = metricDelta({
      unit: 'count',
      previous: { month: '2026-07', value: 10 },
      current: { month: '2026-08', value: 10 },
    })
    expect(delta.measured).toBe(true)
    expect(delta.measured === true && delta.change).toBe(0)
    expect(delta.measured === true && delta.percent).toBe(0)
  })
})

/* ------------------------------------------------------------------ */
/*  Les trois unités de lecture                                        */
/* ------------------------------------------------------------------ */

describe('un dénombrement', () => {
  it('rend la variation absolue ET sa part relative', () => {
    const delta = metricDelta({
      unit: 'count',
      previous: { month: '2026-07', value: 10 },
      current: { month: '2026-08', value: 12 },
    })
    expect(delta).toEqual({
      measured: true,
      changeUnit: 'count',
      change: 2,
      percent: 20,
      from: { month: '2026-07', value: 10 },
      to: { month: '2026-08', value: 12 },
    })
  })

  it('une base à zéro n’a PAS de variation relative — `null`, jamais +∞ ni 500 %', () => {
    // Passer de 0 à 5 n'est pas « +500 % » : la division est impossible. La
    // variation ABSOLUE, elle, est parfaitement mesurée — d'où `measured: true`
    // avec un `percent` nul. C'est la distinction que ce lot existe pour tenir.
    const delta = metricDelta({
      unit: 'count',
      previous: { month: '2026-07', value: 0 },
      current: { month: '2026-08', value: 5 },
    })
    expect(delta.measured).toBe(true)
    expect(delta.measured === true && delta.change).toBe(5)
    expect(delta.measured === true && delta.percent).toBeNull()
  })

  it('une baisse est négative des deux côtés', () => {
    const delta = metricDelta({
      unit: 'count',
      previous: { month: '2026-07', value: 20 },
      current: { month: '2026-08', value: 15 },
    })
    expect(delta.measured === true && delta.change).toBe(-5)
    expect(delta.measured === true && delta.percent).toBe(-25)
  })
})

describe('un montant', () => {
  it('se lit en centimes, et sa part relative se calcule pareil', () => {
    const delta = metricDelta({
      unit: 'money_cents',
      previous: { month: '2026-07', value: 1_000_00 },
      current: { month: '2026-08', value: 1_124_00 },
    })
    expect(delta.measured === true && delta.changeUnit).toBe('money_cents')
    expect(delta.measured === true && delta.change).toBe(12_400)
    expect(delta.measured === true && delta.percent).toBe(12.4)
  })

  it('une base NÉGATIVE se rapporte à sa VALEUR ABSOLUE', () => {
    // Une marge peut être négative. Diviser par −100 inverserait le signe de la
    // variation : passer de −100 € à −50 € est une AMÉLIORATION, et doit se
    // lire « +50 % », jamais « −50 % ».
    const delta = metricDelta({
      unit: 'money_cents',
      previous: { month: '2026-07', value: -100_00 },
      current: { month: '2026-08', value: -50_00 },
    })
    expect(delta.measured === true && delta.change).toBe(5_000)
    expect(delta.measured === true && delta.percent).toBe(50)
  })
})

describe('un taux', () => {
  // ⚠️ Le modèle : `value` porte le TAUX déjà calculé (0-100), `denominator`
  // porte la POPULATION sur laquelle il a été calculé. C'est la forme qui
  // convient aux deux familles de taux du dépôt — celui qui se dérive d'un
  // couple compté (`count`/`total` de la vue Qualité) ET celui qu'une
  // dérivation rend déjà en pourcentage avec sa taille d'échantillon
  // (`aggregateMargin` → `marginPercent` + `measured`). Stocker un numérateur
  // aurait exclu le second.
  it('se lit en POINTS, jamais en pourcentage de pourcentage', () => {
    // « +3,1 pts vs N-1 » de la maquette. Dire « +10 % » pour un taux passé de
    // 30 % à 33 % serait une seconde affirmation, et fausse à la lecture.
    const delta = metricDelta({
      unit: 'ratio',
      previous: { month: '2025-07', value: 30, denominator: 100 },
      current: { month: '2026-07', value: 33.1, denominator: 100 },
    })
    expect(delta.measured === true && delta.changeUnit).toBe('points')
    expect(delta.measured === true && delta.change).toBe(3.1)
    // Aucune part relative sur un taux : elle n'a pas de lecture honnête.
    expect(delta.measured === true && delta.percent).toBeNull()
  })

  it('compare les TAUX même quand les populations diffèrent', () => {
    // La population passe de 120 à 100 : le taux reste comparable, et c'est
    // bien la variation en points qu'on lit. Le dénominateur voyage pour que
    // l'écran puisse dire « calculé sur 100 », pas pour refaire la division.
    const delta = metricDelta({
      unit: 'ratio',
      previous: { month: '2026-07', value: 25, denominator: 120 },
      current: { month: '2026-08', value: 33, denominator: 100 },
    })
    expect(delta.measured === true && delta.change).toBe(8)
    expect(delta.measured === true && delta.to).toEqual({ month: '2026-08', value: 33, denominator: 100 })
  })

  it('sans dénominateur, le taux vaut `null` — jamais 0 %', () => {
    const delta = metricDelta({
      unit: 'ratio',
      previous: { month: '2026-07', value: 30, denominator: null },
      current: { month: '2026-08', value: 33, denominator: 100 },
    })
    expect(delta.measured === false && delta.gap).toBe('denominator_missing')
  })

  it('un dénominateur à ZÉRO n’est pas un taux de 0 % — c’est une population vide', () => {
    // « 0 % de marge sur 0 mission » n'est pas une mesure : c'est l'absence de
    // mesure, et l'afficher comme une chute serait un mensonge.
    const delta = metricDelta({
      unit: 'ratio',
      previous: { month: '2026-07', value: 0, denominator: 0 },
      current: { month: '2026-08', value: 33, denominator: 100 },
    })
    expect(delta.measured === false && delta.gap).toBe('denominator_missing')
  })
})

/* ------------------------------------------------------------------ */
/*  L'ordre des périodes                                               */
/* ------------------------------------------------------------------ */

describe('l’ordre des deux photos', () => {
  it('deux photos dans le désordre ne produisent PAS une variation inversée', () => {
    // Le piège silencieux : intervertir les arguments donne un chiffre juste au
    // signe près, que rien à l'écran ne permet de repérer.
    const delta = metricDelta({
      unit: 'count',
      previous: { month: '2026-08', value: 12 },
      current: { month: '2026-07', value: 10 },
    })
    expect(delta.measured === false && delta.gap).toBe('periods_not_ordered')
  })

  it('deux photos du MÊME mois ne se comparent pas non plus', () => {
    const delta = metricDelta({
      unit: 'count',
      previous: { month: '2026-08', value: 12 },
      current: { month: '2026-08', value: 12 },
    })
    expect(delta.measured === false && delta.gap).toBe('periods_not_ordered')
  })

  it('accepte une comparaison à N-1 (douze mois d’écart)', () => {
    const delta = metricDelta({
      unit: 'count',
      previous: { month: '2025-07', value: 10 },
      current: { month: '2026-07', value: 11 },
    })
    expect(delta.measured).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/*  La précision vit DANS le contrat                                   */
/* ------------------------------------------------------------------ */

describe('la précision', () => {
  it('les décimales sont déclarées ici, et pas recopiées dans un service', () => {
    expect(DELTA_PERCENT_DECIMALS).toBe(1)
    expect(DELTA_POINTS_DECIMALS).toBe(1)
  })

  it('arrondit à une décimale, sans fausse précision', () => {
    const delta = metricDelta({
      unit: 'count',
      previous: { month: '2026-07', value: 30 },
      current: { month: '2026-08', value: 40 },
    })
    // 33,333… % → 33,3 %
    expect(delta.measured === true && delta.percent).toBe(33.3)
  })

  // Recette 14/10 : « contacts sans adresse +2612 % » (8 → 217). Un pourcentage contre une base
  // quasi nulle ne veut rien dire : sous COUNT_PERCENT_MIN_BASE le delta reste ABSOLU.
  it('un compteur dont la base est < 10 ne porte pas de pourcentage — le delta absolu reste', () => {
    const delta = metricDelta({
      unit: 'count',
      previous: { month: '2026-07', value: 8 },
      current: { month: '2026-08', value: 217 },
    })
    expect(delta.measured === true && delta.change).toBe(209)
    expect(delta.measured === true && delta.percent).toBeNull()
  })

  it('à 10 de base, le pourcentage revient', () => {
    const delta = metricDelta({
      unit: 'count',
      previous: { month: '2026-07', value: 10 },
      current: { month: '2026-08', value: 15 },
    })
    expect(delta.measured === true && delta.percent).toBe(50)
  })
})

/* ------------------------------------------------------------------ */
/*  La lecture d'une série                                             */
/* ------------------------------------------------------------------ */

describe('retrouver un point dans une série', () => {
  const series: MetricPoint[] = [
    { month: '2026-06', value: 8 },
    { month: '2026-07', value: 10 },
    { month: '2026-08', value: 12 },
  ]

  it('rend le point du mois demandé', () => {
    expect(metricPointAt(series, '2026-07')).toEqual({ month: '2026-07', value: 10 })
  })

  it('rend `null` — jamais un point voisin — quand le mois manque', () => {
    // Servir la photo de juin sous le libellé « juillet » serait un chiffre
    // juste sur une question qu'on n'a pas posée.
    expect(metricPointAt(series, '2026-05')).toBeNull()
  })

  it('rend `null` sur une série vide', () => {
    expect(metricPointAt([], '2026-07')).toBeNull()
  })
})

/* ------------------------------------------------------------------ */
/*  La garde LIT quelque chose                                         */
/* ------------------------------------------------------------------ */

describe('le registre des unités', () => {
  it('n’est pas vide, et couvre les trois lectures du produit', () => {
    expect([...METRIC_UNITS]).toEqual(['count', 'money_cents', 'ratio'])
  })
})

/* ------------------------------------------------------------------ */
/*  Les POPULATIONS lues comme des séries à part entière               */
/* ------------------------------------------------------------------ */

describe('une population photographiée se lit comme une série', () => {
  const series: MetricSeries = {
    metricKey: 'needs_without_skills',
    unit: 'count',
    points: [
      { month: '2026-06', value: 6, denominator: 11 },
      { month: '2026-07', value: 5, denominator: 12 },
      { month: '2026-08', value: 4, denominator: 13 },
    ],
  }

  it('rend un point par mois, la POPULATION en valeur', () => {
    expect(metricPopulationPoints(series)).toEqual([
      { month: '2026-06', value: 11 },
      { month: '2026-07', value: 12 },
      { month: '2026-08', value: 13 },
    ])
  })

  it('un point de population ne porte AUCUN dénominateur — une population n’est la part de rien', () => {
    for (const point of metricPopulationPoints(series)) {
      expect(point.denominator).toBeUndefined()
    }
  })

  it('un mois sans population est ABSENT, jamais un zéro', () => {
    // Le cœur de la règle : `denominator` non lu vaut `undefined`, et
    // `Number(undefined)` vaudrait `NaN` quand `?? 0` vaudrait 0. Ni l'un ni
    // l'autre : le mois SORT de la série.
    const partial: MetricSeries = {
      metricKey: 'needs_without_skills',
      unit: 'count',
      points: [
        { month: '2026-06', value: 6 },
        { month: '2026-07', value: 5, denominator: 12 },
      ],
    }
    expect(metricPopulationPoints(partial)).toEqual([{ month: '2026-07', value: 12 }])
  })

  it('rend une série vide — jamais une exception — quand la métrique n’a pas été photographiée', () => {
    expect(metricPopulationPoints(null)).toEqual([])
    expect(metricPopulationPoints(undefined)).toEqual([])
  })

  it('chaque population NOMMÉE désigne une métrique réellement photographiée', () => {
    expect(METRIC_POPULATION_KEYS.length).toBeGreaterThan(0)
    for (const key of METRIC_POPULATION_KEYS) {
      const source = METRIC_POPULATION_SOURCE[key]
      expect(STOCK_METRIC_KEYS).toContain(source)
      // Et sa métrique porte bien une population : une population tirée d'une
      // métrique sans dénominateur ne serait jamais servie.
      expect(METRIC_SNAPSHOT_DENOMINATOR[source]).not.toBeNull()
    }
  })

  it('deux populations ne désignent JAMAIS la même métrique — ce serait deux noms pour un chiffre', () => {
    const sources = METRIC_POPULATION_KEYS.map(key => METRIC_POPULATION_SOURCE[key])
    expect(new Set(sources).size).toBe(sources.length)
  })

  it('le registre « lu comme une population » ne désigne que des populations qui existent', () => {
    expect(METRICS_READ_AS_POPULATIONS.length).toBeGreaterThan(0)
    for (const entry of METRICS_READ_AS_POPULATIONS) {
      expect(METRIC_POPULATION_KEYS).toContain(entry.population)
    }
  })

  it('rien n’est à la fois « non photographié » et lisible comme une population', () => {
    // Le défaut que ce lot corrige : trois compteurs étaient déclarés NON
    // photographiés alors que la base les écrivait tous les mois. Deux registres
    // qui se contredisent valent moins que pas de registre.
    const unavailable = new Set(METRICS_NOT_PHOTOGRAPHED.map(entry => entry.label))
    for (const entry of METRICS_READ_AS_POPULATIONS) {
      expect(unavailable.has(entry.label)).toBe(false)
    }
  })
})

/* ------------------------------------------------------------------ */
/*  Les quatre stocks de TRAVAIL, entrés le 31/08/2026                 */
/* ------------------------------------------------------------------ */

describe('les registres couvrent CHAQUE clé photographiée', () => {
  const WORK_KEYS = ['needs_without_positioning', 'timesheets_to_validate', 'invoices_ready', 'talents_available']

  it('les quatre stocks de travail sont bien dans la taxonomie, EN FIN', () => {
    expect(STOCK_METRIC_KEYS.slice(-4)).toEqual(WORK_KEYS)
  })

  it('chacune porte son unité et son DÉNOMINATEUR — un compteur nu se lit à l’envers', () => {
    for (const key of WORK_KEYS as (typeof STOCK_METRIC_KEYS)[number][]) {
      expect(METRIC_SNAPSHOT_UNIT[key]).toBe('count')
      // « 7 besoins orphelins » monte quand le portefeuille grandit ; « 7 sur
      // 41 » dit que la qualité s'améliore. Sans population, la hausse ment.
      expect(METRIC_SNAPSHOT_DENOMINATOR[key]).not.toBeNull()
    }
  })

  it('aucune clé photographiée n’échappe aux deux registres', () => {
    for (const key of STOCK_METRIC_KEYS) {
      expect(METRIC_SNAPSHOT_UNIT[key]).toBeDefined()
      // `undefined` ≠ `null` : le premier est un OUBLI, le second un choix écrit.
      expect(METRIC_SNAPSHOT_DENOMINATOR[key]).not.toBeUndefined()
    }
  })
})

/* ------------------------------------------------------------------ */
/*  LA lecture des écrans : une réponse de série → une variation       */
/* ------------------------------------------------------------------ */

describe('metricSeriesDelta — la seule porte que les écrans appellent', () => {
  const response: MetricSeriesResponse = {
    monthsCovered: 3,
    series: [
      {
        metricKey: 'accounts_without_next_action',
        unit: 'count',
        points: [
          { month: '2026-06', value: 11, denominator: 34 },
          { month: '2026-07', value: 9, denominator: 38 },
          { month: '2026-08', value: 5, denominator: 42 },
        ],
      },
    ],
  }

  it('compare la photo la plus récente à celle du mois précédent', () => {
    const delta = metricSeriesDelta(response, 'accounts_without_next_action')
    expect(delta.measured).toBe(true)
    expect(delta.measured === true && delta.change).toBe(-4)
    expect(delta.measured === true && delta.changeUnit).toBe('count')
  })

  it('porte la POPULATION de la photo comparée — « 5 sur 42 »', () => {
    const delta = metricSeriesDelta(response, 'accounts_without_next_action')
    expect(delta.measured === true && delta.to.denominator).toBe(42)
    expect(delta.measured === true && delta.from.denominator).toBe(38)
  })

  it('remonte de N mois quand on le demande — « vs N-1 » est le même appel', () => {
    const delta = metricSeriesDelta(response, 'accounts_without_next_action', { months: 2 })
    expect(delta.measured === true && delta.change).toBe(-6)
    expect(delta.measured === true && delta.from.month).toBe('2026-06')
  })

  it('ne se rabat JAMAIS sur un mois voisin — le mois manquant rend « non mesuré »', () => {
    const delta = metricSeriesDelta(response, 'accounts_without_next_action', { months: 5 })
    expect(delta.measured === false && delta.gap).toBe('no_previous_snapshot')
  })

  it('une métrique jamais photographiée rend « aucune photo courante », pas zéro', () => {
    const delta = metricSeriesDelta(response, 'missions_without_cost')
    expect(delta.measured === false && delta.gap).toBe('no_current_snapshot')
  })

  it('une réponse absente ne lève pas — elle rend « non mesuré »', () => {
    expect(metricSeriesDelta(null, 'benchAvailable').measured).toBe(false)
    expect(metricSeriesDelta(undefined, 'benchAvailable').measured).toBe(false)
  })

  it('lit une POPULATION sous son propre nom, sans que l’écran sache d’où elle sort', () => {
    // « comptes suivis » est le dénominateur d'`accounts_without_next_action`.
    // L'écran demande `followed_accounts` ; il n'a pas à connaître ce couplage,
    // et c'est exactement ce que ce registre achète.
    const delta = metricSeriesDelta(response, 'followed_accounts')
    expect(delta.measured === true && delta.change).toBe(4)
    expect(delta.measured === true && delta.changeUnit).toBe('count')
    // Une population n'est la part de rien : aucun dénominateur sur ses points.
    expect(delta.measured === true && delta.to.denominator).toBeUndefined()
  })

  it('l’ordre des points ne dépend pas du serveur — la série est triée avant lecture', () => {
    const shuffled: MetricSeriesResponse = {
      monthsCovered: 2,
      series: [
        {
          metricKey: 'benchAvailable',
          unit: 'count',
          points: [
            { month: '2026-08', value: 3 },
            { month: '2026-07', value: 2 },
          ],
        },
      ],
    }
    const delta = metricSeriesDelta(shuffled, 'benchAvailable')
    expect(delta.measured === true && delta.change).toBe(1)
    expect(delta.measured === true && delta.to.month).toBe('2026-08')
  })

  it('le décalage de mois passe le 31 janvier — l’arithmétique naïve donnerait mars', () => {
    const janvier: MetricSeriesResponse = {
      monthsCovered: 2,
      series: [
        {
          metricKey: 'benchAvailable',
          unit: 'count',
          points: [
            { month: '2026-01', value: 4 },
            { month: '2026-02', value: 6 },
          ],
        },
      ],
    }
    const delta = metricSeriesDelta(janvier, 'benchAvailable')
    expect(delta.measured === true && delta.from.month).toBe('2026-01')
    expect(delta.measured === true && delta.change).toBe(2)
  })

  it('lit l’unité de la SÉRIE, jamais celle du registre — un taux se rend en points', () => {
    // Relire le registre ici serait une seconde dérivation de la même question,
    // et c'est exactement ce qui s'est passé à la première version : une série
    // servie en `ratio` était lue en `count`, donc rendue en POURCENTAGE.
    const taux: MetricSeriesResponse = {
      monthsCovered: 2,
      series: [
        {
          metricKey: 'invoices_ready',
          unit: 'ratio',
          points: [
            { month: '2026-07', value: 30, denominator: 10 },
            { month: '2026-08', value: 33, denominator: 12 },
          ],
        },
      ],
    }
    const delta = metricSeriesDelta(taux, 'invoices_ready')
    expect(delta.measured === true && delta.changeUnit).toBe('points')
    expect(delta.measured === true && delta.change).toBe(3)
    expect(delta.measured === true && delta.percent).toBeNull()
  })

  it('une POPULATION reste un DÉNOMBREMENT, même tirée d’une série en taux', () => {
    // « sur 42 » compte des comptes, jamais des pour-cent.
    const taux: MetricSeriesResponse = {
      monthsCovered: 2,
      series: [
        {
          metricKey: 'needs_without_skills',
          unit: 'ratio',
          points: [
            { month: '2026-07', value: 30, denominator: 12 },
            { month: '2026-08', value: 33, denominator: 13 },
          ],
        },
      ],
    }
    const delta = metricSeriesDelta(taux, 'open_needs')
    expect(delta.measured === true && delta.changeUnit).toBe('count')
    expect(delta.measured === true && delta.change).toBe(1)
  })

  it('un `months` absurde se ramène à un mois, il ne lève pas', () => {
    expect(metricSeriesDelta(response, 'accounts_without_next_action', { months: 0 }).measured).toBe(true)
    expect(metricSeriesDelta(response, 'accounts_without_next_action', { months: -3 }).measured).toBe(true)
  })
})

describe('#4191 G3 — jamais de pourcentage contre une base quasi nulle', () => {
  const count = (from: number, to: number) =>
    metricDelta({
      unit: 'count',
      previous: { month: '2026-07', value: from },
      current: { month: '2026-08', value: to },
    })

  it('le seuil est UN export du contrat, à 10', () => {
    expect(PERCENT_MIN_BASE).toBe(10)
  })

  it('base 0 : l’écart absolu, aucun pourcentage (jamais +∞)', () => {
    const delta = count(0, 281)
    expect(delta.measured === true && delta.change).toBe(281)
    expect(delta.measured === true && delta.percent).toBeNull()
  })

  it('base 3 : l’écart absolu signé parle, le pourcentage se tait (+2812 % n’existe plus)', () => {
    const delta = count(3, 87)
    expect(delta.measured === true && delta.change).toBe(84)
    expect(delta.measured === true && delta.percent).toBeNull()
  })

  it('base 50 : le pourcentage existe', () => {
    const delta = count(50, 75)
    expect(delta.measured === true && delta.percent).toBe(50)
  })
})
