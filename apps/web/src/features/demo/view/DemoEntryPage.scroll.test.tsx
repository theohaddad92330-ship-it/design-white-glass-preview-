import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DemoEntryPage } from './DemoEntryPage'

vi.mock('@/features/demo/api', () => ({ demoApi: { redeem: vi.fn(), leadTouch: vi.fn() } }))
vi.mock('@/features/auth/components/AuthBrandingPanel', () => ({ AuthBrandingPanel: () => null }))

describe('DemoEntryPage — défilement', () => {
  it('la racine est le conteneur de défilement (le document ne défile jamais)', () => {
    // Inscription démo : la page défile (retour prospect 29/09)
    const { container } = render(<DemoEntryPage />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('h-full')
    expect(root.className).toContain('overflow-y-auto')
  })
})
