import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Louis 23/10 — porté depuis la `VivierToolbar.test.tsx` de PR11 : « Mes vues » (les vues ENREGISTRÉES) revient dans
// la barre de Théo, à côté de « Tous les profils ». Le reste de la barre PR11 (sélecteur, décompte, Liste/Cartes,
// règle de disponibilité) existe déjà dans l'écran Théo (`TalentFilters`, synthèse) : il n'est pas monté deux fois.

const plan = vi.hoisted(() => ({ known: true, allowed: true }))
vi.mock('@/features/governance/api', () => ({
  useSavedViews: () => ({
    data: [{ id: 'v1', name: 'Cloud dispo avant décembre', filters: { skills: ['Cloud'] } }],
  }),
}))
vi.mock('@/features/plan-features/usePlanFeature', () => ({ usePlanFeature: () => plan }))
vi.mock('./SavedTalentViews', () => ({ SavedTalentViews: () => <div>formulaire des vues</div> }))

const { VivierMyViews } = await import('./VivierToolbar')

afterEach(() => {
  cleanup()
  plan.allowed = true
})

function draw() {
  const onApply = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <VivierMyViews query={{ skills: [] }} onApply={onApply} />
    </QueryClientProvider>,
  )
  return onApply
}

const openMyViews = () =>
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Mes vues' }), { button: 0, ctrlKey: false })

describe('« Mes vues » — les vues enregistrées du vivier (Théo C talents-vivier.R5)', () => {
  it('liste les vues enregistrées et en applique une', () => {
    const onApply = draw()
    openMyViews()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cloud dispo avant décembre' }))
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ skills: ['Cloud'] }))
  })

  it('propose d’enregistrer la vue courante', () => {
    draw()
    openMyViews()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Enregistrer la vue courante…' }))
    expect(screen.getByText('formulaire des vues')).toBeInTheDocument()
  })

  it('sait dire NON : sans l’offre, enregistrer est fermé et le dit', () => {
    plan.allowed = false
    draw()
    openMyViews()
    expect(screen.queryByRole('menuitem', { name: 'Cloud dispo avant décembre' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Enregistrer la vue courante…' })).toBeNull()
  })
})
