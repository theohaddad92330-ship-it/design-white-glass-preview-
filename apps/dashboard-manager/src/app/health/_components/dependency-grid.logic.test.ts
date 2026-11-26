import { describe, expect, it } from 'vitest'
import type { DependencyReading } from '@/lib/operator-health'
import type { SourceHealthReport } from '@/lib/telemetry'
import { badgeDeLEtat, compterParEtat, construireGrille, motDEtat, verdictSante } from './dependency-grid.logic'

/** Un instant FIXE : aucun test de ce fichier ne lit l'horloge. */
const NOW = Date.parse('2026-09-07T12:00:00.000Z')
const MINUTE = 60_000
const HEURE = 60 * MINUTE

function sondee(overrides: Partial<Extract<DependencyReading, { measuredBy: 'probe' }>> = {}): DependencyReading {
  return {
    id: 'postgres',
    label: 'Postgres',
    cuts: 'toute lecture et toute écriture',
    configured: true,
    measuredBy: 'probe',
    health: {
      state: 'up',
      lastMeasuredAt: NOW - 5 * MINUTE,
      medianLatency24h: { kind: 'measured', ms: 12, samples: 200 },
      availability7d: [{ day: '2026-09-07', ratio: 1 }],
      lastIncident: { kind: 'none_in_window', windowDays: 7 },
    },
    ...overrides,
  }
}

function aLUsage(overrides: Partial<Extract<DependencyReading, { measuredBy: 'usage' }>> = {}): DependencyReading {
  return {
    id: 'pappers',
    label: 'Pappers',
    cuts: 'les données légales',
    configured: true,
    measuredBy: 'usage',
    usageSource: 'pappers',
    ...overrides,
  }
}

function rapport(sources: SourceHealthReport['sources']): SourceHealthReport {
  return {
    window: { hours: 24, runsConsidered: sources.length, oldestRunAt: null, newestRunAt: null },
    sources,
  }
}

function source(overrides: Partial<SourceHealthReport['sources'][number]> = {}): SourceHealthReport['sources'][number] {
  return {
    source: 'pappers',
    state: 'ok',
    runsObserved: 10,
    runsDegraded: 0,
    degradedSince: null,
    degradedSinceIsWindowEdge: false,
    lastOkAt: new Date(NOW - 20 * MINUTE).toISOString(),
    lastReason: null,
    lastCode: null,
    ...overrides,
  }
}

describe('le vocabulaire des états', () => {
  it('chaque état porte un MOT — une couleur seule n’est pas une information', () => {
    for (const etat of ['up', 'degraded', 'down', 'unknown', 'off'] as const) {
      expect(motDEtat(etat).length).toBeGreaterThan(3)
    }
    expect(new Set((['up', 'degraded', 'down', 'unknown', 'off'] as const).map(motDEtat)).size).toBe(5)
  })

  it('⚠️ « inconnu » et « non branchée » ne sont PAS rouges', () => {
    // Peindre en rouge une capacité qu'on n'a pas branchée apprend à ignorer le
    // rouge — et c'est exactement ce qu'un écran d'incident ne doit pas faire.
    expect(badgeDeLEtat('unknown')).toBe('analyzing')
    expect(badgeDeLEtat('off')).toBe('analyzing')
    expect(badgeDeLEtat('down')).toBe('error')
    expect(badgeDeLEtat('up')).toBe('completed')
  })
})

