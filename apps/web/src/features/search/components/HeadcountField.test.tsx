import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HeadcountField } from './HeadcountField'

// #4142 — « est-ce qu'il y a des choses qui manquent ? » (audit du cadrage
// /search). `headcount_min`/`headcount_max` (#2624.1) sont déclarés et LUS
// côté serveur (market-memory, pappers discovery, phase1_research) mais
// n'avaient aucun appelant web sur le cadrage d'analyse — contrairement aux
// cinq autres champs du même bloc (entités, niveaux, géo, famille métier).
describe('HeadcountField (#4142)', () => {
  it('affiche les deux bornes, vides par défaut', () => {
    render(<HeadcountField min={undefined} max={undefined} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Effectif minimum')).toHaveValue(null)
    expect(screen.getByLabelText('Effectif maximum')).toHaveValue(null)
  })

  it('reflète les bornes déjà posées', () => {
    render(<HeadcountField min={50} max={250} onChange={vi.fn()} />)
    expect(screen.getByLabelText('Effectif minimum')).toHaveValue(50)
    expect(screen.getByLabelText('Effectif maximum')).toHaveValue(250)
  })

  it('un minimum saisi devient la seule borne modifiée, le maximum reste intact', () => {
    const onChange = vi.fn()
    render(<HeadcountField min={undefined} max={250} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Effectif minimum'), { target: { value: '50' } })
    expect(onChange).toHaveBeenCalledWith({ min: 50, max: 250 })
  })

  it('vider un champ efface SA borne — jamais "0" (doctrine : non mesuré ≠ 0)', () => {
    const onChange = vi.fn()
    render(<HeadcountField min={50} max={250} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Effectif minimum'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith({ min: undefined, max: 250 })
  })

  it('désactive les deux champs quand `disabled`', () => {
    render(<HeadcountField min={undefined} max={undefined} onChange={vi.fn()} disabled />)
    expect(screen.getByLabelText('Effectif minimum')).toBeDisabled()
    expect(screen.getByLabelText('Effectif maximum')).toBeDisabled()
  })
})
