import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DemoAccessPage } from './DemoAccessPage'

vi.mock('@/features/auth/components/AuthBrandingPanel', () => ({ AuthBrandingPanel: () => null }))

describe('DemoAccessPage — défilement', () => {
  it('la racine est le conteneur de défilement (le document ne défile jamais)', () => {
    // Inscription démo : la page défile (retour prospect 29/09)
    const { container } = render(<DemoAccessPage token="t" reason={undefined} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('h-full')
    expect(root.className).toContain('overflow-y-auto')
  })
})
