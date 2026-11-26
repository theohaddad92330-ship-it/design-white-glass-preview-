import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { PrefillBadge } from './PrefillBadge'

/**
 * #2028.2 / #2028.5 — la date de la donnée préremplie.
 *
 * `prefilledFieldSchema` porte désormais `as_of` (additif, `nullable().default(null)`),
 * mais le producteur IA n'en émet pas encore (#2028.8, `à trancher`) : ce badge
 * doit donc gérer les DEUX cas honnêtement — la date quand elle existe, « date
 * inconnue » quand elle n'existe pas, jamais une date devinée.
 */
const actions = { onConfirm: vi.fn(), onCorrect: vi.fn(), onIgnore: vi.fn() }

async function renderBadge(meta: Parameters<typeof PrefillBadge>[0]['meta']): Promise<void> {
  renderWithRouter(
    <>
      <PrefillBadge meta={meta} {...actions} />
      <div data-testid="sentinel" />
    </>,
  )
  await screen.findByTestId('sentinel')
}

describe('PrefillBadge — #2028.2 la date', () => {
  it('expose la date à l’assistance quand la source la fournit', async () => {
    await renderBadge({
      confidence: 'high',
      source: 'registry',
      rationale: 'Raison sociale au registre',
      asOf: '2025-03-01',
    })
    expect(screen.getByLabelText(/2025/)).toBeInTheDocument()
  })

  it('dit « date inconnue » plutôt que de se taire quand la source ne la fournit pas', async () => {
    await renderBadge({ confidence: 'high', source: 'registry', asOf: null })
    expect(screen.getByLabelText(/date inconnue/i)).toBeInTheDocument()
  })

  it('dit aussi « date inconnue » quand `asOf` est simplement absent (métadonnée antérieure au champ)', async () => {
    await renderBadge({ confidence: 'medium', source: 'pappers' })
    expect(screen.getByLabelText(/date inconnue/i)).toBeInTheDocument()
  })

  it("n'invente jamais la date du jour quand elle est inconnue", async () => {
    const today = new Date().getFullYear().toString()
    await renderBadge({ confidence: 'high', source: 'registry', asOf: null })
    expect(screen.queryByLabelText(new RegExp(today))).not.toBeInTheDocument()
  })
})
