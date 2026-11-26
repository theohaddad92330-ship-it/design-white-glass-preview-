import type { AnalysisScopeSelection } from '@bellum/contracts'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCadrageDefaults } from './useCadrageDefaults'

function setup(selection: AnalysisScopeSelection, country = 'FR', relaunch = false) {
  const onSelectionChange = vi.fn()
  const view = renderHook(
    (props: { selection: AnalysisScopeSelection; country: string }) =>
      useCadrageDefaults({ selection: props.selection, onSelectionChange, country: props.country, relaunch }),
    { initialProps: { selection, country } },
  )
  return { onSelectionChange, ...view }
}

describe('useCadrageDefaults — les défauts du cadrage, posés en UN seul patch', () => {
  it('#3742/#3944 — France ET « Approfondie » posées ENSEMBLE (le second n’écrase plus le premier)', () => {
    const { onSelectionChange } = setup({})
    expect(onSelectionChange).toHaveBeenCalledTimes(1)
    expect(onSelectionChange).toHaveBeenCalledWith({ geo_perimeter: 'france', depth: 'deep' })
  })

  it('#3742 — ne redéfinit pas un cadrage déjà choisi (même « Monde » explicite)', () => {
    const { onSelectionChange } = setup({ geo_perimeter: 'world', depth: 'quick' })
    expect(onSelectionChange).not.toHaveBeenCalled()
  })

  it('#3742 — un marché non-FR n’a pas d’équivalent câblé : aucun défaut géographique inventé', () => {
    const { onSelectionChange } = setup({}, 'US')
    expect(onSelectionChange).toHaveBeenCalledWith({ depth: 'deep' })
  })

  it('#3944 — en relance, aucun palier n’est écrit', () => {
    const { onSelectionChange } = setup({}, 'FR', true)
    expect(onSelectionChange).toHaveBeenCalledWith({ geo_perimeter: 'france' })
  })

  it('#3742 — FR → US : la zone de l’ancien pays part, zones comprises', () => {
    const { onSelectionChange, rerender } = setup({
      geo_perimeter: 'france',
      geo_areas: ['Île-de-France'],
      depth: 'deep',
    })
    onSelectionChange.mockClear()
    rerender({ selection: { geo_perimeter: 'france', geo_areas: ['Île-de-France'], depth: 'deep' }, country: 'US' })
    expect(onSelectionChange).toHaveBeenLastCalledWith({ depth: 'deep' })
  })

  it('sait dire NON : sans changement de pays, un cadrage choisi reste', () => {
    const selection: AnalysisScopeSelection = { geo_perimeter: 'region', geo_areas: ['Bretagne'], depth: 'deep' }
    const { onSelectionChange, rerender } = setup(selection)
    rerender({ selection, country: 'FR' })
    expect(onSelectionChange).not.toHaveBeenCalled()
  })
})
