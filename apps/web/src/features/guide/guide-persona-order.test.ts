import { describe, expect, it } from 'vitest'
import { workspaceRoleValues, type GuidePersona, type WorkspaceRole } from '@bellum/contracts'
import { guidePersonaOf, KNOWN_GUIDE_PERSONAS, orderGuidesByPersona } from './guide-persona-order'

/**
 * #2214.17-.22 (épopée #2788) — le rôle CHANGE L'ORDRE du catalogue de guides,
 * jamais son contenu (`c76_role_reordonne_jamais_ne_filtre`) — voir le
 * docblock du fichier testé.
 */
type Item = { id: string; audience: readonly GuidePersona[] }

describe('orderGuidesByPersona', () => {
  const items: Item[] = [
    { id: 'a', audience: ['recruteur'] },
    { id: 'b', audience: [] },
    { id: 'c', audience: ['commercial'] },
    { id: 'd', audience: ['adv_finance'] },
  ]

  it('même ENSEMBLE, même NOMBRE — jamais un filtre', () => {
    const ordered = orderGuidesByPersona(items, 'sales', item => item.audience)
    expect(ordered).toHaveLength(items.length)
    expect(new Set(ordered.map(i => i.id))).toEqual(new Set(items.map(i => i.id)))
  })

  it('un guide d’audience VIDE ou qui cite le persona de l’appelant passe en tête', () => {
    const ordered = orderGuidesByPersona(items, 'sales', item => item.audience)
    expect(ordered.map(i => i.id)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('le tri est STABLE — deux guides du même rang gardent l’ordre d’origine', () => {
    const twoUniversal: Item[] = [
      { id: 'first', audience: [] },
      { id: 'second', audience: [] },
    ]
    expect(orderGuidesByPersona(twoUniversal, 'recruiter', i => i.audience).map(i => i.id)).toEqual(['first', 'second'])
  })

  it('un rôle `null`/absent retombe sur le persona commercial (défaut du registre actuel)', () => {
    expect(orderGuidesByPersona(items, null, i => i.audience).map(i => i.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(orderGuidesByPersona(items, undefined, i => i.audience).map(i => i.id)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('sait dire NON — un persona qui ne matche RIEN dans `audience` reste en second rang', () => {
    const ordered = orderGuidesByPersona(items, 'recruiter', item => item.audience)
    // Seul 'a' (recruteur) et 'b' (vide) passent en tête ; 'c' et 'd' suivent.
    expect(
      ordered
        .slice(0, 2)
        .map(i => i.id)
        .sort(),
    ).toEqual(['a', 'b'])
  })
})

describe('guidePersonaOf', () => {
  it('couvre TOUS les rôles connus — un rôle ajouté sans entrée retombe sur commercial', () => {
    for (const role of workspaceRoleValues) {
      expect(KNOWN_GUIDE_PERSONAS).toContain(guidePersonaOf(role as WorkspaceRole))
    }
  })

  it('mappe recruiter → recruteur, finance → adv_finance — les deux rôles ESN neufs (BEL-ARCH-001)', () => {
    expect(guidePersonaOf('recruiter')).toBe('recruteur')
    expect(guidePersonaOf('finance')).toBe('adv_finance')
  })

  it('owner/admin/tech_admin → administrateur', () => {
    expect(guidePersonaOf('owner')).toBe('administrateur')
    expect(guidePersonaOf('admin')).toBe('administrateur')
    expect(guidePersonaOf('tech_admin')).toBe('administrateur')
  })

  it('`null`/absent/inconnu → commercial, jamais une erreur', () => {
    expect(guidePersonaOf(null)).toBe('commercial')
    expect(guidePersonaOf(undefined)).toBe('commercial')
  })
})
