import type React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatResponseContext } from './ContextDisclosure'

/**
 * #1916.24 — le pied de réponse et la mémoire consultée.
 *
 * ⚠️ AUCUNE lecture réseau par bulle : la trace se lit à l'OUVERTURE du panneau.
 * Un fil de quarante réponses ne déclenche aucune requête tant que personne
 * n'ouvre « Voir la source ».
 */

const requested: string[] = []

vi.mock('@/features/memory/hooks/useReplyMemoryUses', () => ({
  useReplyMemoryUses: (messageId: string) => {
    requested.push(messageId)
    return {
      isLoading: false,
      isError: false,
      data: {
        consulted: [
          {
            id: 'f-1',
            text: 'Budget IT voté en Q2',
            scope: 'workspace',
            kind: 'fact',
            origin: 'manual',
            accountId: null,
            expiresAt: null,
          },
        ],
        privateCount: 0,
        removedCount: 0,
      },
    }
  },
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock('./SaveReply', () => ({ SaveReply: () => null }))
// #1919 — le geste de retour a sa propre suite (`ReplyFeedback.test.tsx`) et son
// propre réseau (`useIsDemo` → `useCredits` → `useSession`) : sans ce témoin nul,
// il ferait tomber le pied de réponse ENTIER, que CE fichier garde.
vi.mock('./ReplyFeedback', () => ({ ReplyFeedback: () => null }))

const { ReplyFooter } = await import('./ReplyFooter')

const context: ChatResponseContext = {
  active: {
    profile: { present: true, name: 'MonESN' },
    account: { present: false, name: null },
    contacts_count: 0,
    plan: { present: false },
    portfolio: { present: false, count: 0 },
    memory: { pinned_facts: 1, has_summary: false },
  },
  sources: [],
  not_consulted: [],
}

beforeEach(() => {
  requested.length = 0
})

describe('ReplyFooter — la mémoire consultée, lue à l’ouverture', () => {
  it('une réponse relue avec une trace offre « Voir la source », et ne lit RIEN avant l’ouverture', () => {
    render(
      <ReplyFooter context={undefined} text="R" accountId={null} timestamp={null} messageId="m-1" memoryUses={2} />,
    )
    expect(requested).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: /^(Sources|Contexte)$/ }))
    expect(requested).toEqual(['m-1'])
    expect(screen.getByText('Budget IT voté en Q2')).toBeInTheDocument()
    // Le reste du contexte d'une réponse relue n'est pas conservé : on le dit.
    expect(screen.getByText(/autres sources/)).toBeInTheDocument()
  })

  it('une réponse relue SANS trace n’offre rien — pas de bouton vers un panneau vide', () => {
    render(
      <ReplyFooter context={undefined} text="R" accountId={null} timestamp={null} messageId="m-1" memoryUses={0} />,
    )
    expect(screen.queryByRole('button', { name: /^(Sources|Contexte)$/ })).not.toBeInTheDocument()
    expect(requested).toEqual([])
  })

  it('une réponse vivante enregistrée montre le panneau de transparence ET la mémoire consultée', () => {
    render(<ReplyFooter context={context} text="R" accountId={null} timestamp={null} messageId="m-1" memoryUses={1} />)
    fireEvent.click(screen.getByRole('button', { name: /^(Sources|Contexte)$/ }))
    expect(screen.getByText('Ce qui a servi à cette réponse')).toBeInTheDocument()
    expect(screen.getByText('Mémoire consultée pour cette réponse')).toBeInTheDocument()
    expect(requested).toEqual(['m-1'])
  })

  it('une réponse pas (encore) enregistrée garde le panneau d’avant, sans lecture de trace', () => {
    render(<ReplyFooter context={context} text="R" accountId={null} timestamp={null} />)
    fireEvent.click(screen.getByRole('button', { name: /^(Sources|Contexte)$/ }))
    expect(screen.getByText('Ce qui a servi à cette réponse')).toBeInTheDocument()
    expect(screen.queryByText('Mémoire consultée pour cette réponse')).not.toBeInTheDocument()
    expect(requested).toEqual([])
  })
})
