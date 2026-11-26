import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dataExit = vi.hoisted(() => ({ value: { allowed: true, grant: {} as unknown } }))
const downloadCSV = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data-exit', () => ({ useDataExit: () => dataExit.value }))
vi.mock('@/lib/export-csv', () => ({ downloadCSV }))

const { PlanningExportButton } = await import('./PlanningExportButton')

const ROWS = [
  {
    label: 'Audit sécurité',
    accountName: 'Thales',
    personNames: ['Inès Kaczmarek'],
    startedOn: '2026-09-01',
    endsOn: '2026-10-30',
  },
  { label: 'Run', accountName: null, personNames: [], startedOn: null, endsOn: null },
]

beforeEach(() => {
  downloadCSV.mockReset()
  dataExit.value = { allowed: true, grant: {} }
})
afterEach(cleanup)

// Théo C missions-planning.N6 — exporter le planning (tableau .csv) : une SORTIE de données.
describe('PlanningExportButton', () => {
  it('exporte la sélection courante : en-têtes, dates ISO, et une cellule vide pour une date absente', async () => {
    render(<PlanningExportButton rows={ROWS} />)
    await userEvent.click(screen.getByRole('button', { name: 'Exporter' }))
    expect(downloadCSV).toHaveBeenCalledOnce()
    const [csv, filename] = downloadCSV.mock.calls[0] as [string, string]
    expect(filename).toBe('planning-missions.csv')
    const lines = csv.replace('﻿', '').split('\n')
    expect(lines[0]).toBe('"Mission","Compte","Consultant","Début","Fin prévue"')
    expect(lines[1]).toBe('"Audit sécurité","Thales","Inès Kaczmarek","2026-09-01","2026-10-30"')
    expect(lines[2]).toBe('"Run","","","",""')
  })

  it('est masqué quand la règle d’espace refuse la sortie de données', () => {
    dataExit.value = { allowed: false, grant: null }
    render(<PlanningExportButton rows={ROWS} />)
    expect(screen.queryByRole('button', { name: 'Exporter' })).toBeNull()
  })

  it('est inactif sans ligne à exporter', () => {
    render(<PlanningExportButton rows={[]} />)
    expect(screen.getByRole('button', { name: 'Exporter' })).toBeDisabled()
  })
})
