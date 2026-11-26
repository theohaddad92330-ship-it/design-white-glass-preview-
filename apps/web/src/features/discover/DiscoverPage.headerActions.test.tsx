import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #3119 (beta) — « à mettre en premier dans pistes rapides, enlever d'ici » :
 * le lien « Analyser une liste » quitte l'en-tête de /discover. Il devient la
 * première entrée de la modale « Pistes rapides » (`DiscoverQuickPresetsDialog.
 * quickPresets.test.tsx`, même issue) plutôt que de vivre en double.
 */

vi.mock('@/components/page/CustomerPage', () => ({
  CustomerPage: ({ children, headerActions }: { children: ReactNode; headerActions?: ReactNode }) => (
    <div>
      <div data-testid="header-actions">{headerActions}</div>
      {children}
    </div>
  ),
}))

vi.mock('@/features/discover/view/Discover', () => ({
  Discover: () => <div data-testid="discover-screen" />,
}))
vi.mock('@/features/plan-features/PlanFeatureRoute', () => ({
  PlanFeatureRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/features/product-gating/DisabledProductRoute', () => ({
  DisabledProductRoute: () => <div data-testid="disabled-route" />,
}))
vi.mock('@/features/product-gating/disabledRoutes', () => ({
  isProductRouteDisabled: () => false,
}))

const { DiscoverPage } = await import('@/routes/discover/index')

describe('#3119 — /discover : « Analyser une liste » a quitté l’en-tête', () => {
  it('ne rend plus le lien dans les actions d’entête', () => {
    render(<DiscoverPage />)
    expect(screen.getByTestId('header-actions')).toBeEmptyDOMElement()
    expect(screen.queryByRole('link', { name: /analyser une liste/i })).not.toBeInTheDocument()
  })
})
