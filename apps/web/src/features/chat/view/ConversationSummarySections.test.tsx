import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { mainThreadSources } from '@/features/chat/lib/summary-sources'
import { ConversationMenu } from './ConversationMenu'

/** #3775.1 — les trois anciens déclencheurs vivent désormais dans UN menu « Conversation » : on l'ouvre, puis l'onglet. */
async function openTab(name: string): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Conversation' }))
  await userEvent.click(await screen.findByRole('tab', { name }))
}

/**
 * #1955.24-.29 — le résumé du fil PAR CATÉGORIE. Les cinq premières viennent de
 * l'état structuré servi par `GET /memory/summary` (`sections`) ; les sources
 * principales, des réponses déjà chargées. Une catégorie vide ne fait aucune
 * ligne, pas même son titre.
 */
const SECTIONS = {
  decisions: ['Cibler la DSI en premier'],
  objects: [{ kind: 'account', label: 'SNCF' }],
  pendingActions: [{ action: 'Préparer la relance', target: 'Claire Martin' }],
  corrections: [{ kind: 'excluded', text: 'grands groupes', reason: null }],
  questions: ['Quel périmètre géographique ?'],
}

describe('ConversationSummaryPanel — #1955.24-.29 les catégories du résumé', () => {
  beforeEach(() => vi.mocked(apiFetch).mockReset())

  it('montre chaque catégorie remplie, sous son titre', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      summary: { summary: 'Relance SNCF', updatedAt: '2026-09-16T10:00:00Z', sections: SECTIONS },
    })
    renderWithRouter(
      <ConversationMenu
        hasExchange
        accountId={null}
        conversationId="general"
        sources={[{ kind: 'account', label: 'Dossier SNCF', replies: 3 }]}
      />,
    )
    await openTab('Résumé')
    expect(await screen.findByText('Décisions prises')).toBeInTheDocument()
    expect(screen.getByText('Cibler la DSI en premier')).toBeInTheDocument()
    expect(screen.getByText('Objets concernés')).toBeInTheDocument()
    expect(screen.getByText('Actions en attente')).toBeInTheDocument()
    expect(screen.getByText('Préparer la relance — Claire Martin')).toBeInTheDocument()
    expect(screen.getByText('Corrections')).toBeInTheDocument()
    expect(screen.getByText('Exclu : grands groupes')).toBeInTheDocument()
    expect(screen.getByText('Quel périmètre géographique ?')).toBeInTheDocument()
    expect(screen.getByText('Sources principales')).toBeInTheDocument()
    expect(screen.getByText('Dossier SNCF — citée dans 3 réponses')).toBeInTheDocument()
  })

  it('NON — une catégorie vide ne fait aucune ligne, pas même son titre', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      summary: {
        summary: 'Relance SNCF',
        updatedAt: '2026-09-16T10:00:00Z',
        sections: { ...SECTIONS, decisions: [], corrections: [] },
      },
    })
    renderWithRouter(<ConversationMenu hasExchange accountId={null} conversationId="general" sources={[]} />)
    await openTab('Résumé')
    await screen.findByText('Relance SNCF')
    expect(screen.queryByText('Décisions prises')).toBeNull()
    expect(screen.queryByText('Corrections')).toBeNull()
    expect(screen.queryByText('Sources principales')).toBeNull()
    expect(screen.getByText('Objets concernés')).toBeInTheDocument()
  })
})

describe('mainThreadSources — #1955.29', () => {
  it('classe par nombre de réponses qui citent la source, une fois par réponse', () => {
    const reply = (...labels: string[]) => ({
      role: 'assistant' as const,
      context: { sources: labels.map(label => ({ kind: 'account', label })) },
    })
    expect(
      mainThreadSources([
        reply('SNCF', 'SNCF', 'Pappers'),
        { role: 'user' as const, context: { sources: [{ kind: 'account', label: 'Ignoré' }] } },
        reply('Pappers'),
        reply('SNCF'),
        reply('Signaux'),
        { role: 'assistant' as const, context: null },
      ]),
    ).toEqual([
      { kind: 'account', label: 'SNCF', replies: 2 },
      { kind: 'account', label: 'Pappers', replies: 2 },
      { kind: 'account', label: 'Signaux', replies: 1 },
    ])
  })

  it('NON — aucune réponse sourcée : aucune source', () => {
    expect(mainThreadSources([{ role: 'assistant', context: null }])).toEqual([])
  })
})
