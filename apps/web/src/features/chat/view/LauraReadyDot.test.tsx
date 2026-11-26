import { render, screen } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useBackgroundTurnsStore } from '@/features/chat/lib/background-turns'
import { LauraReadyDot } from './LauraReadyDot'

describe('#4967.3 — la pastille « réponse prête »', () => {
  beforeEach(() => useBackgroundTurnsStore.getState().reset())

  it('absente tant qu’aucune réponse n’attend, même si une recherche tourne encore', () => {
    useBackgroundTurnsStore.getState().begin('c1')
    render(<LauraReadyDot />)
    expect(screen.queryByText('Une réponse de Laura est prête')).not.toBeInTheDocument()
  })

  it('présente, avec un texte accessible, dès qu’une réponse est prête ; part une fois lue', () => {
    render(<LauraReadyDot />)
    act(() => {
      useBackgroundTurnsStore.getState().begin('c1')
      useBackgroundTurnsStore.getState().finish('c1', { visible: false })
    })
    expect(screen.getByText('Une réponse de Laura est prête')).toBeInTheDocument()
    act(() => useBackgroundTurnsStore.getState().acknowledge('c1'))
    expect(screen.queryByText('Une réponse de Laura est prête')).not.toBeInTheDocument()
  })
})
