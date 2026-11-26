import { describe, expect, it } from 'vitest'
import { checkToolDailyCap, parseToolDailyCaps, toolDailyCapStatus } from './tool-daily-cap.js'

describe('parseToolDailyCaps — sans clé = no-op strict (#2440.45)', () => {
  it('rend une table VIDE quand la variable est absente ou vide', () => {
    expect(parseToolDailyCaps(undefined)).toEqual({})
    expect(parseToolDailyCaps('')).toEqual({})
    expect(parseToolDailyCaps('   ')).toEqual({})
  })

  it('lit `outil=dollars` séparés par des virgules', () => {
    expect(parseToolDailyCaps('analysis=20, enrichment=2.5')).toEqual({ analysis: 20, enrichment: 2.5 })
  })

  it('ignore une entrée illisible, nulle ou négative — une saisie aberrante ne bloque jamais un outil', () => {
    expect(parseToolDailyCaps('analysis=0,enrichment=-3,discover=abc,=4,chat,need_play=1')).toEqual({ need_play: 1 })
  })

  it('refuse une clé qui n’a pas la forme d’une fonctionnalité du registre', () => {
    expect(parseToolDailyCaps('Analysis=2,analysis;drop=1,need-play=1')).toEqual({})
  })
})

describe('checkToolDailyCap — la limite PAR OUTIL, distincte du budget (#2440.45 / #2440.48)', () => {
  it('laisse passer sans rien lire quand l’outil n’a pas de quota', () => {
    expect(checkToolDailyCap({}, 'analysis', 999, 1)).toEqual({ allowed: true })
  })

  it('laisse passer sous le quota et pile au quota — seul le DÉPASSEMENT compte', () => {
    expect(checkToolDailyCap({ analysis: 10 }, 'analysis', 9, 1)).toEqual({ allowed: true })
  })

  it('refuse au-delà et NOMME la limite (`tool_daily_cap`) et l’outil par son métier', () => {
    const verdict = checkToolDailyCap({ analysis: 10 }, 'analysis', 9.5, 1)
    expect(verdict).toEqual({ allowed: false, overCap: 'tool_daily_cap', message: expect.any(String) })
    if (verdict.allowed) throw new Error('attendu refusé')
    expect(verdict.message).toContain('analyse')
    expect(verdict.message).toContain('quotidien')
    // #2440.49 — jamais « plus de crédits » pour une limite qui n'en est pas une.
    expect(verdict.message).not.toMatch(/crédit/i)
  })

  it('nomme un outil sans libellé métier par la NATURE (« cet outil »), jamais par sa clé interne', () => {
    const verdict = checkToolDailyCap({ need_play: 1 }, 'need_play', 1, 1)
    if (verdict.allowed) throw new Error('attendu refusé')
    expect(verdict.message).not.toContain('need_play')
    expect(verdict.message).toContain('cet outil')
  })

  it('le quota d’un outil ne pèse jamais sur un autre outil', () => {
    expect(checkToolDailyCap({ enrichment: 1 }, 'analysis', 50, 1)).toEqual({ allowed: true })
  })
})

describe('toolDailyCapStatus — la MESURE back-office, une ligne par outil réglé', () => {
  it('ne rend aucune ligne quand aucun quota n’est réglé (on n’affiche pas ce qu’on n’a pas)', () => {
    expect(toolDailyCapStatus({}, [{ feature: 'analysis', costUsd: 3 }])).toEqual([])
  })

  it('somme la dépense du jour par outil, compte À PART les lignes non tarifées (jamais 0 $)', () => {
    const rows = [
      { feature: 'analysis', costUsd: 3 },
      { feature: 'analysis', costUsd: null },
      { feature: 'analysis', costUsd: 1.5 },
      { feature: 'enrichment', costUsd: 0.2 },
    ]
    expect(toolDailyCapStatus({ analysis: 10, discover: 2 }, rows)).toEqual([
      { tool: 'analysis', capUsd: 10, spentTodayUsd: 4.5, unpricedLines: 1, reached: false },
      { tool: 'discover', capUsd: 2, spentTodayUsd: 0, unpricedLines: 0, reached: false },
    ])
  })

  it('dit `reached` quand la dépense mesurée atteint le quota', () => {
    expect(toolDailyCapStatus({ enrichment: 1 }, [{ feature: 'enrichment', costUsd: 1 }])).toEqual([
      { tool: 'enrichment', capUsd: 1, spentTodayUsd: 1, unpricedLines: 0, reached: true },
    ])
  })
})
