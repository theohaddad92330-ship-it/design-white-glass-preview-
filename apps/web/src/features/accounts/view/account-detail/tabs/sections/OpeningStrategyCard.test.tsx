import type { AccountIntelligenceContextView } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { OpeningStrategyCard } from './OpeningStrategyCard'

// #2786/#2285.3 — `OpeningStrategyCard` lit désormais « par où ouvrir » au
// contexte canonique (`useAccountIntelligenceContext`), jamais recalculé
// depuis `raw_analysis.comment_ouvrir_compte` : ce fichier mocke la façade.
const useAccountIntelligenceContext = vi.hoisted(() => vi.fn())
vi.mock('@/features/accounts/hooks/useAccountIntelligenceContext', () => ({ useAccountIntelligenceContext }))

function context(
  over: Partial<Pick<AccountIntelligenceContextView, 'entryPaths' | 'recommendations'>> = {},
): AccountIntelligenceContextView {
  return {
    accountId: 'acc-1',
    // #3219 (#190.1) — aucune contradiction de champ ouverte sur ce compte.
    conflicts: [],
    companyName: { state: 'unknown' },
    sector: { state: 'unknown' },
    headquarters: { state: 'unknown' },
    marketMemory: {
      provenance: { source: 'market_memory', observedAt: null },
      read: { status: 'unavailable', reason: 'hors sujet de ce test' },
    },
    incumbentEsn: { state: 'unknown' },
    technologies: { state: 'unknown' },
    entryPaths: { state: 'unknown' },
    recommendations: [],
    ...over,
  }
}

describe('OpeningStrategyCard', () => {
  it('se TAIT quand la façade n’a pas répondu — une lecture indisponible n’est pas un constat', () => {
    useAccountIntelligenceContext.mockReturnValue({ data: undefined })
    const { container } = renderWithRouter(<OpeningStrategyCard accountId="acc-1" />)
    expect(container.textContent).toBe('')
  })

  it('ne rend rien quand ni une porte ni une narration n’ont gagné l’arbitrage', () => {
    useAccountIntelligenceContext.mockReturnValue({ data: context() })
    const { container } = renderWithRouter(<OpeningStrategyCard accountId="acc-1" />)
    expect(container.textContent).toBe('')
  })

  it('rend une narration du modèle comme une DÉDUCTION, avec sa source et sa date', async () => {
    useAccountIntelligenceContext.mockReturnValue({
      data: context({
        recommendations: [
          {
            id: 'opening-strategy',
            label: 'Entrer par la filiale paiement, pas par le siège.',
            detail: null,
            nature: 'inference',
            provenance: { source: 'inference', observedAt: '2026-08-30T09:00:00.000Z' },
            freshness: 'ageing',
            confidence: { level: 'deduced', corroborationCount: null },
            limit: 'not_a_commitment',
            check: 'confirm_with_contact',
            action: 'open_contacts',
          },
        ],
      }),
    })
    // #3672 revient sur le libellé « déduit par le modèle », délibérément ; ce qui tient :
    // la narration reste une DÉDUCTION (« Hypothèse à valider ») avec sa date.
    renderWithRouter(<OpeningStrategyCard accountId="acc-1" />)
    expect(await screen.findByText('Par où ouvrir ce compte')).toBeInTheDocument()
    expect(screen.getByText('Entrer par la filiale paiement, pas par le siège.')).toBeInTheDocument()
    expect(screen.getByText(/Hypothèse à valider/)).toBeInTheDocument()
    expect(screen.getByText(/30 août 2026/)).toBeInTheDocument()
    expect(screen.getByText(/hypothèse à confirmer/)).toBeInTheDocument()
  })

  it('rend les points d’entrée d’une porte NOMMÉE (DataForge) — jamais la narration du modèle à côté', async () => {
    useAccountIntelligenceContext.mockReturnValue({
      data: context({
        entryPaths: {
          state: 'known',
          value: [
            { label: 'Filiale de paiement', targetProfile: 'Direction technique', justification: 'Décide seule.' },
          ],
          provenance: { source: 'dataforge', observedAt: '2026-08-20T00:00:00.000Z' },
        },
      }),
    })
    renderWithRouter(<OpeningStrategyCard accountId="acc-1" />)
    expect(await screen.findByText('Filiale de paiement')).toBeInTheDocument()
    expect(screen.getByText(/Direction technique/)).toBeInTheDocument()
    expect(screen.getByText('Décide seule.')).toBeInTheDocument()
    // #3672 revient sur « mémoire marché (faits) », délibérément ; ce qui tient : la porte nommée
    // porte sa propre étiquette (« Historique observé »), distincte de l'hypothèse.
    expect(screen.getByText(/Historique observé/)).toBeInTheDocument()
    // Une porte NOMMÉE n'est pas une hypothèse à confirmer : c'est un fait
    // observé sur un corpus de parcours, pas une inférence du modèle.
    expect(screen.queryByText(/hypothèse à confirmer/)).not.toBeInTheDocument()
  })

  /**
   * « Non mesuré » n'est jamais « 0 » — ni, ici, un blanc. Un point d'entrée
   * dont l'analyse n'a écrit ni l'interlocuteur ni la raison le DIT, au lieu de
   * rendre une ligne muette qu'on lirait comme « rien à savoir ».
   */
  it('names what is missing on an entry point', async () => {
    useAccountIntelligenceContext.mockReturnValue({
      data: context({
        entryPaths: {
          state: 'known',
          value: [{ label: 'Industrialisation IA', targetProfile: null, justification: null }],
          provenance: { source: 'inference', observedAt: null },
        },
      }),
    })
    renderWithRouter(<OpeningStrategyCard accountId="acc-1" />)
    expect(await screen.findByText('Interlocuteur non précisé par l’analyse')).toBeInTheDocument()
    expect(screen.getByText('Raison non écrite par l’analyse')).toBeInTheDocument()
  })
})
