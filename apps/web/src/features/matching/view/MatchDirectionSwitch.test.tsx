import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MatchDirectionSwitch } from './MatchDirectionSwitch'

describe('MatchDirectionSwitch — Théo C projects-rapprochement.HT-7', () => {
  it('le sens courant est pressé, l’autre sens ouvre son sélecteur au clic', () => {
    render(<MatchDirectionSwitch current="need" picker={<a href="/c1">Alice</a>} />)
    expect(screen.getByRole('button', { name: 'Besoin → consultants' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('match-direction-picker')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Consultant → besoins' }))
    expect(screen.getByTestId('match-direction-picker')).toHaveTextContent('Alice')
    fireEvent.click(screen.getByRole('button', { name: 'Consultant → besoins' }))
    expect(screen.queryByTestId('match-direction-picker')).toBeNull()
  })

  it('depuis un consultant, l’autre sens est « Besoin → consultants »', () => {
    render(<MatchDirectionSwitch current="consultant" picker={<a href="/n1">SAP</a>} />)
    expect(screen.getByRole('button', { name: 'Consultant → besoins' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Besoin → consultants' }))
    expect(screen.getByTestId('match-direction-picker')).toHaveTextContent('SAP')
  })
})
