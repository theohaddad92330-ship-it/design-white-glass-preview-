import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EntitiesGraphCard } from './EntitiesGraphCard'
import { countListedEntities } from './entities/listedEntities'

vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

/**
 * #4612 — le compteur de l'onglet Sites annonçait « 13 unités » pour deux groupes dont la liste montrait 5 entités :
 * il comptait un autre ensemble que celui qu'il surplombe. Il lit maintenant LA fonction que la liste utilise.
 */
const entities = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Filiale ${i}`, type: 'filiale' }))

function listedRows(count: number) {
  // Une ligne d'en-tête + une ligne par entité listée (la liste montre 5 lignes au plus avant « Voir tout »).
  return screen.getAllByRole('row').length - 1 - (count > 5 ? 0 : 0)
}

describe('#4612 — le compteur d’entités annonce ce que la liste montre', () => {
  it.each([2, 4])('un groupe de %i entités : compteur = lignes de la liste', n => {
    const { unmount } = render(
      <EntitiesGraphCard entities={entities(n)} rootName="Groupe" sites={[]} siteCategoryFilter="all" />,
    )
    expect(countListedEntities(entities(n), null, 'Groupe', [], [], 'all')).toBe(n)
    expect(listedRows(n)).toBe(n)
    unmount()
  })

  it('deux jeux de données différents rendent deux valeurs différentes', () => {
    const a = countListedEntities(entities(2), null, 'Groupe', [], [], 'all')
    const b = countListedEntities(entities(4), null, 'Groupe', [], [], 'all')
    expect(a).not.toBe(b)
  })

  it('aucune entité listée = null (non mesuré), jamais 0', () => {
    expect(countListedEntities(null, null, 'Groupe', [], [], 'all')).toBeNull()
  })
})
