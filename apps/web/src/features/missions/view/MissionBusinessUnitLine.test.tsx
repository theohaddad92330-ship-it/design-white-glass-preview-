import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.fn()
const mutate = vi.fn()
const units = vi.fn()

vi.mock('./mission-business-unit.api', () => ({
  useMissionBusinessUnit: () => state(),
  useTransferMissionBusinessUnit: () => ({ mutate, isPending: false }),
}))
vi.mock('@/features/business-units/hooks/useMyBusinessUnits', () => ({
  useMyBusinessUnits: () => units(),
}))

const { MissionBusinessUnitLine } = await import('./MissionBusinessUnitLine')

const BU = (id: string, name: string, status = 'active') => ({ id, name, status })

beforeEach(() => {
  mutate.mockReset()
  state.mockReturnValue({ data: { businessUnit: BU('bu-a', 'BU Data'), inherited: true }, isLoading: false })
  units.mockReturnValue({
    data: { businessUnits: [BU('bu-a', 'BU Data'), BU('bu-b', 'BU Cloud'), BU('bu-c', 'Ancienne agence', 'archived')] },
  })
})

describe('MissionBusinessUnitLine (#3413 « autre BU »)', () => {
  it('nomme la BU qui porte la mission, et dit qu’elle vient du compte tant que rien n’a été transféré', () => {
    render(<MissionBusinessUnitLine missionId="m-1" />)
    expect(screen.getByText('BU Data')).toBeInTheDocument()
    expect(screen.getByText(/BU de son compte/)).toBeInTheDocument()
  })

  it('une mission sans BU le dit — jamais une BU inventée', () => {
    state.mockReturnValue({ data: { businessUnit: null, inherited: false }, isLoading: false })
    render(<MissionBusinessUnitLine missionId="m-1" />)
    expect(screen.getByText(/Aucune BU/)).toBeInTheDocument()
  })

  it('dit NON : sans choix de BU ET sans case de confirmation, le bouton refuse', async () => {
    render(<MissionBusinessUnitLine missionId="m-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Transférer' }))

    const submit = screen.getByRole('button', { name: 'Transférer la mission' })
    expect(submit).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox'))
    expect(submit).toBeDisabled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('ne propose NI la BU actuelle NI une BU archivée', async () => {
    render(<MissionBusinessUnitLine missionId="m-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Transférer' }))
    await userEvent.click(screen.getByRole('combobox'))

    expect(screen.getByRole('option', { name: 'BU Cloud' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'BU Data' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Ancienne agence' })).not.toBeInTheDocument()
  })

  it('transfère UNE fois la BU choisie ET la confirmation cochée', async () => {
    render(<MissionBusinessUnitLine missionId="m-1" />)
    await userEvent.click(screen.getByRole('button', { name: 'Transférer' }))
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByRole('option', { name: 'BU Cloud' }))
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Transférer la mission' }))

    expect(mutate).toHaveBeenCalledTimes(1)
    expect(mutate.mock.calls[0]?.[0]).toBe('bu-b')
  })
})
