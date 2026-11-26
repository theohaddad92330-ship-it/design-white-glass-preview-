/**
 * GARDE — les canaux d'entrée (#2048) et les unités comparables (#2049).
 *
 * #2049.14 est LA doctrine de ce lot : **aucun taux ne se calcule sans
 * dénominateur fiable**, et « non mesuré » n'est JAMAIS « 0 ». Le corollaire,
 * #2048.21 : « non mesuré » est un TROISIÈME SEAU, pas un zéro, pas un « non ».
 *
 * Ce que cette garde rend impossible :
 *  - un canal absent de la réponse compté comme « pas utilisé » (l'absence
 *    d'une réponse n'est pas un refus) ;
 *  - un seau qui avale un autre — les quatre seaux s'ADDITIONNENT jusqu'au
 *    catalogue, exactement comme les quatre seaux de couverture (GA-259) ;
 *  - un taux calculé sans période explicite, sur une unité que l'ESN ne compte
 *    pas, ou entre deux unités qui ne se comparent pas (#2049.12) ;
 *  - une rupture d'entonnoir rendue en POURCENTAGE inventé plutôt que NOMMÉE
 *    (#2049.15, doctrine « aucune probabilité »).
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CANAUX_ANSWER_FIELDS,
  ENTRY_CHANNELS,
  ENTRY_CHANNEL_VALUES,
  channelAuditBuckets,
  type ChannelAuditInput,
} from './answers-canaux.js'
import {
  ACTIVITY_MEASURES,
  ACTIVITY_REFERENCE_PERIODS,
  ORDER_OF_MAGNITUDE_PERIOD,
  activityPeriodIsExplicit,
  comparableRate,
  funnelBreak,
} from './answers-mesures.js'

describe('canaux + mesures — le corpus est lu', () => {
  it('porte les quinze canaux d’entrée (onze #2048 + quatre #2044.2/.3/.5/.6) et les onze unités (une garde qui itère sur du vide est verte et borgne)', () => {
    expect(ENTRY_CHANNELS.length).toBe(15)
    expect(ENTRY_CHANNEL_VALUES.length).toBe(ENTRY_CHANNELS.length)
    expect(ACTIVITY_MEASURES.length).toBe(11)
  })

  it('ne nomme jamais deux fois le même canal ni la même unité', () => {
    expect(new Set(ENTRY_CHANNEL_VALUES).size).toBe(ENTRY_CHANNEL_VALUES.length)
    expect(new Set(ACTIVITY_MEASURES.map(m => m.value)).size).toBe(ACTIVITY_MEASURES.length)
  })

  it('range les unités dans un ordre d’entonnoir strict, sans trou (#2049.12)', () => {
    expect(ACTIVITY_MEASURES.map(m => m.funnelRank)).toEqual(
      [...Array(ACTIVITY_MEASURES.length).keys()].map(i => i + 1),
    )
  })

  it('donne à chaque unité un NOM d’unité qui lui est propre (#2049.12 — quatre unités ne se mélangent pas)', () => {
    const units = ACTIVITY_MEASURES.map(m => m.unit)
    expect(new Set(units).size).toBe(units.length)
  })

  it('rattache les trois volumes DÉJÀ posés à leur canal, et ne les repose pas (#2048.14, GA-26)', () => {
    const withVolume = ENTRY_CHANNELS.filter(c => c.volumeAnswerKey !== null)
    expect(withVolume.map(c => c.volumeAnswerKey)).toEqual(['weekly_calls', 'weekly_emails', 'weekly_linkedin'])
    // Douze canaux sur quinze n'ont AUCUN volume mesuré aujourd'hui : c'est le
    // constat que le troisième seau existe pour dire, pas un zéro.
    expect(ENTRY_CHANNELS.length - withVolume.length).toBe(12)
  })

  it('sait accueillir la PÉRIODE par canal (#2048.13) — un cinquième tableau, jamais deviné', () => {
    const schema = CANAUX_ANSWER_FIELDS.entry_channels_period
    expect(schema.safeParse(['Appels sortants', 'Demandes entrantes']).success).toBe(true)
    // Absente reste absente : un canal sans réponse ici n'a pas de période
    // "inconnue" écrite à sa place, il n'a simplement AUCUNE entrée.
    expect(schema.safeParse(undefined).success).toBe(true)
  })
})

describe('#2048.21 — « non mesuré » est un troisième seau, jamais un zéro', () => {
  const partition = (input: ChannelAuditInput): number => {
    const b = channelAuditBuckets(input)
    return b.measured.length + b.usedNotMeasured.length + b.notUsed.length + b.unanswered.length
  }

  it('additionne les quatre seaux jusqu’au catalogue, quelle que soit la réponse', () => {
    expect(partition({})).toBe(ENTRY_CHANNEL_VALUES.length)
    expect(partition({ entry_channels_used: [] })).toBe(ENTRY_CHANNEL_VALUES.length)
    expect(partition({ entry_channels_used: [ENTRY_CHANNEL_VALUES[0]] })).toBe(ENTRY_CHANNEL_VALUES.length)
    expect(
      partition({ entry_channels_used: [...ENTRY_CHANNEL_VALUES], entry_channels_measured: [ENTRY_CHANNEL_VALUES[1]] }),
    ).toBe(ENTRY_CHANNEL_VALUES.length)
  })

  it('ne range RIEN dans « pas utilisé » tant que la question n’a pas de réponse', () => {
    const buckets = channelAuditBuckets({})
    expect(buckets.notUsed).toEqual([])
    expect(buckets.measured).toEqual([])
    expect(buckets.usedNotMeasured).toEqual([])
    expect(buckets.unanswered).toEqual([...ENTRY_CHANNEL_VALUES])
  })

  it('range un canal utilisé mais sans chiffre dans « non mesuré », jamais dans « pas utilisé »', () => {
    const used = ENTRY_CHANNEL_VALUES[4]
    const buckets = channelAuditBuckets({ entry_channels_used: [used] })
    expect(buckets.usedNotMeasured).toContain(used)
    expect(buckets.notUsed).not.toContain(used)
    expect(buckets.measured).not.toContain(used)
  })

  it('compte comme MESURÉ un canal dont le volume est déjà posé ailleurs (#2048.14, GA-26)', () => {
    const calls = ENTRY_CHANNELS.find(c => c.volumeAnswerKey === 'weekly_calls')
    expect(calls).toBeDefined()
    const buckets = channelAuditBuckets({ entry_channels_used: [calls!.value], weekly_calls: '21-50' })
    expect(buckets.measured).toEqual([calls!.value])
    expect(buckets.usedNotMeasured).toEqual([])
  })

  it('ne compte PAS comme mesuré un volume vide (témoin — un champ vide n’est pas une mesure)', () => {
    const calls = ENTRY_CHANNELS.find(c => c.volumeAnswerKey === 'weekly_calls')!
    const buckets = channelAuditBuckets({ entry_channels_used: [calls.value], weekly_calls: '' })
    expect(buckets.usedNotMeasured).toEqual([calls.value])
  })

  it('ignore une valeur hors catalogue plutôt que de gonfler un seau (saisie libre)', () => {
    const buckets = channelAuditBuckets({ entry_channels_used: ['Un canal que le catalogue ne connaît pas'] })
    expect(buckets.measured.concat(buckets.usedNotMeasured)).toEqual([])
    expect(buckets.unanswered).toEqual([])
    expect(buckets.notUsed).toEqual([...ENTRY_CHANNEL_VALUES])
  })
})

describe('#2044.2 / #2044.3 / #2044.5 / #2044.6 — on AJOUTE, on ne renomme pas', () => {
  it('ajoute les quatre voies manquantes SANS toucher à la valeur fusionnée historique', () => {
    expect(ENTRY_CHANNEL_VALUES).toContain('Réseau personnel et anciens clients')
    expect(ENTRY_CHANNEL_VALUES).toContain('Anciens clients')
    expect(ENTRY_CHANNEL_VALUES).toContain('Anciens collègues')
    expect(ENTRY_CHANNEL_VALUES).toContain('Recommandation')
    expect(ENTRY_CHANNEL_VALUES).toContain('Prospection directe')
  })

  it('les ajoute EN FIN de catalogue, jamais au milieu (GA-08)', () => {
    expect(ENTRY_CHANNEL_VALUES.slice(-4)).toEqual([
      'Anciens clients',
      'Anciens collègues',
      'Recommandation',
      'Prospection directe',
    ])
  })

  it('une réponse historique qui cite la valeur fusionnée reste lisible par channelAuditBuckets', () => {
    const buckets = channelAuditBuckets({ entry_channels_used: ['Réseau personnel et anciens clients'] })
    expect(buckets.usedNotMeasured).toContain('Réseau personnel et anciens clients')
    expect(buckets.notUsed).not.toContain('Réseau personnel et anciens clients')
  })
})

describe('#2049.13 — une donnée sans période est un ordre de grandeur', () => {
  it('reconnaît la valeur « ordre de grandeur » comme un choix RÉEL du catalogue (témoin)', () => {
    expect(ACTIVITY_REFERENCE_PERIODS).toContain(ORDER_OF_MAGNITUDE_PERIOD)
  })

  it('refuse l’absence, le vide et l’ordre de grandeur, accepte une période nommée', () => {
    expect(activityPeriodIsExplicit(null)).toBe(false)
    expect(activityPeriodIsExplicit(undefined)).toBe(false)
    expect(activityPeriodIsExplicit('   ')).toBe(false)
    expect(activityPeriodIsExplicit(ORDER_OF_MAGNITUDE_PERIOD)).toBe(false)
    expect(activityPeriodIsExplicit(ACTIVITY_REFERENCE_PERIODS[0])).toBe(true)
  })
})

describe('#2049.14 — aucun taux sans dénominateur fiable', () => {
  const tracked = ACTIVITY_MEASURES.map(m => m.value)
  const period = ACTIVITY_REFERENCE_PERIODS[0]
  const contacts = ACTIVITY_MEASURES[1].value
  const replies = ACTIVITY_MEASURES[2].value

  it('rend le taux quand la période est explicite, les deux unités suivies, le dénominateur réel', () => {
    const out = comparableRate(
      { activity_measures_tracked: tracked, activity_reference_period: period },
      { measure: replies, value: 12 },
      { measure: contacts, value: 48 },
    )
    expect(out).toEqual({ rate: 0.25, refusal: null, missing: [] })
  })

  it('n’ARRONDIT pas — arrondir est une décision d’affichage', () => {
    const out = comparableRate(
      { activity_measures_tracked: tracked, activity_reference_period: period },
      { measure: replies, value: 1 },
      { measure: contacts, value: 3 },
    )
    expect(out.rate).toBeCloseTo(1 / 3, 12)
  })

  it('rend BIEN 0 pour un numérateur nul sur un dénominateur réel (témoin — un zéro vrai est une mesure)', () => {
    const out = comparableRate(
      { activity_measures_tracked: tracked, activity_reference_period: period },
      { measure: replies, value: 0 },
      { measure: contacts, value: 48 },
    )
    expect(out.rate).toBe(0)
    expect(out.refusal).toBeNull()
  })

  it('refuse sans période explicite, et NOMME le refus', () => {
    const out = comparableRate(
      { activity_measures_tracked: tracked, activity_reference_period: ORDER_OF_MAGNITUDE_PERIOD },
      { measure: replies, value: 12 },
      { measure: contacts, value: 48 },
    )
    expect(out).toEqual({ rate: null, refusal: 'period_not_explicit', missing: [] })
  })

  it('refuse quand une des deux unités n’est pas comptée, et dit LAQUELLE', () => {
    const out = comparableRate(
      { activity_measures_tracked: [replies], activity_reference_period: period },
      { measure: replies, value: 12 },
      { measure: contacts, value: 48 },
    )
    expect(out.rate).toBeNull()
    expect(out.refusal).toBe('unit_not_tracked')
    expect(out.missing).toEqual([contacts])
  })

  it('refuse un dénominateur absent ou nul — jamais un « 0 % » fabriqué', () => {
    const base = { activity_measures_tracked: tracked, activity_reference_period: period }
    expect(comparableRate(base, { measure: replies, value: 12 }, { measure: contacts, value: null })).toEqual({
      rate: null,
      refusal: 'denominator_not_measured',
      missing: [contacts],
    })
    expect(comparableRate(base, { measure: replies, value: 12 }, { measure: contacts, value: 0 }).refusal).toBe(
      'denominator_not_measured',
    )
  })

  it('refuse un numérateur absent — un terme non lu fait une opinion, pas un taux', () => {
    const out = comparableRate(
      { activity_measures_tracked: tracked, activity_reference_period: period },
      { measure: replies, value: null },
      { measure: contacts, value: 48 },
    )
    expect(out.rate).toBeNull()
    expect(out.refusal).toBe('numerator_not_measured')
    expect(out.missing).toEqual([replies])
  })

  it('refuse de comparer deux unités qui ne se comparent pas (#2049.12)', () => {
    const out = comparableRate(
      { activity_measures_tracked: tracked, activity_reference_period: period },
      { measure: contacts, value: 48 },
      { measure: replies, value: 12 },
    )
    expect(out.rate).toBeNull()
    expect(out.refusal).toBe('not_comparable')
  })

  it('refuse une unité hors catalogue plutôt que de la traiter comme une autre', () => {
    const out = comparableRate(
      { activity_measures_tracked: tracked, activity_reference_period: period },
      { measure: 'Placements', value: 3 },
      { measure: contacts, value: 48 },
    )
    expect(out.rate).toBeNull()
    expect(out.refusal).toBe('unknown_unit')
    expect(out.missing).toEqual(['Placements'])
  })
})

describe('#2049.14 — le CODE lui-même ne remplace jamais un terme manquant par 0', () => {
  /**
   * La preuve demandée au registre est « aucun `COALESCE(…, 0)` sur un taux ».
   * Le corpus tenu ici est BORNÉ aux deux modules qui portent la règle : ce
   * sont eux qui seraient tentés, et une garde qui balaierait tout le dépôt
   * attraperait les cent `?? 0` légitimes qui comptent des éléments d'un
   * tableau. Le SQL du lot est sans `COALESCE` — sa propre garde le dit
   * (`1794020000000-CanauxEntreeMesures.spec.ts`).
   */
  const HERE = new URL('.', import.meta.url).pathname
  const SOURCES = ['answers-canaux.ts', 'answers-mesures.ts'] as const
  const read = (file: string): string => readFileSync(`${HERE}${file}`, 'utf8')
  /**
   * ⚠️ Les COMMENTAIRES sortent du corpus, et ce n'est pas un détail : ces deux
   * modules EXPLIQUENT la règle, donc ils écrivent « jamais un zéro fabriqué
   * par un `?? 0` ». Une garde qui lirait le commentaire échouerait sur la
   * phrase qui énonce l'interdit — le défaut « une liste découpée sans retirer
   * les commentaires », dans l'autre sens.
   */
  const code = (file: string): string =>
    read(file)
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')

  it('lit bien les deux modules, commentaires retirés (une garde qui itère sur du vide est verte et borgne)', () => {
    for (const file of SOURCES) {
      expect(read(file).length).toBeGreaterThan(1000)
      expect(code(file).length).toBeGreaterThan(200)
      // Le retrait a bien eu lieu : le corpus de code est plus court que le fichier.
      expect(code(file).length).toBeLessThan(read(file).length)
    }
  })

  it('n’écrit nulle part « ?? 0 » ni « COALESCE », les deux façons de fabriquer un zéro', () => {
    for (const file of SOURCES) {
      const source = code(file)
      expect(source, `${file} : un terme absent ne devient jamais 0`).not.toMatch(/\?\?\s*0\b/)
      expect(source, `${file} : pas de COALESCE en dur non plus`).not.toMatch(/COALESCE/i)
    }
  })

  it('SAIT DIRE NON — un « ?? 0 » ajouté au code serait vu (témoin sur un extrait fabriqué)', () => {
    const fautif = code('answers-mesures.ts') + '\nconst faux = denominator.value ?? 0\n'
    expect(fautif).toMatch(/\?\?\s*0\b/)
  })

  it('n’attrape PAS les replis légitimes voisins (témoin — `?? []` et `?? null` sont bien là)', () => {
    // Un repli sur la LISTE VIDE dit « pas de réponse » et se relit en seau
    // « inconnu » ; un repli sur `null` laisse `measuredRate` refuser. Ni l'un
    // ni l'autre n'invente un chiffre — la garde ne doit pas les confondre
    // avec le zéro qu'elle refuse.
    expect(read('answers-canaux.ts')).toMatch(/\?\?\s*\[\]/)
    expect(read('answers-mesures.ts')).toMatch(/\?\?\s*null/)
  })
})

