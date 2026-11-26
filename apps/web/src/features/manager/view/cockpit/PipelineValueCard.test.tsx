import { DEFAULT_STAGE_LABELS } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ManagerPipelineValue } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { PipelineValueCard } from './PipelineValueCard'

const pipeline: ManagerPipelineValue = {
  currency: 'EUR',
  total_amount: 80000,
  valued_count: 3,
  without_amount: 2,
  by_stage: [
    { stage: 'detected', amount: 30000, valued_count: 2, total_count: 3 },
    // Un étage sans aucun montant saisi : montre « — », jamais 0 €.
    { stage: 'won', amount: 0, valued_count: 0, total_count: 2 },
  ],
}

describe('PipelineValueCard', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('sums only entered amounts and counts the unvalued apart (§10)', () => {
    render(<PipelineValueCard pipeline={pipeline} />)

    expect(screen.getByText(/Pipeline partagé/)).toBeInTheDocument()
    // Total = montants SAISIS uniquement, formaté en euros.
    expect(screen.getByText(/80\s?000/)).toBeInTheDocument()
    // Les besoins sans montant sont annoncés à part, jamais forcés à 0 € dans le total.
    expect(screen.getByText(/2 opportunités sans montant/)).toBeInTheDocument()
    // L'étape est traduite depuis le catalogue `projects` — un seul vocabulaire
    // d'étape dans tout le produit, cockpit compris.
    // Le libellé vient du catalogue (« Gagnée » depuis Théo C, c141) — jamais la clé brute `won`.
    expect(screen.getByText(DEFAULT_STAGE_LABELS.won.fr)).toBeInTheDocument()
    // Un étage non chiffré affiche « — », pas « 0 € ».
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('states honestly when nothing is valued yet', () => {
    render(
      <PipelineValueCard
        pipeline={{ currency: 'EUR', total_amount: 0, valued_count: 0, without_amount: 4, by_stage: [] }}
      />,
    )
    expect(screen.getByText(/Aucune opportunité chiffrée/)).toBeInTheDocument()
  })

  it('groups thousands in every count (#3544 — « 1257 opportunités », « 0/1254 chiffrées »)', () => {
    render(
      <PipelineValueCard
        pipeline={{
          currency: 'EUR',
          total_amount: 90000,
          valued_count: 1257,
          without_amount: 2320,
          by_stage: [{ stage: 'detected', amount: 0, valued_count: 0, total_count: 1254 }],
        }}
      />,
    )
    expect(screen.getByText(/1\s?257 opportunités chiffrées/)).toBeInTheDocument()
    expect(screen.getByText(/0\/1\s?254 chiffrées/)).toBeInTheDocument()
    expect(screen.getByText(/2\s?320 opportunités sans montant/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/\b1257\b|\b1254\b|\b2320\b/)
  })
})
