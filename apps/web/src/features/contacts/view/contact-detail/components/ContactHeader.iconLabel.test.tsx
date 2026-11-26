import { render, screen } from '@testing-library/react'
import { Button } from '@bellum/ui'
import { Zap } from 'lucide-react'
import { describe, expect, it } from 'vitest'

// #4474 — famille : tout bouton `icon` + libellé (Compléter, Préparer…) rend l'icône en FRÈRE du
// libellé, qui ne rétrécit jamais, avec un écart réel ; l'icône est décorative (nom = libellé, GA-32).
describe('Button icône + libellé (#4474)', () => {
  it("l'icône est un frère qui ne rétrécit pas, le bouton garde son nom", () => {
    render(<Button icon={Zap}>Compléter</Button>)
    const button = screen.getByRole('button', { name: 'Compléter' })
    const svg = button.querySelector('svg')
    expect(svg?.getAttribute('class')).toContain('shrink-0')
    expect(svg?.parentElement).toBe(button)
    expect(button.className).toContain('gap-2')
  })
})
