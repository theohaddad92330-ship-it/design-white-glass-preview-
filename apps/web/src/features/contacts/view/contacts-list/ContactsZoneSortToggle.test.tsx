import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ContactsZoneSortToggle } from './ContactsZoneSortToggle'

afterEach(cleanup)

// #4982.1 — le geste « Trier par zone » : un bouton à bascule, tabulable, qui dit son état.
it('#4982.1 bascule le tri zone et dit son état', () => {
  const onChange = vi.fn()
  const { rerender } = render(<ContactsZoneSortToggle active={false} onChange={onChange} />)
  const button = screen.getByRole('button', { pressed: false })
  fireEvent.click(button)
  expect(onChange).toHaveBeenCalledWith(true)
  rerender(<ContactsZoneSortToggle active onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { pressed: true }))
  expect(onChange).toHaveBeenLastCalledWith(false)
})
