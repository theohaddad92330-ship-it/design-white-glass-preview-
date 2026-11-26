import { describe, expect, it } from 'vitest'
import { UNKNOWN_ANSWER_LABELS } from '@bellum/contracts'
import {
  hasDeclaredTools,
  buildFirstExchangePrompt,
  buildOrientations,
  buildPointsToDecide,
  buildContextGrid,
  buildUnderstood,
} from '@/features/onboarding/lib/framing-readout'

const t = (key: string, options?: Record<string, unknown>): string =>
  options && 'items' in options ? `${key}:${String(options.items)}` : key

describe('buildUnderstood — « Ce que Laura a compris » (Théo O onboarding-relecture.R4)', () => {
  it('dit « à préciser » (null) pour ce qui n’est pas répondu, jamais une valeur inventée', () => {
    const rows = buildUnderstood({}, t)
    expect(rows.map(r => r.key)).toEqual(['activity', 'role', 'offer', 'priority', 'territory', 'limits'])
    expect(rows.every(r => r.value === null)).toBe(true)
  })

  it('lit les réponses données et renvoie chaque ligne à son thème', () => {
    const rows = buildUnderstood({ esn_name: 'Altimance', geo_zones: ['Paris & Île-de-France', 'Lyon'] }, t)
    expect(rows.find(r => r.key === 'activity')?.value).toBe('Altimance')
    expect(rows.find(r => r.key === 'territory')?.value).toBe('Paris & Île-de-France, Lyon')
    expect(rows.find(r => r.key === 'territory')?.themeSlug).toBe('marches-et-territoires')
  })

  it('une réponse mise de côté reste « à préciser » : ce n’est pas une valeur mesurée', () => {
    const rows = buildUnderstood({ esn_name: UNKNOWN_ANSWER_LABELS.not_yet_known }, t)
    expect(rows.find(r => r.key === 'activity')?.value).toBeNull()
  })
})

describe('buildOrientations — trois orientations à décider, par règles locales (relecture.R3/R4)', () => {
  it('n’invente aucune orientation sans réponse qui la motive', () => {
    expect(buildOrientations({})).toEqual([])
  })

  it('propose « preuve » quand des références sont déclarées, avec les réponses qui la motivent', () => {
    const [first] = buildOrientations({ reference_accounts: ['Société Générale'] })
    expect(first?.id).toBe('proof')
    expect(first?.evidenceKeys).toEqual(['reference_accounts'])
  })

  it('propose « séparer l’offre » dès deux domaines d’offre', () => {
    const ids = buildOrientations({ offer_domains: ['esn_it', 'conseil'] }).map(o => o.id)
    expect(ids).toContain('offer_split')
  })

  it('propose « revue de décisions » quand du temps commercial protégé est déclaré', () => {
    const ids = buildOrientations({ weekly_sales_time_protected: '5 à 10 heures' }).map(o => o.id)
    expect(ids).toContain('decision_review')
  })

  it('une réponse d’incertitude ne motive aucune orientation', () => {
    expect(buildOrientations({ reference_accounts: [UNKNOWN_ANSWER_LABELS.answer_later] })).toEqual([])
  })
})

describe('buildPointsToDecide — « Les points à trancher » (relecture.N6/N7)', () => {
  it('nomme ce qui reste ouvert sans bloquer l’audit', () => {
    const points = buildPointsToDecide({ esn_name: 'Altimance' }, t)
    expect(points.map(p => p.key)).toContain('priority')
    expect(points.map(p => p.key)).not.toContain('activity')
  })
})

describe('buildFirstExchangePrompt — « Ton premier échange est prêt » (relecture.N3)', () => {
  it('ne cite que ce qui est répondu', () => {
    const prompt = buildFirstExchangePrompt(
      [{ key: 'activity', labelKey: 'k', value: 'Altimance', themeSlug: 'ton-entreprise' }],
      t,
    )
    expect(prompt).toContain('Altimance')
  })

  it('reste une phrase utile quand rien n’est répondu — jamais un profil inventé', () => {
    const prompt = buildFirstExchangePrompt([], t)
    expect(prompt).toBe('firstExchange.promptEmpty')
  })
})

describe('framingDigest — l’empreinte du cadrage relu (relecture.N2)', () => {
  it('est stable, indépendante de l’ordre des clés, et change quand une réponse change', async () => {
    const { framingDigest } = await import('@/features/onboarding/lib/framing-readout')
    const a = await framingDigest({ esn_name: 'Altimance', geo_zones: ['Lyon'] })
    const b = await framingDigest({ geo_zones: ['Lyon'], esn_name: 'Altimance' })
    const c = await framingDigest({ esn_name: 'Altimance', geo_zones: ['Paris'] })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('hasDeclaredTools — des outils déclarés, jamais « connectés » (relecture.A6)', () => {
  it('vrai dès qu’un outil est déclaré, faux sans réponse ni avec une simple incertitude', () => {
    expect(hasDeclaredTools({ tooling_bi: ['Metabase'] })).toBe(true)
    expect(hasDeclaredTools({})).toBe(false)
    expect(hasDeclaredTools({ tooling_bi: UNKNOWN_ANSWER_LABELS.not_yet_known })).toBe(false)
  })
})

// Théo O onboarding-relecture (contrôle 23/10) — « Ton contexte » : la grille de huit cases de la maquette.
describe('buildContextGrid — la grille « Ton contexte » de la relecture', () => {
  it('rend les huit cases dans l’ordre de la maquette, « À préciser » (null) quand rien n’est répondu', () => {
    const cells = buildContextGrid({}, t)
    expect(cells.map(c => c.key)).toEqual([
      'perimeter',
      'activity',
      'role',
      'offer',
      'priority',
      'territory',
      'horizon',
      'limits',
    ])
    expect(cells.every(c => c.value === null)).toBe(true)
  })

  it('le périmètre joint niveau et unité ; l’activité préfère la nature déclarée au nom', () => {
    const cells = buildContextGrid(
      {
        scope_level: 'Mon agence / ma BU',
        scope_unit: 'Agence Lyon',
        esn_name: 'Altimance',
        activity_nature: ['Cabinet de conseil'],
      },
      t,
    )
    expect(cells.find(c => c.key === 'perimeter')?.value).toContain('Agence Lyon')
    expect(cells.find(c => c.key === 'activity')?.value).toContain('Cabinet de conseil')
  })

  it('une réponse mise de côté ne remplit jamais une case', () => {
    const cells = buildContextGrid({ horizon: UNKNOWN_ANSWER_LABELS.answer_later }, t)
    expect(cells.find(c => c.key === 'horizon')?.value).toBeNull()
  })
})
