import { formatRelationshipMemory } from './relationship-memory'

/**
 * Mémoire de relation — bloc « Mémoire » de la couche zéro (annexe méthodo p8).
 * On n'affiche que ce qui est SAISI ; rien n'est deviné.
 */
describe('formatRelationshipMemory', () => {
  it('rend les champs saisis, dans l’ordre de la page', () => {
    const text = formatRelationshipMemory({
      relation: 'ancien client',
      lastContactAt: '2026-03-01',
      owner: 'Sophie',
      nextReviewAt: '2026-09-01',
      issue: 'pas de budget cette année',
      source: 'CRM + réseau',
    })
    expect(text).toContain('MÉMOIRE DE RELATION')
    expect(text).toContain('ancien client')
    expect(text).toContain('Sophie')
    expect(text).toContain('pas de budget cette année')
  })

  it('n’affiche pas un champ vide', () => {
    const text = formatRelationshipMemory({ relation: 'référé par X', owner: '   ' })
    expect(text).toContain('référé par X')
    expect(text).not.toContain('Owner')
  })

  it('renvoie une chaîne vide quand rien n’est saisi', () => {
    expect(formatRelationshipMemory(null)).toBe('')
    expect(formatRelationshipMemory({})).toBe('')
    expect(formatRelationshipMemory({ relation: '  ' })).toBe('')
  })
  /**
   * #1085 — « je connais mon avantage concurrentiel […] je pourrais aider Bellum
   * à me construire une stratégie entre mes infos, les siennes et sa démarche. »
   *
   * Ce que le commercial sait de SA position (concurrent en place, référence
   * comparable) n'est PAS un fait sur la relation. Les confondre ferait conclure
   * « ce compte n'est pas froid » à quelqu'un qui a seulement écrit ce qu'il
   * sait vendre — et le plan partirait d'une relation qui n'existe pas.
   */
  it('ne conclut JAMAIS « pas froid » sur le seul avantage concurrentiel', () => {
    const text = formatRelationshipMemory({ competitiveEdge: 'On a déjà fait cette bascule chez un concurrent.' })
    expect(text).toContain('On a déjà fait cette bascule')
    expect(text).not.toContain('PAS froid')
    expect(text).not.toContain('MÉMOIRE DE RELATION')
  })

  it('rend les deux blocs sans les confondre', () => {
    const text = formatRelationshipMemory({
      relation: 'référé par Untel',
      competitiveEdge: 'Sopra est en place jusqu’en 2027.',
    })
    expect(text).toContain('MÉMOIRE DE RELATION')
    expect(text).toContain('PAS froid')
    expect(text).toContain('Sopra est en place')
    // Le bloc de position vient APRÈS : il ne se lit pas comme une preuve de relation.
    expect(text.indexOf('PAS froid')).toBeLessThan(text.indexOf('Sopra est en place'))
  })

  it('ignore un avantage en blancs', () => {
    expect(formatRelationshipMemory({ competitiveEdge: '   ' })).toBe('')
  })
})
