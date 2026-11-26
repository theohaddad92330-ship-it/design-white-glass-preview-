import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LaunchPlan } from '@/features/search/hooks/useLaunchPlan'
import { LaunchPlanNote } from './LaunchPlanNote'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, children, ...rest }: { to: string; params?: { id: string }; children: React.ReactNode }) => (
    <a href={params ? to.replace('$id', params.id) : to} {...rest}>
      {children}
    </a>
  ),
}))

const noop = () => undefined

// #4463 / #4464 (crédits implicites) + Théo B r1-recherche — la note dit ce qui existe déjà (dossier récent, compte
// connu), jamais un prix. Le frein doux vit dans le pied de page du cadrage (`Search.tsx`).
describe('LaunchPlanNote', () => {
  it('analyse neuve : rien à dire, aucune annonce de crédit, de débit ni de remboursement', () => {
    const plan = { scenario: 'fresh' } as LaunchPlan
    const { container } = render(<LaunchPlanNote plan={plan} onOpenExisting={noop} onRefreshExisting={noop} />)
    expect(container.textContent).toBe('')
  })

  it('dossier récent : "Un dossier récent existe déjà." + CTA "Ouvrir le dossier" / "Actualiser l\'analyse"', () => {
    const plan = { scenario: 'cache_hit', accountId: 'acc-1', companyName: 'TF1' } as LaunchPlan
    const onOpenExisting = vi.fn()
    const onRefreshExisting = vi.fn()
    render(<LaunchPlanNote plan={plan} onOpenExisting={onOpenExisting} onRefreshExisting={onRefreshExisting} />)

    expect(screen.getByText('Un dossier récent existe déjà.')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/cr[ée]dit/i)
    expect(screen.getByText('Encore frais')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le dossier' }))
    expect(onOpenExisting).toHaveBeenCalledWith('acc-1')

    fireEvent.click(screen.getByRole('button', { name: "Actualiser l'analyse" }))
    expect(onRefreshExisting).toHaveBeenCalledTimes(1)
  })

  it('#2292.17 — nom déjà connu hors cache : "Déjà connu — à actualiser" + lien vers le dossier', () => {
    const plan = {
      scenario: 'fresh',
      knownAccount: { accountId: 'acc-old', companyName: 'TF1' },
    } as LaunchPlan
    render(<LaunchPlanNote plan={plan} onOpenExisting={noop} onRefreshExisting={noop} />)
    expect(screen.getByText('Déjà connu')).toBeInTheDocument()
    expect(screen.getByText('À actualiser')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Ouvrir le dossier existant' })
    expect(link).toHaveAttribute('href', '/accounts/acc-old')
  })

  it('#2292.17 — sans dossier connu : ni "Déjà connu" ni lien', () => {
    const plan = { scenario: 'fresh' } as LaunchPlan
    render(<LaunchPlanNote plan={plan} onOpenExisting={noop} onRefreshExisting={noop} />)
    expect(screen.queryByText('Déjà connu')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Ouvrir le dossier existant' })).not.toBeInTheDocument()
  })
})
