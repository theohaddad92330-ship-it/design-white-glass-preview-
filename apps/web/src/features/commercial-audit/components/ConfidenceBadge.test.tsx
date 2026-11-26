import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConfidenceBadge } from './ConfidenceBadge'

/**
 * #2090.29 — LE TEST QUI SAIT DIRE NON : jamais un pourcentage, jamais un
 * score nu. Un palier NOMMÉ dans les trois cas connus, et « non mesurée »
 * quand `confidence` est `null` — distinct de « déduit » (le palier faible).
 */
describe('ConfidenceBadge', () => {
  it.each([
    ['corroborated', 'Recoupé'],
    ['single_source', 'Source unique'],
    ['deduced', 'Déduit'],
  ] as const)('rend le palier NOMMÉ pour « %s »', (confidence, label) => {
    render(<ConfidenceBadge confidence={confidence} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('rend « Non mesurée » sur `null` — jamais confondu avec « Déduit »', () => {
    render(<ConfidenceBadge confidence={null} />)
    expect(screen.getByText('Non mesurée')).toBeInTheDocument()
    expect(screen.queryByText('Déduit')).not.toBeInTheDocument()
  })

  it('ne rend jamais de chiffre ni de signe pourcentage — ce n’est pas un score', () => {
    for (const confidence of ['corroborated', 'single_source', 'deduced', null] as const) {
      const { container, unmount } = render(<ConfidenceBadge confidence={confidence} />)
      expect(container.textContent).not.toMatch(/\d/)
      expect(container.textContent).not.toContain('%')
      unmount()
    }
  })
})
