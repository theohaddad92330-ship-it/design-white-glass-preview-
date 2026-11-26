import { describe, expect, it } from 'vitest'
import { WHY_NOW_MAX_SIGNALS, relevanceProfileFromAnswers, whyNowSignals } from './discover-why-now'
import type { DiscoverSignal } from './discover-types'

const signal = (type: DiscoverSignal['type'], date: string, label = `${type} ${date}`): DiscoverSignal => ({
  type,
  date,
  label,
})

// #3597.6 — « Pourquoi maintenant » : 2-3 signaux, récents d'abord, recrutements avant vie juridique.
describe('#3597.6 — les signaux de « pourquoi maintenant »', () => {
  it('en garde trois au plus', () => {
    const many = [
      signal('hiring', '2026-09-01'),
      signal('hiring', '2026-09-02'),
      signal('tender', '2026-09-03'),
      signal('award', '2026-09-04'),
    ]
    expect(WHY_NOW_MAX_SIGNALS).toBe(3)
    expect(whyNowSignals(many)).toHaveLength(3)
  })

  it('les plus récents d’abord', () => {
    const result = whyNowSignals([signal('hiring', '2026-08-01'), signal('hiring', '2026-09-20')])
    expect(result.map(item => item.date)).toEqual(['2026-09-20', '2026-08-01'])
  })

  it('un recrutement passe avant la vie juridique, même plus ancien', () => {
    const result = whyNowSignals([signal('legal', '2026-09-30'), signal('hiring', '2026-06-01')])
    expect(result.map(item => item.type)).toEqual(['hiring', 'legal'])
  })

  it('#4045.1 — un signal qui recoupe le mot-clé passe en tête, même plus ancien, même après la vie juridique', () => {
    const cyber: DiscoverSignal = { ...signal('hiring', '2026-06-01', 'Analyste SOC'), keywordMatch: true }
    const result = whyNowSignals([signal('hiring', '2026-09-30', 'Data Analyst'), signal('legal', '2026-09-29'), cyber])
    expect(result.map(item => item.label)).toEqual(['Analyste SOC', 'Data Analyst', 'legal 2026-09-29'])
  })

  it('sans signal, rien — jamais un signal inventé', () => {
    expect(whyNowSignals([])).toEqual([])
  })

  it('une offre retirée n’est pas un déclencheur actuel', () => {
    const filled: DiscoverSignal = { ...signal('hiring', '2026-09-20'), stillOpen: false }
    expect(whyNowSignals([filled, signal('hiring', '2026-08-01')])).toHaveLength(1)
  })

  // #3597.13 — EQUASENS affichait deux fois « Dépôts des comptes · il y a 58 j ».
  it('un signal de même libellé et même date n’apparaît qu’une fois, sans manger une place', () => {
    const result = whyNowSignals([
      signal('legal', '2026-08-07', 'Dépôts des comptes'),
      signal('legal', '2026-08-07', 'Dépôts des comptes'),
      signal('hiring', '2026-07-01', 'Recrutement A'),
      signal('hiring', '2026-06-01', 'Recrutement B'),
    ])
    expect(result.map(item => item.label)).toEqual(['Recrutement A', 'Recrutement B', 'Dépôts des comptes'])
  })
})

/**
 * #3906 — « Veolia : appel d'offres il y a 109 jours, ça n'a rien à voir avec
 * mon métier » (call bêta 08/10/2026, 19:27) : un signal au-delà de la fenêtre
 * de fraîcheur active ne doit jamais se présenter comme actuel. `maxAgeDays`
 * est ADDITIF — un appelant qui ne le fournit pas (tous les tests ci-dessus)
 * garde le comportement d'avant, à l'octet : aucun seuil n'est deviné ici, il
 * vient de la fenêtre RÉELLEMENT choisie par l'utilisateur (`sinceDays`).
 */
describe('#3906 — un signal au-delà de la fenêtre active n’est jamais présenté comme actuel', () => {
  const NOW = Date.parse('2026-10-08T00:00:00Z')

  it('un signal de 109 jours sort de « pourquoi maintenant » dès que la fenêtre est à 90 j', () => {
    const veolia = signal('tender', '2026-06-21', 'Appel d’offres') // 109 j avant NOW
    const result = whyNowSignals([veolia], WHY_NOW_MAX_SIGNALS, { maxAgeDays: 90, nowMs: NOW })
    expect(result).toEqual([])
  })

  it('un signal dans la fenêtre reste présenté', () => {
    const recent = signal('hiring', '2026-09-20') // 18 j avant NOW
    const result = whyNowSignals([recent], WHY_NOW_MAX_SIGNALS, { maxAgeDays: 90, nowMs: NOW })
    expect(result).toEqual([recent])
  })

  it('la borne est inclusive — exactement 90 j reste dans la fenêtre', () => {
    const atBound = signal('hiring', '2026-07-10') // exactement 90 j avant NOW
    const result = whyNowSignals([atBound], WHY_NOW_MAX_SIGNALS, { maxAgeDays: 90, nowMs: NOW })
    expect(result).toEqual([atBound])
  })

  it('ne garde que les signaux dans la fenêtre, jamais un vieux signal pour combler la liste', () => {
    const recent = signal('hiring', '2026-09-20')
    const old = signal('tender', '2026-06-21', 'Appel d’offres')
    const result = whyNowSignals([old, recent], WHY_NOW_MAX_SIGNALS, { maxAgeDays: 90, nowMs: NOW })
    expect(result).toEqual([recent])
  })

  it('sans fenêtre fournie, aucun signal n’est écarté par l’âge — comportement inchangé', () => {
    const old = signal('tender', '2020-01-01', 'Très ancien')
    expect(whyNowSignals([old], WHY_NOW_MAX_SIGNALS, { nowMs: NOW })).toEqual([old])
  })
})

