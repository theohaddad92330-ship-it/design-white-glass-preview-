import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'

// RV4-E-FIX 4295.13 (#4016.8e) — le traceur du pipe : CA potentiel + dernier TJM connu, derrière le droit financier.
const finance = vi.hoisted(() => ({ canReadPipeAmounts: true }))
const needs = vi.hoisted(() => ({ value: undefined as unknown, isError: false }))
vi.mock('@/features/propagation/api', () => ({ useFinanceAccess: () => finance }))
vi.mock('@/features/projects/open-needs/hooks/useOpenNeeds', () => ({
  useOpenNeeds: () => ({ data: needs.value, isError: needs.isError }),
}))

import { PipeNeedsTracker } from './PipeNeedsTracker'

const row = (over: Record<string, unknown>) => ({
  id: 'n',
  title: 'Dev Java',
  headcount: 1,
  target_tjm_cents: null,
  status_changed_at: null,
  ...over,
})

beforeEach(async () => {
  await i18n.changeLanguage('fr')
  finance.canReadPipeAmounts = true
  needs.isError = false
  needs.value = {
    data: [
      row({ id: 'a', target_tjm_cents: 60_000, headcount: 2, status_changed_at: '2026-10-10T00:00:00.000Z' }),
      row({ id: 'b' }),
    ],
    pagination: { totalItems: 2 },
  }
})
afterEach(cleanup)

describe('PipeNeedsTracker', () => {
  it('rend le CA potentiel et le dernier TJM connu', () => {
    render(<PipeNeedsTracker />)
    expect(screen.getByText('CA potentiel (cumul journalier)')).toBeInTheDocument()
    expect(screen.getByText('Dernier TJM connu')).toBeInTheDocument()
    expect(screen.getByText(/1\s?200/)).toBeInTheDocument()
    expect(screen.getByText(/1 besoin sans tarif/)).toBeInTheDocument()
  })

  it('au-delà de la page lue, le chiffre se dit plancher', () => {
    needs.value = { data: [row({ target_tjm_cents: 50_000 })], pagination: { totalItems: 340 } }
    render(<PipeNeedsTracker />)
    expect(screen.getByText(/Lu sur 1 besoins sur 340/)).toBeInTheDocument()
  })

  it('sait dire NON : sans le droit financier, la section entière est retirée (jamais un 0 €)', () => {
    finance.canReadPipeAmounts = false
    const { container } = render(<PipeNeedsTracker />)
    expect(container).toBeEmptyDOMElement()
  })

  it('sait dire NON : aucun tarif ⇒ ni montant ni « 0 € », la raison se lit', () => {
    needs.value = { data: [row({}), row({ id: 'b' })], pagination: { totalItems: 2 } }
    const { container } = render(<PipeNeedsTracker />)
    expect(screen.getByText('Aucun tarif communiqué sur les besoins ouverts')).toBeInTheDocument()
    expect(screen.getByText('Aucun TJM connu : aucun besoin ouvert n’en porte.')).toBeInTheDocument()
    expect((container.textContent ?? '').replace('jamais à 0 €', '')).not.toMatch(/\b0\s?€/)
  })
})
