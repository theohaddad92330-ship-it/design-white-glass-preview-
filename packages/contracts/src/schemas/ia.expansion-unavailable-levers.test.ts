import { describe, expect, it } from 'vitest'
import { CONTACT_EXPANSION_UNAVAILABLE_LEVERS } from './ia.js'

/**
 * #2934 (#2309.24/.26/.28) — les trois leviers d'élargissement ciblé sans axe
 * dédié aujourd'hui : famille de rôles voisine (partiel, repli thème libre),
 * site (absent), opérationnels (absent).
 */
describe('CONTACT_EXPANSION_UNAVAILABLE_LEVERS (#2934, #2309.24/.26/.28)', () => {
  it('nomme exactement les trois leviers sans axe dédié', () => {
    expect([...CONTACT_EXPANSION_UNAVAILABLE_LEVERS].sort()).toEqual(
      ['adjacent_role_family', 'site', 'operational_staff'].sort(),
    )
  })
})
