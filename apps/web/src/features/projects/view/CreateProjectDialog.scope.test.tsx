import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #3266.1 (#3292, tranché sans Louis) — le grain équipe/site/projet, saisi ici
 * et nulle part ailleurs, voyage jusqu'à la mutation. Même patron que
 * `CreateProjectDialog.stage.test.tsx` : on vérifie le corps envoyé à
 * `useCreateProject`, sans repasser par le réseau.
 */

const mutate = vi.fn()
vi.mock('../hooks/useCreateProject', () => ({ useCreateProject: () => ({ mutate, isPending: false }) }))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({ useAccounts: () => ({ data: undefined }) }))

const { CreateProjectDialog } = await import('./CreateProjectDialog')

describe('CreateProjectDialog — le grain équipe/site/projet voyage jusqu’à la mutation', () => {
  it('saisi : la mutation le porte, rogné', () => {
    render(<CreateProjectDialog open onOpenChange={vi.fn()} accountId="acc-1" />)
    fireEvent.change(screen.getByLabelText("Nom de l'affaire"), { target: { value: 'Migration data lake' } })
    fireEvent.change(screen.getByLabelText('Équipe, site ou projet concerné'), {
      target: { value: '  Équipe Data / Site Lyon  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: "Créer l'affaire" }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ scope_label: 'Équipe Data / Site Lyon' }),
      expect.anything(),
    )
  })

  it('non saisi : la mutation part avec `null` — jamais une chaîne vide', () => {
    render(<CreateProjectDialog open onOpenChange={vi.fn()} accountId="acc-1" />)
    fireEvent.change(screen.getByLabelText("Nom de l'affaire"), { target: { value: 'Migration data lake' } })
    fireEvent.click(screen.getByRole('button', { name: "Créer l'affaire" }))
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ scope_label: null }), expect.anything())
  })
})
