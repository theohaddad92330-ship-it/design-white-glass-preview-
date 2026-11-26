import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

const fixtures = vi.hoisted(() => ({
  startTour: vi.fn(),
  stopTour: vi.fn(),
  startScenario: vi.fn(),
  stopScenario: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('./MyReportsView', () => ({ MyReportsView: () => <div data-testid="my-reports" /> }))
vi.mock('@/features/guide/GuideHelpCenter', () => ({ GuideHelpCenter: () => null }))
vi.mock('@/features/onboarding/components/ActivationChecklist', () => ({ unhideActivationChecklist: vi.fn() }))
vi.mock('@/features/product-tour/product-tour-store', () => ({
  useProductTourStore: (select: (s: unknown) => unknown) =>
    select({ start: fixtures.startTour, stop: fixtures.stopTour }),
}))
vi.mock('@/features/sales-scenario/sales-scenario-store', () => ({
  useSalesScenarioStore: (select: (s: unknown) => unknown) =>
    select({ start: fixtures.startScenario, stop: fixtures.stopScenario }),
}))
const request = vi.hoisted(() => vi.fn())
vi.mock('./reportLink', () => ({ requestReport: request }))

const { HelpAndReportsView } = await import('./HelpAndReportsView')
const user = () => userEvent.setup({ pointerEventsCheck: 0 })

describe('Théo D settings-outils.R5 / N3 — Aide & signalements', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    vi.clearAllMocks()
  })

  it('un titre, puis les portes : signalement, raccourcis, mes données, revoir les débuts, mes signalements', () => {
    render(<HelpAndReportsView />)
    expect(screen.getByRole('heading', { level: 1, name: 'Aide & signalements' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Consulter' })).toHaveAttribute('href', '/settings/shortcuts')
    expect(screen.getByRole('link', { name: 'Mes données' })).toHaveAttribute('href', '/settings/mes-donnees')
    expect(screen.getByTestId('my-reports')).toBeInTheDocument()
  })

  it('« Préparer un signalement » ouvre le formulaire existant, rien n’est envoyé', async () => {
    render(<HelpAndReportsView />)
    await user().click(screen.getByRole('button', { name: 'Préparer un signalement' }))
    expect(request).toHaveBeenCalledWith({ message: '' })
  })
})