// #3923 — un signal hors métier ne remonte pas en tête, même le plus récent.
describe('#3923 — pertinence au profil déclaré', () => {
  it('sans profil fourni, le classement reste identique à avant (non-régression)', () => {
    const result = whyNowSignals([
      signal('hiring', '2026-09-01', 'Recrute un professeur'),
      signal('hiring', '2026-08-01', 'Recrute un développeur'),
    ])
    expect(result.map(item => item.label)).toEqual(['Recrute un professeur', 'Recrute un développeur'])
  })

  it('un recrutement hors métier passe après un recrutement pertinent, même plus ancien', () => {
    const result = whyNowSignals(
      [
        signal('hiring', '2026-09-20', 'Recrute un professeur de mathématiques'),
        signal('hiring', '2026-06-01', 'Recrute un développeur Python'),
      ],
      WHY_NOW_MAX_SIGNALS,
      { profile: { placedRoles: ['développeur'], noGoSectors: [] } },
    )
    expect(result.map(item => item.label)).toEqual([
      'Recrute un développeur Python',
      'Recrute un professeur de mathématiques',
    ])
  })

  it('un hors métier passe même APRÈS la vie juridique', () => {
    const result = whyNowSignals(
      [signal('hiring', '2026-09-20', 'Recrute un professeur'), signal('legal', '2026-01-01', 'Dépôts des comptes')],
      WHY_NOW_MAX_SIGNALS,
      { profile: { placedRoles: ['développeur'], noGoSectors: [] } },
    )
    expect(result.map(item => item.label)).toEqual(['Dépôts des comptes', 'Recrute un professeur'])
  })

  it('« non évaluable » (profil muet) ne pénalise jamais un signal', () => {
    const result = whyNowSignals([signal('hiring', '2026-09-01', 'Recrute un professeur')], WHY_NOW_MAX_SIGNALS, {
      profile: { placedRoles: [], noGoSectors: [] },
    })
    expect(result).toHaveLength(1)
  })
})

// #3923.a — `placed_roles` voyage jusqu'au web : une offre hors métier ne remonte plus en tête.
describe('#3923.a — le profil de pertinence lu dans les réponses', () => {
  it('porte les métiers placés ET les secteurs refusés déclarés', () => {
    expect(relevanceProfileFromAnswers({ placed_roles: ['Développeur'], no_go_sectors: ['Retail'] })).toEqual({
      placedRoles: ['Développeur'],
      noGoSectors: ['Retail'],
    })
  })

  it('sans réponses, aucun profil — le classement d’avant, à l’octet', () => {
    expect(relevanceProfileFromAnswers(undefined)).toBeUndefined()
    expect(relevanceProfileFromAnswers({})).toEqual({ placedRoles: [], noGoSectors: [] })
  })

  it('une offre hors métier passe après une offre du métier déclaré, même plus récente', () => {
    const profile = relevanceProfileFromAnswers({ placed_roles: ['Développeur'], no_go_sectors: [] })
    const offTrade = signal('hiring', '2026-09-30', 'Recrute un professeur de mathématiques')
    const inTrade = signal('hiring', '2026-08-01', 'Recrute un développeur Java')
    expect(whyNowSignals([offTrade, inTrade], WHY_NOW_MAX_SIGNALS, { profile }).map(s => s.label)).toEqual([
      'Recrute un développeur Java',
      'Recrute un professeur de mathématiques',
    ])
  })

  it('sait dire NON : sans métier déclaré, l’offre la plus récente reste en tête (« non évaluable »)', () => {
    const profile = relevanceProfileFromAnswers({ placed_roles: [], no_go_sectors: [] })
    const offTrade = signal('hiring', '2026-09-30', 'Recrute un professeur de mathématiques')
    const inTrade = signal('hiring', '2026-08-01', 'Recrute un développeur Java')
    expect(whyNowSignals([offTrade, inTrade], WHY_NOW_MAX_SIGNALS, { profile })[0]?.label).toBe(
      'Recrute un professeur de mathématiques',
    )
  })
})

// #3928.1 — « un signal sans date n'est pas récent », la même règle que l'axe score et Laura.
describe('#3928.1 — Découvrir : un signal sans date propre n’est jamais un « pourquoi maintenant »', () => {
  it('une date illisible est écartée, même sans fenêtre choisie', () => {
    const result = whyNowSignals([signal('business', 'récemment', 'Sans date'), signal('hiring', '2026-09-20')])
    expect(result.map(item => item.label)).toEqual(['hiring 2026-09-20'])
  })

  it('un signal connu daté par sa seule DÉTECTION n’est pas récent', () => {
    const detected: DiscoverSignal = { ...signal('business', '2026-10-01', 'Détecté seulement'), dateIsDetection: true }
    const result = whyNowSignals([detected, signal('tender', '2026-08-01')])
    expect(result.map(item => item.label)).toEqual(['tender 2026-08-01'])
  })
})

// #1124.1 — décision Louis 14/10/2026 : la réponse « je place des CDI chez mes clients » voyage jusqu'au classement.
describe('relevanceProfileFromAnswers — le placement (#1124.1)', () => {
  it('« yes » devient recruitsForClients ; « no » ou muet : la clé n’existe pas', () => {
    expect(relevanceProfileFromAnswers({ recruits_for_clients: 'yes' })).toEqual({
      placedRoles: [],
      noGoSectors: [],
      recruitsForClients: true,
    })
    expect(relevanceProfileFromAnswers({ recruits_for_clients: 'no' })).toEqual({ placedRoles: [], noGoSectors: [] })
    expect(relevanceProfileFromAnswers({ recruits_for_clients: null })).toEqual({ placedRoles: [], noGoSectors: [] })
  })
})
