import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SelectionBar } from './SelectionBar'

const noop = vi.fn()

function renderBar(onPushToCrm?: () => void) {
  return render(
    <SelectionBar
      count={2}
      onCompare={noop}
      onCreateTarget={noop}
      onRefreshSignals={noop}
      onRefreshContacts={noop}
      onDiscoverContacts={noop}
      onAnalyzeBatch={noop}
      onPushToCrm={onPushToCrm}
      onClear={noop}
    />,
  )
}

/**
 * #4188.4 — avec 2 comptes cochés, la barre faisait 1375 px dans une fenêtre de 1512 px :
 * « Envoyer vers mon CRM » partait hors écran. Une barre qui tient passe à la ligne ;
 * elle ne porte aucune largeur fixe en px et ses cibles font ≥ 44 px.
 */
describe('SelectionBar — la barre tient dans l’écran (#4188.4)', () => {
  it('passe à la ligne et se borne à la largeur de la fenêtre', () => {
    renderBar(noop)
    const bar = screen.getByRole('button', { name: /Comparer/i }).parentElement as HTMLElement
    expect(bar.className).toMatch(/\bflex-wrap\b/)
    expect(bar.className).toMatch(/max-w-\[calc\(100vw-2rem\)\]/)
    expect(bar.className).not.toMatch(/-translate-x-1\/2/)
    expect(bar.className).not.toMatch(/\bw-\[\d+px\]|\bmin-w-\[\d+px\]/)
  })

  it('sait dire NON : toutes les actions sont des boutons atteignables, cibles ≥ 44 px', () => {
    renderBar(noop)
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(8)
    for (const button of buttons) expect(button.className).toMatch(/\bmin-h-11\b/)
  })

  it('sans CRM branché, aucune action « CRM »', () => {
    renderBar(undefined)
    expect(screen.queryByRole('button', { name: /CRM/i })).not.toBeInTheDocument()
  })
})
