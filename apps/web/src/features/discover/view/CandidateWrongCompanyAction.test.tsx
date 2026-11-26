import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

const reportWrongCompany = vi.fn()

vi.mock('@/features/discover/api/discover-api', () => ({
  discoverApi: { feedback: { reportWrongCompany: (...args: unknown[]) => reportWrongCompany(...args) } },
}))

import { CandidateWrongCompanyAction } from './CandidateWrongCompanyAction'

const SIREN = '552081317'

beforeEach(() => {
  reportWrongCompany.mockReset()
})

/**
 * #3671.2bis — le geste « Mauvaise entreprise » : deux clics (le second
 * confirme), jamais un signalement sur un simple survol ou un clic perdu.
 */
describe('CandidateWrongCompanyAction (#3671.2bis)', () => {
  it('ne signale rien avant confirmation', async () => {
    renderWithRouter(<CandidateWrongCompanyAction siren={SIREN} />)
    fireEvent.click(await screen.findByRole('button', { name: /mauvaise entreprise/i }))
    expect(reportWrongCompany).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: /confirmer/i })).toBeInTheDocument()
  })

  it('signale le SIREN seulement après confirmation, puis se désactive', async () => {
    reportWrongCompany.mockResolvedValue({
      siren: SIREN,
      verdict: 'wrong_company',
      recordedAt: '2026-10-08T00:00:00.000Z',
    })
    renderWithRouter(<CandidateWrongCompanyAction siren={SIREN} />)

    fireEvent.click(await screen.findByRole('button', { name: /mauvaise entreprise/i }))
    fireEvent.click(await screen.findByRole('button', { name: /confirmer/i }))

    await waitFor(() => expect(reportWrongCompany).toHaveBeenCalledWith(SIREN))
    expect(await screen.findByText(/ne sera plus proposé/i)).toBeInTheDocument()
  })

  it('annuler revient au bouton initial sans rien signaler', async () => {
    renderWithRouter(<CandidateWrongCompanyAction siren={SIREN} />)
    fireEvent.click(await screen.findByRole('button', { name: /mauvaise entreprise/i }))
    fireEvent.click(await screen.findByRole('button', { name: /annuler/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: /mauvaise entreprise/i })).toBeInTheDocument())
    expect(reportWrongCompany).not.toHaveBeenCalled()
  })
})