describe('construireGrille — une dépendance sondée', () => {
  it('rend la latence médiane, le mot d’état, et depuis quand elle a été mesurée', () => {
    const [tuile] = construireGrille([sondee()], null, NOW)
    expect(tuile?.motDEtat).toBe('Opérationnelle')
    expect(tuile?.latence).toContain('12 ms')
    expect(tuile?.derniereMesure).toContain('sondée il y a')
    expect(tuile?.origine).toContain('sonde')
  })

  it('⚠️ jamais sondée : une PHRASE, jamais « il y a 0 min »', () => {
    const jamais = sondee({
      health: {
        state: 'unknown',
        lastMeasuredAt: null,
        medianLatency24h: { kind: 'no_sample' },
        availability7d: [],
        lastIncident: { kind: 'unknown' },
      },
    })
    const [tuile] = construireGrille([jamais], null, NOW)
    expect(tuile?.motDEtat).toBe('État inconnu')
    expect(tuile?.derniereMesure).toBe('jamais sondée')
    expect(tuile?.derniereMesure).not.toContain('0')
  })

  it('une latence absente ne s’écrit JAMAIS « 0 ms »', () => {
    const sans = sondee({
      health: {
        state: 'unknown',
        lastMeasuredAt: null,
        medianLatency24h: { kind: 'no_sample' },
        availability7d: [],
        lastIncident: { kind: 'unknown' },
      },
    })
    expect(construireGrille([sans], null, NOW)[0]?.latence).not.toContain('0 ms')
  })

  it('une sonde sans aller-retour dit « sans objet » — ce n’est pas « pas de mesure »', () => {
    const registre = sondee({
      id: 'worker',
      label: 'Worker d’analyse',
      health: {
        state: 'up',
        lastMeasuredAt: NOW - MINUTE,
        medianLatency24h: { kind: 'not_applicable' },
        availability7d: [],
        lastIncident: { kind: 'none_in_window', windowDays: 7 },
      },
    })
    expect(construireGrille([registre], null, NOW)[0]?.latence).toContain('sans objet')
  })

  it('un jour sans sonde reste un TROU dans la série, jamais une barre à zéro', () => {
    const trouee = sondee({
      health: {
        state: 'up',
        lastMeasuredAt: NOW - MINUTE,
        medianLatency24h: { kind: 'measured', ms: 10, samples: 5 },
        availability7d: [
          { day: '2026-09-06', ratio: null },
          { day: '2026-09-07', ratio: 1 },
        ],
        lastIncident: { kind: 'none_in_window', windowDays: 7 },
      },
    })
    const disponibilite = construireGrille([trouee], null, NOW)[0]?.disponibilite
    expect(disponibilite).toEqual({ kind: 'serie', points: [{ value: null }, { value: 1 }] })
  })

  it('un incident en cours n’INVENTE aucune date de reprise', () => {
    const cassee = sondee({
      health: {
        state: 'down',
        lastMeasuredAt: NOW - MINUTE,
        medianLatency24h: { kind: 'no_sample' },
        availability7d: [],
        lastIncident: { kind: 'observed', at: NOW - 3 * HEURE, resolvedAt: null },
      },
    })
    expect(construireGrille([cassee], null, NOW)[0]?.dernierIncident).toContain('en cours depuis')
  })
})

describe('construireGrille — une dépendance mesurée à l’usage', () => {
  it('reprend l’état du rapport des sources, sans le recalculer', () => {
    const [tuile] = construireGrille([aLUsage()], rapport([source()]), NOW)
    expect(tuile?.motDEtat).toBe('Opérationnelle')
    expect(tuile?.origine).toContain('analyses réellement exécutées')
  })

  it('⚠️ ABSENTE du rapport = INCONNUE, jamais « opérationnelle »', () => {
    // Une source qu'aucune analyse n'a sollicitée n'a rien prouvé. C'est la
    // règle du panneau des sources, et on la LIT plutôt que de la refaire.
    const [tuile] = construireGrille([aLUsage()], rapport([]), NOW)
    expect(tuile?.etat).toBe('unknown')
    expect(tuile?.motDEtat).toBe('État inconnu')
  })

  it('rapport injoignable = INCONNUE, jamais « opérationnelle »', () => {
    const [tuile] = construireGrille([aLUsage()], null, NOW)
    expect(tuile?.etat).toBe('unknown')
  })

  it('sans clé : « non branchée », et surtout PAS « en panne »', () => {
    // ⚠️ « Sans clé = no-op strict » : la capacité est absente par décision.
    const [tuile] = construireGrille([aLUsage({ configured: false })], rapport([]), NOW)
    expect(tuile?.etat).toBe('off')
    expect(tuile?.motDEtat).toBe('Non branchée')
  })

  it('« non branchée » gagne même quand le rapport la dit en panne', () => {
    const [tuile] = construireGrille([aLUsage({ configured: false })], rapport([source({ state: 'down' })]), NOW)
    expect(tuile?.etat).toBe('off')
  })

  it('n’annonce ni latence ni série — et DIT pourquoi, au lieu d’en dessiner une plate', () => {
    const [tuile] = construireGrille([aLUsage()], rapport([source()]), NOW)
    expect(tuile?.latence).toContain('non mesurée')
    expect(tuile?.disponibilite.kind).toBe('absente')
  })

  it('une dégradation en cours porte « au moins depuis » quand la série touche le bord', () => {
    const rapportDegrade = rapport([
      source({
        state: 'degraded',
        degradedSince: new Date(NOW - 5 * HEURE).toISOString(),
        degradedSinceIsWindowEdge: true,
      }),
    ])
    const [tuile] = construireGrille([aLUsage()], rapportDegrade, NOW)
    expect(tuile?.etat).toBe('degraded')
    expect(tuile?.dernierIncident).toContain('au moins depuis')
  })
})

