import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/features/chat/api/chatModeEstimateApi', () => ({
  chatModeEstimateApi: { estimate: vi.fn() },
}))

import { ResearchModeSelector } from './ResearchModeSelector'

// #3709 — « Approfondi » tronqué (44 px pour 60 px) et l'indice de politique à 248 px dans 176 px :
// le déclencheur ne se laisse plus écraser sous son contenu, l'indice a la largeur de son texte.
describe('#3709 — le sélecteur de mode ne tronque plus son libellé ni son indice', () => {
  it('le déclencheur garde la largeur de son contenu (min-w-fit, shrink-0)', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ResearchModeSelector conversationId="c1" />
      </QueryClientProvider>,
    )
    const trigger = screen.getByRole('combobox')
    expect(trigger.className).toContain('min-w-fit')
    expect(trigger.className).toContain('shrink-0')
    expect(trigger.className).not.toMatch(/(^|\s)min-w-0(\s|$)/)
  })

  it('#3774.2.2 — aucune phrase de politique permanente dans la barre', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ResearchModeSelector conversationId="c1" />
      </QueryClientProvider>,
    )
    expect(screen.queryByTestId('chat-research-mode-policy')).toBeNull()
  })
})
