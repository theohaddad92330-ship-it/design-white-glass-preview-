import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NewRepliesPill } from './NewRepliesPill'
import { arrivedWhileReadingAbove, tailKey } from './new-replies-pill'

/**
 * #3776.5 — « Quand l'utilisateur lit plus haut dans le fil, l'arrivée d'une réponse ne le
 * ramène pas de force en bas. Proposer un accès discret aux nouveaux éléments. »
 * La décision est pure (jsdom ne mesure rien) ; le composant ne fait que la brancher.
 */
const away = { scrollTop: 0, scrollHeight: 2000, clientHeight: 600 }
const atBottom = { scrollTop: 1400, scrollHeight: 2000, clientHeight: 600 }
const msg = (content: string, role: 'user' | 'assistant' = 'assistant') => ({ role, content })

describe('arrivedWhileReadingAbove', () => {
  it('une réponse neuve pendant que la personne lit plus haut → vrai', () => {
    const before = tailKey([msg('Q', 'user')])
    const after = tailKey([msg('Q', 'user'), msg('Réponse')])
    expect(arrivedWhileReadingAbove(before, after, away)).toBe(true)
  })

  it('une réponse qui continue de se remplir (flux) compte aussi', () => {
    expect(arrivedWhileReadingAbove(tailKey([msg('Bon')]), tailKey([msg('Bonjour')]), away)).toBe(true)
  })

  it('en bas du fil, le suivi naturel suffit → faux', () => {
    expect(arrivedWhileReadingAbove(tailKey([msg('Q')]), tailKey([msg('Q'), msg('R')]), atBottom)).toBe(false)
  })

  it('des messages ANCIENS préposés ne sont pas une arrivée', () => {
    const before = tailKey([msg('B')])
    const after = tailKey([msg('A'), msg('B')])
    expect(arrivedWhileReadingAbove(before, after, away)).toBe(false)
  })

  it('rien de changé → faux', () => {
    const key = tailKey([msg('R')])
    expect(arrivedWhileReadingAbove(key, key, away)).toBe(false)
  })
})

describe('NewRepliesPill', () => {
  function box() {
    const node = document.createElement('div')
    Object.defineProperty(node, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(node, 'clientHeight', { value: 600, configurable: true })
    node.scrollTop = 0
    const ref = createRef<HTMLDivElement>() as { current: HTMLDivElement | null }
    ref.current = node
    return { node, ref: ref as React.RefObject<HTMLDivElement> }
  }
  const wrap = (ui: React.ReactElement) => ui

  it('apparaît à l’arrivée d’une réponse quand on lit plus haut, et ramène en bas au clic', () => {
    const { node, ref } = box()
    const { rerender } = render(wrap(<NewRepliesPill boxRef={ref} messages={[msg('Q', 'user')]} />))
    expect(screen.queryByRole('button', { name: /nouvelle réponse/i })).toBeNull()

    rerender(wrap(<NewRepliesPill boxRef={ref} messages={[msg('Q', 'user'), msg('R')]} />))
    const pill = screen.getByRole('button', { name: /nouvelle réponse/i })
    expect(pill).toHaveAttribute('type', 'button')

    fireEvent.click(pill)
    expect(node.scrollTop).toBe(2000)
    expect(screen.queryByRole('button', { name: /nouvelle réponse/i })).toBeNull()
  })

  it('disparaît quand la personne redescend lire en bas', () => {
    const { node, ref } = box()
    const { rerender } = render(wrap(<NewRepliesPill boxRef={ref} messages={[msg('Q', 'user')]} />))
    rerender(wrap(<NewRepliesPill boxRef={ref} messages={[msg('Q', 'user'), msg('R')]} />))
    expect(screen.getByRole('button', { name: /nouvelle réponse/i })).toBeInTheDocument()
    node.scrollTop = 1400
    fireEvent.scroll(node)
    expect(screen.queryByRole('button', { name: /nouvelle réponse/i })).toBeNull()
  })

  it('une réponse reçue en bas du fil ne montre aucun bouton', () => {
    const { node, ref } = box()
    node.scrollTop = 1400
    const { rerender } = render(wrap(<NewRepliesPill boxRef={ref} messages={[msg('Q', 'user')]} />))
    rerender(wrap(<NewRepliesPill boxRef={ref} messages={[msg('Q', 'user'), msg('R')]} />))
    expect(screen.queryByRole('button', { name: /nouvelle réponse/i })).toBeNull()
  })
})
