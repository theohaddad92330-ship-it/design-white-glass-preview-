import {
  AVAILABILITY_WINDOW_DAYS,
  DEFAULT_FRESHNESS_MS,
  deriveDependencyHealth,
  type DependencySample,
} from './dependency-health.logic'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Un instant FIXE — aucun test de ce fichier ne lit l'horloge. */
const NOW = Date.parse('2026-09-07T12:00:00.000Z')

function derive(samples: DependencySample[], overrides: Partial<Parameters<typeof deriveDependencyHealth>[0]> = {}) {
  return deriveDependencyHealth({ samples, now: NOW, configured: true, producesLatency: true, ...overrides })
}

function sample(agoMs: number, ok: boolean, latencyMs: number | null = 40): DependencySample {
  return { at: NOW - agoMs, ok, latencyMs }
}

describe('deriveDependencyHealth — l’état vient d’un test réel', () => {
  it('une sonde fraîche et réussie : « up »', () => {
    expect(derive([sample(5 * MINUTE, true)]).state).toBe('up')
  })

  it('une sonde fraîche en échec : « down »', () => {
    expect(derive([sample(5 * MINUTE, false, null)]).state).toBe('down')
  })

  it('elle répond, mais des sondes fraîches ont échoué : « degraded »', () => {
    expect(derive([sample(30 * MINUTE, false, null), sample(5 * MINUTE, true)]).state).toBe('degraded')
  })

  it('⚠️ LE TEST DE L’ISSUE — non testée depuis 1 h : « inconnu », PAS « sain »', () => {
    // La dernière sonde a RÉUSSI. Elle est trop vieille pour prouver quoi que ce
    // soit sur maintenant : un vert d'il y a deux heures ne dit rien.
    const vieille = derive([sample(2 * HOUR, true)])
    expect(vieille.state).toBe('unknown')
    expect(vieille.state).not.toBe('up')
    // Et la date de la dernière mesure reste publiée : « inconnu » sans dire
    // depuis quand n'apprendrait rien.
    expect(vieille.lastMeasuredAt).toBe(NOW - 2 * HOUR)
  })

  it('la bascule se fait exactement au seuil de fraîcheur, pas avant', () => {
    expect(derive([sample(DEFAULT_FRESHNESS_MS, true)]).state).toBe('up')
    expect(derive([sample(DEFAULT_FRESHNESS_MS + 1, true)]).state).toBe('unknown')
  })

  it('jamais sondée : « inconnu », et la date de dernière mesure est nulle', () => {
    const jamais = derive([])
    expect(jamais.state).toBe('unknown')
    expect(jamais.lastMeasuredAt).toBeNull()
  })

  it('non configurée : « éteinte », jamais « en panne »', () => {
    // ⚠️ Sans clé, le dépôt fait un no-op strict. Une tuile rouge sur une
    // capacité qu'on a CHOISI de ne pas brancher apprend à ignorer le rouge.
    const eteinte = derive([], { configured: false })
    expect(eteinte.state).toBe('off')
    expect(eteinte.state).not.toBe('down')
    expect(eteinte.state).not.toBe('unknown')
  })

  it('« éteinte » gagne même sur une sonde en échec — la décision passe avant', () => {
    expect(derive([sample(MINUTE, false, null)], { configured: false }).state).toBe('off')
  })
})

describe('la latence médiane 24 h', () => {
  it('est une MÉDIANE : une pointe isolée ne déplace pas le verdict', () => {
    const mesures = [sample(MINUTE, true, 30), sample(2 * MINUTE, true, 32), sample(3 * MINUTE, true, 2000)]
    expect(derive(mesures).medianLatency24h).toEqual({ kind: 'measured', ms: 32, samples: 3 })
    // La moyenne aurait dit 687 ms : un ralentissement inventé par un hoquet.
  })

  it('moyenne les deux du milieu sur un effectif pair', () => {
    const mesures = [sample(MINUTE, true, 10), sample(2 * MINUTE, true, 20)]
    expect(derive(mesures).medianLatency24h).toEqual({ kind: 'measured', ms: 15, samples: 2 })
  })

  it('ignore les sondes en ÉCHEC — un délai d’expiration n’est pas une latence', () => {
    const mesures = [sample(MINUTE, true, 10), sample(2 * MINUTE, false, 2000)]
    expect(derive(mesures).medianLatency24h).toEqual({ kind: 'measured', ms: 10, samples: 1 })
  })

  it('ignore ce qui déborde des 24 h', () => {
    expect(derive([sample(2 * DAY, true, 10)]).medianLatency24h).toEqual({ kind: 'no_sample' })
  })

  it('aucune mesure : « pas d’échantillon », JAMAIS « 0 ms »', () => {
    const sans = derive([])
    expect(sans.medianLatency24h).toEqual({ kind: 'no_sample' })
    expect(JSON.stringify(sans.medianLatency24h)).not.toContain('0')
  })

  it('une sonde sans aller-retour : « sans objet », qui n’est pas « pas de mesure »', () => {
    // `api` et `worker` ne mesurent aucune latence réseau. Les trois cas sont
    // distincts et appellent trois phrases différentes à l'écran.
    expect(derive([sample(MINUTE, true, null)], { producesLatency: false }).medianLatency24h).toEqual({
      kind: 'not_applicable',
    })
  })
})

