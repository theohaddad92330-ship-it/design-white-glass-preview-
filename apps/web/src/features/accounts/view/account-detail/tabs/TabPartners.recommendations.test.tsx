import { screen } from '@testing-library/react'
import type { Account } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { TabPartners } from './TabPartners'

/**
 * recette 10/09 — « Par où entrer, périmètre par périmètre », mesuré sur BNP
 * Paribas : 16 périmètres, chacun avec exactement la même phrase — « On
 * ignore si un rang 1 tient ce périmètre. Attaquer en direct sans le savoir,
 * c'est jouer à pile ou face. ». `rank1Recommendation` (packages/contracts)
 * rend cette phrase STATIQUE pour tout périmètre au rang 1 inconnu : elle est
 * une propriété de l'état `find_out`, jamais du périmètre lui-même — donc
 * IDENTIQUE dès que plusieurs périmètres partagent cet état. Une phrase juste
 * qui explique une règle se dit une fois pour la liste, pas une fois par
 * ligne (loi 4 du tome 7).
 *
 * ⚠️ Un identifiant DIFFÉRENT par test : `renderWithRouter` partage un
 * `QueryClient` de niveau module (voir `TabPartners.observed.test.tsx`).
 */
const account = (id: string) => ({ id, company_name: 'BNP Paribas' }) as unknown as Account

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))

const findOutReason =
  'On ignore si un rang 1 tient ce périmètre. Attaquer en direct sans le savoir, c’est jouer à pile ou face.'

function recommendation(entityId: string, entityName: string) {
  return {
    entity_id: entityId,
    entity_name: entityName,
    rank1_incumbent: 'unknown' as const,
    play: 'find_out' as const,
    partner: null,
    reason: findOutReason,
  }
}

describe('TabPartners — la raison d’un périmètre se dit une fois pour la liste (recette 10/09)', () => {
  it('n’écrit qu’UNE fois la même phrase sur seize périmètres tous au rang 1 inconnu', async () => {
    const recommendations = Array.from({ length: 16 }, (_, i) => recommendation(`e-${i}`, `Périmètre ${i + 1}`))
    apiFetch.mockResolvedValue({ partners: [], recommendations, observed: [] })
    renderWithRouter(<TabPartners account={account('a-reco-16')} />)

    expect(await screen.findByText('Périmètre 16')).toBeInTheDocument()
    expect(screen.getAllByText(findOutReason)).toHaveLength(1)
    // Chaque périmètre reste nommé — dédupliquer la phrase ne doit pas faire
    // disparaître les périmètres eux-mêmes.
    for (let i = 1; i <= 16; i++) {
      expect(screen.getByText(`Périmètre ${i}`)).toBeInTheDocument()
    }
  })

  it('« Périmètre non déterminé » (le seau de résidu) ne se met jamais en tête de son groupe', async () => {
    const recommendations = [
      recommendation('e-unresolved', 'Périmètre non déterminé'),
      recommendation('e-1', 'BNP Paribas Personal Finance'),
      recommendation('e-2', 'BNP Paribas Leasing Solutions'),
    ]
    apiFetch.mockResolvedValue({ partners: [], recommendations, observed: [] })
    renderWithRouter(<TabPartners account={account('a-reco-residual')} />)

    await screen.findByText('BNP Paribas Personal Finance')
    const names = screen.getAllByText(/^(BNP Paribas|Périmètre non déterminé)/).map(node => node.textContent)
    expect(names[0]).not.toBe('Périmètre non déterminé')
    expect(names.at(-1)).toBe('Périmètre non déterminé')
  })

  it('deux raisons différentes se disent chacune une fois, groupées séparément', async () => {
    const recommendations = [
      recommendation('e-1', 'Périmètre A'),
      recommendation('e-2', 'Périmètre B'),
      {
        entity_id: 'e-3',
        entity_name: 'Périmètre C',
        rank1_incumbent: 'no' as const,
        play: 'direct' as const,
        partner: null,
        reason: 'Aucun rang 1 en place : le chemin direct est ouvert.',
      },
    ]
    apiFetch.mockResolvedValue({ partners: [], recommendations, observed: [] })
    renderWithRouter(<TabPartners account={account('a-reco-two-groups')} />)

    await screen.findByText('Périmètre C')
    expect(screen.getAllByText(findOutReason)).toHaveLength(1)
    expect(screen.getAllByText('Aucun rang 1 en place : le chemin direct est ouvert.')).toHaveLength(1)
  })
})
