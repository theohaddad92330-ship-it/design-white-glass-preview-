import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectRow } from '@bellum/contracts'
import { i18n } from '@/i18n'

const mutateMock = vi.fn()
vi.mock('../hooks/useUpdateProjectAmount', () => ({
  useUpdateProjectAmount: () => ({ mutate: mutateMock, isPending: false }),
}))

const { ProjectAmountControl } = await import('./ProjectAmountControl')

const base: ProjectRow = {
  id: 'opp-1',
  account_id: 'acc-1',
  company_name: 'Acme',
  sector: null,
  logo_url: null,
  website: null,
  kind: 'pain',
  label: 'Migration ERP',
  detail: null,
  offer: null,
  source: null,
  confidence: null,
  urgency: null,
  stage: 'detected',
  stage_entered_at: '2026-07-01T00:00:00.000Z',
  owner_id: null,
  expected_close_on: null,
  closed_at: null,
  outcome: null,
  loss_reason: null,
  first_detected_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
  estimated_amount: null,
}

describe('ProjectAmountControl', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    mutateMock.mockReset()
  })

  it('offers to add an amount when none is set, then persists what is entered', () => {
    render(<ProjectAmountControl opportunity={base} />)

    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un montant estimé' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Montant estimé en euros' }), {
      target: { value: '25000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(mutateMock).toHaveBeenCalledWith({ id: 'opp-1', amount: 25000 }, expect.anything())
  })

  it('clears the amount when the field is emptied (never a fabricated 0)', () => {
    render(<ProjectAmountControl opportunity={{ ...base, estimated_amount: 25000 }} />)

    // Le montant existant est affiché ; on ouvre l'édition et on le vide.
    fireEvent.click(screen.getByRole('button', { name: 'Modifier le montant estimé' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Montant estimé en euros' }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(mutateMock).toHaveBeenCalledWith({ id: 'opp-1', amount: null }, expect.anything())
  })

  it('refuses a negative amount rather than inventing one', () => {
    render(<ProjectAmountControl opportunity={base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter un montant estimé' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Montant estimé en euros' }), { target: { value: '-5' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    expect(mutateMock).not.toHaveBeenCalled()
  })

  it('#4191 R22 — lit le MÊME montant que la liste : amount_cents quand estimated_amount manque', () => {
    render(<ProjectAmountControl opportunity={{ ...base, estimated_amount: null, amount_cents: 21_600_000 }} />)

    expect(screen.queryByRole('button', { name: 'Ajouter un montant estimé' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Modifier le montant estimé' }).textContent).toMatch(/216\s?000/)
  })
})
