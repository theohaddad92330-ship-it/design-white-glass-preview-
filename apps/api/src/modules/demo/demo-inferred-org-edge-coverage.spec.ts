import { orgGraphSchema, orgInferredReportings } from '@bellum/contracts'
import { sncfOrgGraph, societeGeneraleOrgGraph } from './demo-org-graphs'

/**
 * #4016 L4.2 — craft rule n°9 : l'arête PROBABLE (déduite des intitulés) se
 * VOIT en démonstration. Elle n'est pas écrite dans le graphe : elle se calcule
 * à la lecture (`orgInferredReportings`, la même dérivation que l'écran). Ce
 * qui doit être vrai, c'est que le graphe semé la PRODUIT — sinon la carte
 * « N+1 probable » serait un écran livré mais vide en réunion.
 */
describe('Démo — au moins une arête « probable » sur un organigramme semé (#4016 L4.2)', () => {
  it('l’organigramme SNCF de la salle produit un N+1 probable, déduit des intitulés', () => {
    const graph = orgGraphSchema.parse(sncfOrgGraph)
    const inferred = orgInferredReportings(graph)
    expect(inferred.length).toBeGreaterThan(0)
    for (const edge of inferred) {
      expect(edge.source).toBe('inferred')
      // Jamais écrite dans le graphe stocké, jamais dans le chemin recommandé.
      expect(graph.hierarchyEdges.some(line => line.fromId === edge.fromId && line.type === 'reports_to')).toBe(false)
      expect(graph.recommendedPath.some(step => step.personId === edge.fromId && step.personId === edge.toId)).toBe(
        false,
      )
    }
  })

  it('sait dire NON : la dérivation ne fabrique rien sur un graphe vide', () => {
    expect(orgInferredReportings(null)).toEqual([])
    const graph = orgGraphSchema.parse(societeGeneraleOrgGraph)
    expect(orgInferredReportings({ ...graph, people: [] })).toEqual([])
  })
})
