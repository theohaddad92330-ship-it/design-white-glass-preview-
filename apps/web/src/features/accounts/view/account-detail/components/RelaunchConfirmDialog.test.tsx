import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Account } from '@bellum/contracts'
import { RelaunchConfirmDialog } from './RelaunchImpact'

const runs = vi.hoisted(() => ({ value: [] as unknown[] }))
vi.mock('@/features/accounts/hooks/useAccountRuns', () => ({
  useAccountRuns: () => ({ data: runs.value }),
}))
vi.mock('@/features/search/hooks/useLaunchPlan', () => ({
  useLaunchPlan: () => ({ plan: { scenario: 'fresh', credits: 8 } }),
}))

const account = { id: 'acc-1', company_name: 'Thales', status: 'completed', siren: null } as unknown as Account

/**
 * #2555 (recette prod 07/10, Thales) — « Actualiser l'analyse » n'ouvrait
 * qu'une infobulle au survol. Le clic ouvre maintenant une confirmation qui
 * annonce le coût, le périmètre (dont le pays) et « organigramme refait ».
 */
describe('RelaunchConfirmDialog (#2555)', () => {
  it('annonce coût, périmètre repris (pays compris) et organigramme refait ; Continuer lance', () => {
    runs.value = [{ id: 'r1', scope_mode: 'france', scope_selection: { geo_perimeter: 'country', geo_areas: ['ES'] } }]
    const onConfirm = vi.fn()
    render(<RelaunchConfirmDialog account={account} open onOpenChange={() => {}} onConfirm={onConfirm} />)

    expect(document.body).not.toHaveTextContent(/cr[ée]dit/i)
    expect(screen.getByText(/Périmètre de la dernière analyse : France/)).toBeInTheDocument()
    expect(screen.getByText(/Zone : Pays · ES/)).toBeInTheDocument()
    expect(screen.getByText(/l’organigramme et le plan sont refaits/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Continuer/ }))
    // #3742 — la relance REPREND le périmètre de la dernière analyse (puce « France »).
    expect(onConfirm).toHaveBeenCalledWith({ scopeMode: 'france', geoPerimeter: 'country', geoAreas: ['ES'] })
  })

  // #3709 — recette Ludovic 07/10 : un titre sur 4 lignes chevauchait la croix.
  it('#3709 — titre court réservant la place de la croix, compte nommé en sous-titre', () => {
    runs.value = []
    render(<RelaunchConfirmDialog account={account} open onOpenChange={() => {}} onConfirm={() => {}} />)
    const title = screen.getByRole('heading', { name: 'Actualiser l’analyse ?' })
    expect(title.className).toContain('pr-8')
    expect(screen.getByText('Thales')).toBeInTheDocument()
  })

  it('la puce « France » sans zone saisie se lit « Zone : France »', () => {
    runs.value = [{ id: 'r1', scope_mode: 'france', scope_selection: null }]
    render(<RelaunchConfirmDialog account={account} open onOpenChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/Zone : France/)).toBeInTheDocument()
  })

  it('aucun run enregistré : le périmètre se choisit à l’étape suivante, jamais inventé', () => {
    runs.value = []
    render(<RelaunchConfirmDialog account={account} open onOpenChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/Périmètre de la dernière analyse non enregistré/)).toBeInTheDocument()
    expect(screen.queryByText(/Zone :/)).not.toBeInTheDocument()
  })
})
