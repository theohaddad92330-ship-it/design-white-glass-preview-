import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SectorPicker } from './SectorPicker'

/**
 * KEVIN-FIX K.5 (recette prod 20/10) — un chevron « > » restait SEUL sur sa ligne (x587, y622) et une rangée de
 * puces mesurait 64 px contre 34 ailleurs. Cause : puce et chevron vivaient dans un `flex-wrap` — dès que la puce
 * (libellé + « +N/M ») remplissait la cellule, le chevron passait à la ligne — et le chevron imposait 44 px de
 * haut hors tactile. Invisible en jsdom (aucune mesure) : la garde lit donc la règle de mise en page.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('K.5 — le chevron reste collé à son libellé', () => {
  function rangee(): HTMLElement {
    render(<SectorPicker selected={[]} onChange={() => {}} />)
    const chevrons = screen.getAllByRole('button', { name: 'rail.sectorGroupExpand' })
    expect(chevrons.length).toBeGreaterThan(1)
    return chevrons[0].parentElement as HTMLElement
  }

  it('la rangée libellé + chevron ne passe jamais à la ligne', () => {
    const row = rangee()
    expect(row.className).not.toContain('flex-wrap')
    expect(row.className).toContain('flex-nowrap')
  })

  it('le chevron ne rétrécit pas et ne grossit pas hors tactile (espacement uniforme)', () => {
    rangee()
    const chevron = screen.getAllByRole('button', { name: 'rail.sectorGroupExpand' })[0]
    expect(chevron.className).toContain('shrink-0')
    expect(chevron.className).not.toMatch(/(^|\s)min-h-11/)
    expect(chevron.className).toContain('pointer-coarse:min-h-11')
  })
})
