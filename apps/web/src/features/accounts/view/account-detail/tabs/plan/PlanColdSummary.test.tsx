import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { PlanColdSummary } from './PlanColdSummary'

const { relaunch } = vi.hoisted(() => ({ relaunch: vi.fn() }))
vi.mock('@/features/accounts/hooks/useAccountRelaunch', () => ({ useAccountRelaunch: () => ({ relaunch }) }))

const cold = {
  id: 'a1',
  company_name: 'Thales',
  status: 'prospect' as const,
  last_analyzed_at: null,
  sector: 'Défense et aérospatial',
  employees: null,
  headquarters: null,
}

// #3670 (R2 07/10) — un compte froid, sans analyse : établi, manque, UNE prochaine action.
describe('PlanColdSummary — le plan d’un compte sans analyse (#3670)', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    relaunch.mockClear()
  })

  it('nomme ce qui est établi, ce qui manque, et propose UNE action : lancer l’analyse', () => {
    render(<PlanColdSummary account={cold} />)
    expect(screen.getByText('Ce qui est établi')).toBeInTheDocument()
    expect(screen.getByText('Aucune analyse n’a été lancée sur ce dossier.')).toBeInTheDocument()
    expect(screen.getByText('Secteur : Défense et aérospatial')).toBeInTheDocument()
    expect(screen.getByText('Ce qui manque')).toBeInTheDocument()
    expect(screen.getByText(/seule l’analyse les produit/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lancer l’analyse' }))
    expect(relaunch).toHaveBeenCalledTimes(1)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('SAIT DIRE NON — une valeur absente ne fait aucune ligne (ni effectif, ni siège, ni 0)', () => {
    render(<PlanColdSummary account={cold} />)
    expect(screen.queryByText(/Effectif/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Siège/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Plan à préciser/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\b0\b/)).not.toBeInTheDocument()
  })

  it('une analyse en cours n’offre aucun bouton : on attend, on le dit', () => {
    render(<PlanColdSummary account={{ ...cold, status: 'analyzing' as const }} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/Attendre la fin de l’analyse/)).toBeInTheDocument()
  })
})
