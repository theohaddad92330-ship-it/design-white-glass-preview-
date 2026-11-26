import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { APPLICATION_SECTORS } from '@bellum/contracts'
import { applicationSectorLabel } from '@/features/discover/lib/discover-sectors'
import { SectorPicker } from './SectorPicker'

/**
 * #3815 — recette prod 08/10 : « 6 sous-secteurs non ajoutés » NOMMAIT un
 * compte, jamais les 6 noms. `SectorPicker.cap.test.tsx` mocke `react-i18next`
 * avec un `t` qui ignore tout ce qui n'est pas `count`/`max` — il ne peut donc
 * pas prouver que les NOMS sont bien dans la phrase rendue. Ce fichier utilise
 * le vrai `i18n` (initialisé par `src/test/setup.ts`) pour lire la phrase
 * ENTIÈRE, comme un commercial la verrait.
 */
describe('#3815 — SectorPicker : le refus de groupe NOMME les sous-secteurs écartés', () => {
  it('à 3/5, cocher « Industrie » nomme les 6 sous-secteurs qui ne sont pas entrés', () => {
    const onChange = vi.fn()
    const current = ['rail', 'renewables', 'nuclear'] // 3/5, hors du groupe « industrie »
    render(<SectorPicker selected={current} onChange={onChange} />)
    const industrieChip = screen.getByText('Industrie et fabrication').closest('button') as HTMLElement
    fireEvent.click(industrieChip)

    const industrie = APPLICATION_SECTORS.filter(s => s.group === 'industrie').map(s => s.code)
    const kept = (onChange.mock.calls[0][0] as string[]).filter(code => industrie.includes(code))
    const dropped = industrie.filter(code => !kept.includes(code))
    expect(dropped).toHaveLength(6)

    const hint = screen.getByTestId('sector-group-cap-hint')
    for (const code of dropped) {
      expect(hint).toHaveTextContent(applicationSectorLabel(code, 'fr'))
    }
    // Aucun des deux ENTRÉS ne doit apparaître dans la liste des écartés.
    for (const code of kept) {
      expect(hint.textContent).not.toContain(applicationSectorLabel(code, 'fr'))
    }
  })
  // KEVIN-FIX K.5 (recette prod 20/10) — le plafond se dit AVANT le clic, pas après la saturation 5/5.
  it('AVANT tout clic, un groupe trop gros annonce combien il en ajoutera et combien de places restent', () => {
    render(<SectorPicker selected={['rail', 'renewables', 'nuclear']} onChange={vi.fn()} />)
    const chip = screen.getByText('Industrie et fabrication').closest('button') as HTMLElement
    expect(chip).toHaveTextContent('+2/8')
    expect(chip.getAttribute('title')).toMatch(/2 des 8/)
    expect(screen.getByTestId('sector-room-left')).toHaveTextContent('2 places')
  })

  it('sait dire NON : un groupe qui tient en entier n’annonce aucun manque', () => {
    render(<SectorPicker selected={[]} onChange={vi.fn()} />)
    const chip = screen.getByText('Secteur public').closest('button') as HTMLElement
    expect(chip.textContent).not.toMatch(/\+\d/)
  })
})