describe('la série de disponibilité 7 jours', () => {
  it('rend sept points, du plus ancien au plus récent', () => {
    const serie = derive([]).availability7d
    expect(serie).toHaveLength(AVAILABILITY_WINDOW_DAYS)
    expect(serie.map(point => point.day)).toEqual([...serie.map(point => point.day)].sort())
  })

  it('un jour SANS sonde vaut `null` — un trou, jamais une barre à zéro', () => {
    // ⚠️ « Aucune mesure ce jour-là » et « indisponible toute la journée » sont
    // les deux lectures les plus opposées possibles.
    const serie = derive([sample(MINUTE, true)]).availability7d
    expect(serie[0]?.ratio).toBeNull()
    expect(serie.at(-1)?.ratio).toBe(1)
  })

  it('un jour à moitié en panne vaut 0,5', () => {
    const serie = derive([sample(MINUTE, true), sample(2 * MINUTE, false, null)]).availability7d
    expect(serie.at(-1)?.ratio).toBe(0.5)
  })

  it('un jour entièrement en panne vaut 0 — et c’est une VRAIE mesure', () => {
    const serie = derive([sample(MINUTE, false, null)]).availability7d
    expect(serie.at(-1)?.ratio).toBe(0)
  })
})

describe('le dernier incident', () => {
  it('aucune sonde du tout : « inconnu », pas « aucun incident »', () => {
    expect(derive([]).lastIncident).toEqual({ kind: 'unknown' })
  })

  it('que des sondes réussies : « aucun incident sur la fenêtre », avec sa fenêtre', () => {
    expect(derive([sample(MINUTE, true)]).lastIncident).toEqual({
      kind: 'none_in_window',
      windowDays: AVAILABILITY_WINDOW_DAYS,
    })
  })

  it('un incident résolu : la panne ET la reprise', () => {
    expect(derive([sample(3 * HOUR, false, null), sample(2 * HOUR, true)]).lastIncident).toEqual({
      kind: 'observed',
      at: NOW - 3 * HOUR,
      resolvedAt: NOW - 2 * HOUR,
    })
  })

  it('un incident en cours : aucune date de reprise INVENTÉE', () => {
    expect(derive([sample(2 * HOUR, true), sample(MINUTE, false, null)]).lastIncident).toEqual({
      kind: 'observed',
      at: NOW - MINUTE,
      resolvedAt: null,
    })
  })
})

describe('la dérivation ne lit JAMAIS l’horloge', () => {
  it('deux appels au même `now` rendent le même verdict, quelle que soit l’heure réelle', () => {
    // Une dérivation qui lirait `Date.now()` passerait à Paris et échouerait sur
    // un exécuteur CI en UTC. Ici, `now` est un paramètre : le résultat est
    // reproductible à l'octet.
    const premier = derive([sample(5 * MINUTE, true)])
    const second = derive([sample(5 * MINUTE, true)])
    expect(JSON.stringify(premier)).toBe(JSON.stringify(second))
  })

  it('déplacer `now` d’une heure change le verdict — la fraîcheur est bien relative', () => {
    const samples = [{ at: NOW - 5 * MINUTE, ok: true, latencyMs: 12 }]
    expect(deriveDependencyHealth({ samples, now: NOW, configured: true, producesLatency: true }).state).toBe('up')
    expect(
      deriveDependencyHealth({ samples, now: NOW + 2 * HOUR, configured: true, producesLatency: true }).state,
    ).toBe('unknown')
  })
})
