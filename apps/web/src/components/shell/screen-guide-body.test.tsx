/**
 * Refonte Théo (lots écrans) — `ScreenGuideLink` reçoit le guide PROPRE à l'écran (`screenGuide`
 * de `CustomerPage`) : le même libellé « Comment travailler ici ? » devient un repli qui le déplie,
 * le centre d'aide reste à un clic dedans. Sans guide, le lien d'origine — inchangé.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '@/test/i18n-default-language'

vi.mock('@/features/guide/GuideHelpCenter', () => ({
  GuideHelpCenter: ({ open }: { open: boolean }) => (open ? <div role="dialog">centre d’aide</div> : null),
}))

const { ScreenGuideLink } = await import('./ScreenGuideLink')

describe('ScreenGuideLink — le guide propre à un écran', () => {
  it('avec un guide : un repli unique qui le déplie, et le centre d’aide à un clic', async () => {
    const { container } = render(<ScreenGuideLink guide={<p>Distinguer préparée, créée et envoyée</p>} />)
    const details = container.querySelector('details')
    expect(details).not.toBeNull()
    expect(screen.getAllByText('Comment travailler ici ?')).toHaveLength(1)
    expect(details?.textContent).toContain('Distinguer préparée, créée et envoyée')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tous les guides' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('centre d’aide')
  })

  it('sans guide : le lien d’origine, aucun repli', () => {
    const { container } = render(<ScreenGuideLink />)
    expect(container.querySelector('details')).toBeNull()
    expect(screen.getByRole('button', { name: 'Comment travailler ici ?' })).toBeTruthy()
  })
})
