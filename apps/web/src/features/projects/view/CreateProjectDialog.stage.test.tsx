import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/**
 * #2124.11/#2124.13 — `stage` traverse le formulaire jusqu'à la mutation.
 *
 * `CreateProjectDialog` n'avait qu'un seul appelant sans opinion sur l'étape
 * d'entrée (le renouvellement, qui laisse le serveur poser `PIPELINE_STAGES[0]`).
 * Le dossier de compte en a désormais DEUX : « Créer une opportunité » (pas
 * d'étape imposée) et « Créer un besoin confirmé » (`stage: 'confirmed'`). Ce
 * test vérifie que le prop atteint bien le corps envoyé à `useCreateProject`,
 * sans repasser par le réseau — la route et le contrôleur sont couverts côté
 * API (`projects.controller.ts`, `create-is-a-human-gesture.spec.ts`).
 */

const mutate = vi.fn()
vi.mock('../hooks/useCreateProject', () => ({ useCreateProject: () => ({ mutate, isPending: false }) }))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({ useAccounts: () => ({ data: undefined }) }))

const { CreateProjectDialog } = await import('./CreateProjectDialog')

describe('CreateProjectDialog — l’étape d’entrée voyage jusqu’à la mutation', () => {
  it('sans `stage` : la mutation part sans champ imposé — le serveur pose son défaut', () => {
    render(<CreateProjectDialog open onOpenChange={vi.fn()} accountId="acc-1" />)
    fireEvent.change(screen.getByLabelText("Nom de l'affaire"), { target: { value: 'Migration data lake' } })
    fireEvent.click(screen.getByRole('button', { name: "Créer l'affaire" }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: 'acc-1', stage: undefined }),
      expect.anything(),
    )
  })

  it('avec `stage="confirmed"` (« Créer un besoin confirmé ») : la mutation le porte', () => {
    render(<CreateProjectDialog open onOpenChange={vi.fn()} accountId="acc-1" stage="confirmed" />)
    fireEvent.change(screen.getByLabelText("Nom de l'affaire"), { target: { value: 'Besoin ops' } })
    fireEvent.click(screen.getByRole('button', { name: "Créer l'affaire" }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ account_id: 'acc-1', stage: 'confirmed' }),
      expect.anything(),
    )
  })

  it('avec `stage="confirmed"`, la description dit le besoin confirmé — pas la phrase générique', () => {
    render(<CreateProjectDialog open onOpenChange={vi.fn()} accountId="acc-1" stage="confirmed" />)
    expect(screen.getByText(/besoin confirmé que tu poses toi-même/i)).toBeInTheDocument()
  })
})
