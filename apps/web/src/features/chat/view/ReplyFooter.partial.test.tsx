import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatResponseContext } from './ContextDisclosure'

/**
 * #2840 (#2441.13) — LE MODE DÉGRADÉ ANNONCÉ.
 *
 * `context.partial` (`apps/ia/app/routers/chat.py`, `_partial_response`) marque
 * un tour arrêté avant la fin — délai dépassé ou panne. La prose l'explique déjà
 * dans le texte de la réponse ; le repère STRUCTURÉ, toujours visible (pas derrière le
 * panneau replié), est désormais le `ReplyHeader` en tête de la réponse (#3761.16, composé
 * par `Chat.tsx` — voir `Chat.reply-kit.test.tsx`). Le pied ne le répète PLUS (GA-26).
 */

vi.mock('./SaveReply', () => ({ SaveReply: () => null }))
vi.mock('./ReplyFeedback', () => ({ ReplyFeedback: () => null }))

const { ReplyFooter } = await import('./ReplyFooter')

function contextWithPartial(partial: ChatResponseContext['partial']): ChatResponseContext {
  return {
    active: {
      profile: { present: false, name: null },
      account: { present: false, name: null },
      contacts_count: 0,
      plan: { present: false },
      portfolio: { present: false, count: 0 },
      memory: { pinned_facts: 0, has_summary: false },
    },
    sources: [],
    not_consulted: [],
    partial,
  }
}

describe('ReplyFooter — le mode dégradé n’est annoncé qu’en tête, jamais dans le pied', () => {
  it.each([
    ['le délai', { reason: 'turn_timeout', as_of: '2026-09-25T10:00:00.000Z' }],
    ['une panne', { reason: 'turn_error' }],
    ['un motif inconnu', { reason: 'un_motif_pas_encore_reconnu' }],
  ])('un tour arrêté par %s : le pied ne dit rien (l’en-tête le porte)', (_name, partial) => {
    render(
      <ReplyFooter
        context={contextWithPartial(partial)}
        text="Voici ce qui a déjà été récupéré."
        accountId={null}
        timestamp={null}
      />,
    )
    expect(screen.queryByText(/Réponse partielle/)).not.toBeInTheDocument()
  })
})