describe('l’ordre et les comptes', () => {
  it('trie ce qui va mal en premier — un écran d’incident, pas un inventaire', () => {
    const grille = construireGrille(
      [
        sondee({ id: 'a', label: 'A' }),
        sondee({
          id: 'b',
          label: 'B',
          health: {
            state: 'down',
            lastMeasuredAt: NOW,
            medianLatency24h: { kind: 'no_sample' },
            availability7d: [],
            lastIncident: { kind: 'unknown' },
          },
        }),
        aLUsage({ id: 'c', label: 'C', configured: false }),
      ],
      rapport([]),
      NOW,
    )
    // En panne, puis non branchée, puis opérationnelle : ce qui appelle un
    // geste d'abord, ce qui va bien en dernier.
    expect(grille.map(tuile => tuile.label)).toEqual(['B', 'C', 'A'])
  })

  it('⚠️ compte « inconnu » et « non branchée » SÉPARÉMENT des pannes', () => {
    const grille = construireGrille([sondee(), aLUsage({ configured: false })], rapport([]), NOW)
    const compte = compterParEtat(grille)
    expect(compte).toEqual({ up: 1, degraded: 0, down: 0, unknown: 0, off: 1 })
    // Fondre les deux dans un total d'anomalies referait exactement l'erreur
    // que cet écran corrige.
    expect(compte.down).toBe(0)
  })

  it('un compte à zéro est un VRAI zéro — il n’y a bien aucune panne', () => {
    expect(compterParEtat([]).down).toBe(0)
  })
})

describe('la dérivation ne lit jamais l’horloge', () => {
  it('deux appels au même `now` rendent la même grille, à l’octet', () => {
    const premier = construireGrille([sondee(), aLUsage()], rapport([source()]), NOW)
    const second = construireGrille([sondee(), aLUsage()], rapport([source()]), NOW)
    expect(JSON.stringify(premier)).toBe(JSON.stringify(second))
  })

  it('déplacer `now` change la phrase de dernière mesure — elle est bien relative', () => {
    const proche = construireGrille([sondee()], null, NOW)[0]?.derniereMesure
    const loin = construireGrille([sondee()], null, NOW + 3 * HEURE)[0]?.derniereMesure
    expect(proche).not.toBe(loin)
  })
})

describe('le verdict de l’entête ne peut pas dire « healthy » pendant une panne', () => {
  const aucune = { up: 6, degraded: 0, down: 0, unknown: 0, off: 4 }

  it('LIT quelque chose — le cas nominal reste sain', () => {
    expect(verdictSante(true, aucune)).toEqual({ sain: true, libelle: 'healthy' })
  })

  it('une dépendance EN PANNE fait tomber le verdict, et le libellé le NOMME', () => {
    // Le cas mesuré : API saine, Supabase (authentification) en panne. La
    // pastille disait « healthy » à quarante pixels de « 1 en panne ».
    const v = verdictSante(true, { ...aucune, up: 5, down: 1 })
    expect(v.sain).toBe(false)
    expect(v.libelle).toContain('1 dépendance(s) en panne')
  })

  it('une dépendance DÉGRADÉE compte aussi', () => {
    expect(verdictSante(true, { ...aucune, up: 5, degraded: 1 }).sain).toBe(false)
  })

  it('« je n’ai pas pu mesurer » n’est pas « tout va bien »', () => {
    const v = verdictSante(true, null)
    expect(v.sain).toBe(false)
    expect(v.libelle).toBe('dépendances non mesurées')
  })

  it('N’ATTRAPE PAS ce qu’elle ne vise pas — « inconnue » et « non branchée » ne sont PAS des pannes', () => {
    // Le témoin, et c'est la moitié utile de la règle : une capacité éteinte à
    // dessein, ou non sondée depuis une heure, ne doit pas faire crier au loup.
    // Confondre les deux rendrait la pastille rouge en permanence, donc muette.
    expect(verdictSante(true, { up: 6, degraded: 0, down: 0, unknown: 2, off: 4 })).toEqual({
      sain: true,
      libelle: 'healthy',
    })
  })
})
