import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DataforgeAccountAccess } from '@bellum/contracts'
import { DataforgeAccessBlock } from './DataforgeAccessBlock'

const FULL: DataforgeAccountAccess = {
  accessibility: 'medium',
  barriers: ['platform', 'referencing'],
  route: 'platform',
  priority: 'high',
  observedAt: '2026-10-01T00:00:00.000Z',
}

describe('DataforgeAccessBlock (lot 776)', () => {
  afterEach(cleanup)

  it('dit l’accès en libellés métier : accessibilité, barrières, route d’achat, priorité', () => {
    render(<DataforgeAccessBlock access={FULL} />)
    const block = screen.getByTestId('dataforge-access-block')
    expect(block).toHaveTextContent('Accès au compte')
    expect(block).toHaveTextContent('Base commune')
    expect(block).toHaveTextContent('Moyennement accessible')
    expect(block).toHaveTextContent('Plateforme d’achat')
    expect(block).toHaveTextContent('Référencement')
    expect(block).toHaveTextContent('Priorité haute')
    // ni code brut, ni score nu, ni probabilité, ni « 0 », ni fournisseur
    expect(block.textContent).not.toMatch(/medium|platform|\b0\b|%|Mémoire marché|Market memory/i)
  })

  it('absent ⇒ aucun bloc, jamais « 0 »', () => {
    const { container } = render(<DataforgeAccessBlock access={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('un axe non établi ne fait aucune ligne', () => {
    render(<DataforgeAccessBlock access={{ ...FULL, accessibility: null, priority: null, barriers: [] }} />)
    const block = screen.getByTestId('dataforge-access-block')
    expect(block).not.toHaveTextContent('Moyennement')
    expect(block).not.toHaveTextContent('Priorité')
    expect(block).not.toHaveTextContent('Barrière')
  })
})
