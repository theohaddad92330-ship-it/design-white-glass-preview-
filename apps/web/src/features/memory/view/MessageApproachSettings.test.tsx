import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mutate = vi.fn()
let data: 'direct' | null = null
let isLoading = false
let isError = false

vi.mock('@/features/memory/hooks/useMessageApproach', () => ({
  useMessageApproach: () => ({ data, isLoading, isError }),
  useSetMessageApproach: () => ({ mutate, isPending: false }),
}))

const { MessageApproachSettings } = await import('./MessageApproachSettings')

/** #4060 — l'approche directe se pose par un geste, se retire par « Par défaut », et une lecture ratée n'est pas « par défaut ». */
describe('MessageApproachSettings (#4060)', () => {
  beforeEach(() => {
    mutate.mockReset()
    data = null
    isLoading = false
    isError = false
  })

  it('sans préférence, « Par défaut » est actif', () => {
    render(<MessageApproachSettings />)
    expect(screen.getByRole('group', { name: 'Approche des messages' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Par défaut' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('enregistre l’approche directe au clic', () => {
    render(<MessageApproachSettings />)
    fireEvent.click(screen.getByRole('button', { name: 'Approche directe' }))
    expect(mutate).toHaveBeenCalledWith('direct')
  })

  it('retire la préférence en revenant à « Par défaut »', () => {
    data = 'direct'
    render(<MessageApproachSettings />)
    expect(screen.getByRole('button', { name: 'Approche directe' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Par défaut' }))
    expect(mutate).toHaveBeenCalledWith(null)
  })

  it('une lecture échouée n’affiche pas « Par défaut »', () => {
    isError = true
    render(<MessageApproachSettings />)
    expect(screen.queryByRole('button', { name: 'Par défaut' })).not.toBeInTheDocument()
    expect(screen.getByText(/n'a pas pu être lu/)).toBeInTheDocument()
  })
})
