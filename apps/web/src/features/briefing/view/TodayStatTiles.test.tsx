import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TodayStatTiles } from './TodayStatTiles'

describe('TodayStatTiles', () => {
  it('ne rend rien sans tuile', () => {
    const { container } = render(<TodayStatTiles tiles={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('chaque tuile est un bouton qui fait défiler jusqu’à sa rangée', () => {
    const scrollIntoView = vi.fn()
    const anchor = document.createElement('section')
    anchor.id = 'today-queue'
    anchor.scrollIntoView = scrollIntoView
    document.body.appendChild(anchor)
    render(<TodayStatTiles tiles={[{ id: 'queue', count: 4, target: 'today-queue' }]} />)
    const tile = screen.getByRole('button', { name: /4/ })
    expect(screen.getByText('4')).toBeInTheDocument()
    fireEvent.click(tile)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    anchor.remove()
  })

  it('ne casse pas quand l’ancre est absente', () => {
    render(<TodayStatTiles tiles={[{ id: 'signals', count: 2, target: 'today-signals' }]} />)
    expect(() => fireEvent.click(screen.getByRole('button'))).not.toThrow()
  })
})
