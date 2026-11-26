import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n'
import { ContactPriorityBadge } from './ContactPriorityBadge'

afterEach(cleanup)

describe('ContactPriorityBadge', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('never labels the rank a "Score" — the scale is inverted vs a score', () => {
    const { container } = render(<ContactPriorityBadge value={1} />)
    expect(container.textContent).not.toMatch(/score/i)
  })

  it('shows the rank with a P prefix so "1" cannot read as a weak score', () => {
    render(<ContactPriorityBadge value={1} />)
    expect(screen.getByText('P1')).toBeInTheDocument()
  })

  // #2622.1 — une bulle portée par `title` seul n'est ni tabulable ni
  // tactile : c'est un VRAI bouton (GA-35), ouvert au clic/clavier/toucher.
  it('is a real, tabbable button carrying the rank explanation as its accessible name', () => {
    render(<ContactPriorityBadge value={1} />)
    const bouton = screen.getByRole('button', { name: /1 = à contacter en premier/i })
    expect(bouton.tagName).toBe('BUTTON')
  })

  it('opens a popover on click naming why the rank matters and what to do about it', () => {
    render(<ContactPriorityBadge value={1} />)
    expect(screen.queryByText(/à contacter en premier\./i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /1 = à contacter en premier/i }))

    expect(screen.getByText(/rôle, la joignabilité et la pertinence/i)).toBeInTheDocument()
    expect(screen.getByText(/à contacter en premier\./i)).toBeInTheDocument()
  })

  it('names a weaker rank as backup, not "contact first"', () => {
    render(<ContactPriorityBadge value={5} />)
    fireEvent.click(screen.getByRole('button', { name: /5 sur 5/i }))
    expect(screen.getByText(/en renfort/i)).toBeInTheDocument()
  })

  it('paints rank 1 as the strongest and rank 5 as the weakest', () => {
    const { container: best } = render(<ContactPriorityBadge value={1} />)
    const { container: worst } = render(<ContactPriorityBadge value={5} />)
    // Regression: the old score circle painted 1 red (NO-GO) and 5 amber.
    expect(best.querySelector('button')?.className).toContain('emerald')
    expect(worst.querySelector('button')?.className).not.toContain('emerald')
  })

  it('renders a dash rather than inventing a rank when there is none', () => {
    render(<ContactPriorityBadge value={null} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders a dash for an out-of-scale value instead of clamping it', () => {
    render(<ContactPriorityBadge value={9} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
