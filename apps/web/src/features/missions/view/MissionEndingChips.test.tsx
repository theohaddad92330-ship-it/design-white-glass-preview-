import type { CrmCountersResponse } from '@bellum/contracts'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { MissionEndingChips } from './MissionEndingChips'

type Counters = CrmCountersResponse['counters']
const counter = (value: number | null) => ({ value, measured: value !== null, definition_key: 'k' })
const counters = (v30: number | null, v60: number | null, v90: number | null) =>
  ({
    missions_ending_30: counter(v30),
    missions_ending_60: counter(v60),
    missions_ending_90: counter(v90),
  }) as unknown as Counters

afterEach(cleanup)

describe('MissionEndingChips', () => {
  it('nomme les trois horizons avec le compte du serveur (#4193), jamais recalculé', async () => {
    await i18n.changeLanguage('fr')
    render(<MissionEndingChips counters={counters(2, 5, 9)} selected={null} onSelect={() => {}} />)
    expect(screen.getByRole('button', { name: /30 j/ })).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /60 j/ })).toHaveTextContent('5')
    expect(screen.getByRole('button', { name: /90 j/ })).toHaveTextContent('9')
  })

  it('un compteur non mesuré n’affiche PAS « 0 » : la puce reste, sans nombre', async () => {
    await i18n.changeLanguage('fr')
    render(<MissionEndingChips counters={counters(null, null, null)} selected={null} onSelect={() => {}} />)
    const chip = screen.getByRole('button', { name: /30 j/ })
    expect(chip.textContent).not.toMatch(/\b0\b/)
  })

  it('sans réponse du serveur, les puces filtrent quand même, sans nombre', async () => {
    await i18n.changeLanguage('fr')
    render(<MissionEndingChips counters={undefined} selected={null} onSelect={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(3)
  })

  it('un clic choisit l’horizon, un second clic le lève', async () => {
    await i18n.changeLanguage('fr')
    const onSelect = vi.fn()
    const { rerender } = render(<MissionEndingChips counters={counters(1, 1, 1)} selected={null} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /60 j/ }))
    expect(onSelect).toHaveBeenLastCalledWith(60)
    rerender(<MissionEndingChips counters={counters(1, 1, 1)} selected={60} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /60 j/ }))
    expect(onSelect).toHaveBeenLastCalledWith(null)
  })
})
