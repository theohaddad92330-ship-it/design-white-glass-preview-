import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #3761.16 — `ReplyDensityProvider density="compact"` se pose sous 768 px
 * (`useIsMobile`, même borne que tout le reste du dépôt, GA-26). Le faux
 * `useIsMobile` doit être posé AVANT l'import du module testé (même patron que
 * `ResponsiveTable.test.tsx`), sinon le vrai hook est déjà lié.
 */
const isMobile = vi.fn(() => false)
vi.mock('@/features/mobile/useIsMobile', () => ({ useIsMobile: () => isMobile() }))

const { StructuredReply } = await import('./StructuredReply')

const MISSING_DATA_BLOCK = {
  type: 'missing_data',
  title: 'Ce qui me manque',
  failed: [],
  missing: [{ what: 'Date de fin de mission', how: 'la renseigner' }],
  still_possible: [],
}
const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

describe('StructuredReply — densité compacte sous 768 px (#3761.16)', () => {
  it('reste confortable sur un écran large', async () => {
    isMobile.mockReturnValue(false)
    const { container } = render(<StructuredReply text={fence(MISSING_DATA_BLOCK)} />)
    await screen.findByText('Date de fin de mission')
    expect(container.querySelector('[data-reply-partial]')).toHaveClass('p-3')
  })

  it('resserre les pièces de la bibliothèque de réponses sous 768 px', async () => {
    isMobile.mockReturnValue(true)
    const { container } = render(<StructuredReply text={fence(MISSING_DATA_BLOCK)} />)
    await screen.findByText('Date de fin de mission')
    expect(container.querySelector('[data-reply-partial]')).toHaveClass('p-2')
  })
})
