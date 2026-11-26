import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SourceExclusionsField } from './SourceExclusionsField'

// #4142.6 — les deux exclusions lisent une source ; l'absence de donnée est DITE.
describe('SourceExclusionsField (#4142.6)', () => {
  it('cocher pose le réglage, décocher le retire (undefined, jamais false)', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <SourceExclusionsField publicSector={false} workedAccounts={false} onChange={onChange} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Secteur public' }))
    expect(onChange).toHaveBeenLastCalledWith({ exclude_public_sector: true })

    rerender(<SourceExclusionsField publicSector workedAccounts={false} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Secteur public' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Secteur public' }))
    expect(onChange).toHaveBeenLastCalledWith({ exclude_public_sector: undefined })

    fireEvent.click(screen.getByRole('button', { name: 'Déjà travaillées' }))
    expect(onChange).toHaveBeenLastCalledWith({ exclude_worked_accounts: true })
  })

  it('dit d’où vient chaque réponse et que sans donnée une entreprise n’est ni retenue ni écartée', () => {
    render(<SourceExclusionsField publicSector={false} workedAccounts={false} onChange={vi.fn()} />)

    expect(screen.getByText(/registre/i)).toBeInTheDocument()
    expect(screen.getByText(/ni retenue ni écartée/i)).toBeInTheDocument()
  })
})
