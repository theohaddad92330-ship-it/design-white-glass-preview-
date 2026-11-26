import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #1910.8 — l'état « conversation partagée », à l'écran.
 *
 * Le calcul est gardé par `shared-conversation.test.ts` ; ce fichier garde
 * l'AUTRE moitié — celle qui manque le plus souvent dans ce dépôt : que la
 * chose calculée soit RENDUE, et qu'elle ne soit pas rendue quand elle n'est pas
 * mesurée.
 */
vi.mock('@/features/chat/hooks/useSelfChatAuthor', () => ({
  useSelfChatAuthor: () => ({ firstName: 'Théo', avatarUrl: null }),
}))

const { SharedConversationState } = await import('./SharedConversationState')

const me = { firstName: 'Théo', avatarUrl: null }
const sarah = { firstName: 'Sarah', avatarUrl: null }
const lea = { firstName: 'Léa', avatarUrl: null }

describe('SharedConversationState', () => {
  it('un fil à soi n’affiche RIEN — pas une pastille vide', () => {
    const { container } = render(
      <SharedConversationState
        messages={[
          { role: 'user', author: me },
          { role: 'assistant', author: null },
        ]}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('un collègue qui a écrit est NOMMÉ', () => {
    render(
      <SharedConversationState
        messages={[
          { role: 'user', author: me },
          { role: 'user', author: sarah },
        ]}
      />,
    )
    expect(screen.getByText('Partagée avec Sarah')).toBeInTheDocument()
  })

  it('au-delà d’un collègue, la mention COMPTE — et l’infobulle les nomme tous', () => {
    render(
      <SharedConversationState
        messages={[
          { role: 'user', author: sarah },
          { role: 'user', author: lea },
        ]}
      />,
    )
    expect(screen.getByText('Partagée avec 2 collègues')).toBeInTheDocument()
    expect(screen.getByTitle(/Sarah, Léa/)).toBeInTheDocument()
  })
})