describe('#2049.15 — la rupture est NOMMÉE, sans pourcentage inventé', () => {
  it('ne conclut rien tant que la question n’a pas de réponse', () => {
    expect(funnelBreak({})).toEqual({ kind: 'not_declared' })
    expect(funnelBreak({ activity_measures_tracked: [] })).toEqual({ kind: 'not_declared' })
  })

  it('nomme la PREMIÈRE étape non suivie, dans l’ordre de l’entonnoir', () => {
    const tracked = ACTIVITY_MEASURES.filter(m => m.funnelRank !== 4 && m.funnelRank !== 7).map(m => m.value)
    const out = funnelBreak({ activity_measures_tracked: tracked })
    expect(out).toEqual({ kind: 'break', measure: ACTIVITY_MEASURES[3] })
  })

  it('dit « complet » quand les onze étapes sont suivies', () => {
    expect(funnelBreak({ activity_measures_tracked: ACTIVITY_MEASURES.map(m => m.value) })).toEqual({
      kind: 'complete',
    })
  })

  it('ne rend AUCUN nombre de performance — ni taux, ni score, ni part (doctrine « aucune probabilité »)', () => {
    const out = funnelBreak({ activity_measures_tracked: [ACTIVITY_MEASURES[0].value] })
    // Seul le rang d'entonnoir de l'unité nommée est un nombre : c'est une
    // POSITION dans une liste, jamais une mesure de performance.
    const numeric = JSON.stringify(out).match(/:\s*-?\d+(\.\d+)?\s*[,}]/g) ?? []
    expect(numeric.length).toBeLessThanOrEqual(1)
    expect(JSON.stringify(out)).not.toMatch(/rate|percent|score|probab/i)
  })
})
