import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

vi.mock('@/features/auth/components/AuthBrandingPanel', () => ({ AuthBrandingPanel: () => null }))
vi.mock('@/features/auth/components/LoginCard', () => ({ LoginCard: () => null }))
vi.mock('@/features/auth/hooks/useRedirectAfterAuth', () => ({ useRedirectAfterAuth: () => undefined }))
vi.mock('@/features/auth/hooks/useCloseDemoOnLogin', () => ({ useCloseDemoOnLogin: () => ({ closing: false }) }))

describe('LoginPage — défilement', () => {
  it('la racine est le conteneur de défilement (le document ne défile jamais)', () => {
    // Inscription démo : la page défile (retour prospect 29/09)
    const { container } = render(<LoginPage />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('h-full')
    expect(root.className).toContain('overflow-y-auto')
  })
})
