/**
 * #3717 — un script de préparation est un texte GÉNÉRÉ : il ne vaut pas
 * réponse du client. La famille « contexte » n'est donc jamais sautée.
 */
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DISCOVERY_QUESTIONS } from '@bellum/contracts'
import { QuestionLibraryCard } from './QuestionLibraryCard'

vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...props }: any) => <div {...props}>{children}</div>,
    },
  ),
}))

describe('QuestionLibraryCard — pas de réponse déduite d’un texte généré (#3717)', () => {
  it('pose toujours la première question de contexte', () => {
    render(<QuestionLibraryCard />)

    expect(screen.getByText(DISCOVERY_QUESTIONS.context[0] as string)).toBeInTheDocument()
  })
})
