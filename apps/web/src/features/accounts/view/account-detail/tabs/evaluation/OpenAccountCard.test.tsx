import type { AccountIntelligenceContextView } from '@bellum/contracts'
import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { OpenAccountCard } from './OpenAccountCard'

// #2786/#2285.9 — `OpenAccountCard` (onglet Score) lit désormais « par où
// ouvrir » au contexte canonique, jamais recalculé depuis
// `raw_analysis.comment_ouvrir_compte` : ce fichier mocke la façade, pas
// `raw_analysis`. Même façade, même helper (`accountOpeningStrategyView`) que
// `OpeningStrategyCard` (onglet Analyser) — voir #2285.23 (NO-GO : deux
// écrans, deux vérités).
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

describe('OpenAccountCard', () => {
  it('se TAIT quand la façade n’a pas répondu — une lecture indisponible n’est pas un constat', () => {
    useAccountIntelligenceContext.mockReturnValue({ data: undefined })
    const { container } = renderWithRouter(<OpenAccountCard accountId="acc-1" />)
    expect(container.textContent).toBe('')
  })

  it('ne rend rien quand ni une porte ni une narration n’ont gagné l’arbitrage', () => {
    useAccountIntelligenceContext.mockReturnValue({ data: context() })
    const { container } = renderWithRouter(<OpenAccountCard accountId="acc-1" />)
    expect(container.textContent).toBe('')
  })

  it('rend la narration du modèle quand aucune porte n’a été nommée', async () => {
    useAccountIntelligenceContext.mockReturnValue({
      data: context({
        recommendations: [
          {
            id: 'opening-strategy',
            label: 'Entrer par un audit flash avant le référencement fournisseur.',
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
    renderWithRouter(<OpenAccountCard accountId="acc-1" />)
    expect(await screen.findByText('Entrer par un audit flash avant le référencement fournisseur.')).toBeInTheDocument()
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
        recommendations: [
          {
            id: 'opening-strategy',
            label: 'Ignorée : une porte a gagné.',
            detail: null,
            nature: 'inference',
            provenance: { source: 'inference', observedAt: null },
            freshness: 'undated',
            confidence: { level: 'deduced', corroborationCount: null },
            limit: 'not_a_commitment',
            check: 'confirm_with_contact',
            action: 'open_contacts',
          },
        ],
      }),
    })
    renderWithRouter(<OpenAccountCard accountId="acc-1" />)
    expect(await screen.findByText('Filiale de paiement')).toBeInTheDocument()
    expect(screen.getByText(/Direction technique/)).toBeInTheDocument()
    expect(screen.getByText('Décide seule.')).toBeInTheDocument()
    expect(screen.queryByText('Ignorée : une porte a gagné.')).not.toBeInTheDocument()
  })
})
