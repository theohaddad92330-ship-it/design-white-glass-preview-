import { PARTNER_STAGES } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { partnerStageSummary } from './partnerStageSummary'

describe('partnerStageSummary', () => {
  it('rend les HUIT étapes, dans l’ordre du parcours, même à zéro', () => {
    const summary = partnerStageSummary([{ stage: 'flux_actif' }])
    expect(summary.counts.map(c => c.stage)).toEqual([...PARTNER_STAGES])
    // « Aucun cadre signé » est précisément ce qu'un dirigeant vient chercher :
    // ce zéro-là est MESURÉ, contrairement à celui des compteurs de flux.
    expect(summary.counts.find(c => c.stage === 'cadre_signe')?.count).toBe(0)
    expect(summary.counts.find(c => c.stage === 'flux_actif')?.count).toBe(1)
  })

  it('compte plusieurs relations sur la même étape', () => {
    const summary = partnerStageSummary([{ stage: 'dormant' }, { stage: 'dormant' }, { stage: 'identifie' }])
    expect(summary.counts.find(c => c.stage === 'dormant')?.count).toBe(2)
    expect(summary.total).toBe(3)
  })

  it('une étape inconnue n’est rangée nulle part — mais elle reste dans le total', () => {
    // Une ligne plus ancienne que l'énumération ne doit pas gonfler
    // « Identifié », qu'elle n'est pas. Le total, lui, compte ce qui a été LU :
    // sinon la somme des pastilles ne ferait pas le nombre de cartes affichées.
    const summary = partnerStageSummary([{ stage: 'une_etape_disparue' }, { stage: 'identifie' }])
    expect(summary.counts.find(c => c.stage === 'identifie')?.count).toBe(1)
    expect(summary.counts.reduce((sum, c) => sum + c.count, 0)).toBe(1)
    expect(summary.total).toBe(2)
  })

  it('une liste vide rend huit zéros et un total nul', () => {
    const summary = partnerStageSummary([])
    expect(summary.total).toBe(0)
    expect(summary.counts).toHaveLength(PARTNER_STAGES.length)
    expect(summary.counts.every(c => c.count === 0)).toBe(true)
  })
})
