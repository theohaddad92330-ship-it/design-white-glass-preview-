import type { OrgGraph } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import { buildContactCoverageFunnel } from './contactCoverageFunnel'

/**
 * #2552.1 — le funnel détectés → vérifiés → pertinents → enrichis. Ce test
 * SAIT DIRE NON : si une régression remplace `attachedToEntity` (non mesuré
 * aujourd'hui) par `?? 0`, l'assertion `toBeNull()` rougit — « 0 pertinent »
 * mentirait exactement comme « 0 rattaché » a menti sur AIRBUS (GA-114).
 */
function graphWithCoverage(coverage: Record<string, unknown> | undefined): OrgGraph {
  return { coverage, hierarchyEdges: [], uncoveredZones: [] } as unknown as OrgGraph
}

describe('buildContactCoverageFunnel (#2552.1)', () => {
  it('rend les quatre nombres dans l’ordre détectés → vérifiés → pertinents → enrichis', () => {
    const graph = graphWithCoverage({
      discovered: 2027,
      attachedToEntity: 86,
      deterministicClassified: 314,
      llmEnriched: 11,
    })
    const stages = buildContactCoverageFunnel(graph, 2027)
    expect(stages).toEqual([
      { key: 'discovered', value: 2027 },
      { key: 'verified', value: 314 },
      { key: 'relevant', value: 86 },
      { key: 'enriched', value: 11 },
    ])
  })

  it('« pertinents » non mesuré reste NULL, jamais coercé à 0 (GA-18/GA-19)', () => {
    const graph = graphWithCoverage({
      discovered: 5,
      // attachedToEntity absent — trou nommé du contrat.
      deterministicClassified: 5,
      llmEnriched: 5,
    })
    const stages = buildContactCoverageFunnel(graph, 5)
    const relevant = stages?.find(stage => stage.key === 'relevant')
    expect(relevant?.value).toBeNull()
  })

  it('le premier nombre suit le LIVE (contacts.length), pas l’instantané du dernier run', () => {
    const graph = graphWithCoverage({ discovered: 5, deterministicClassified: 5, llmEnriched: 5 })
    // Élargir la recherche (#2552.2) a ajouté des contacts depuis ce run.
    const stages = buildContactCoverageFunnel(graph, 12)
    expect(stages?.[0]).toEqual({ key: 'discovered', value: 12 })
  })

  it('aucune couverture mesurée ⇒ aucun funnel (un funnel de zéros n’apprend rien)', () => {
    const graph = graphWithCoverage(undefined)
    expect(buildContactCoverageFunnel(graph, 42)).toBeNull()
  })
})
