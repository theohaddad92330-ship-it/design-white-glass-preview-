import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ProjectRow, ProjectSimilarResponse } from '@bellum/contracts'
import { i18n } from '@/i18n'

const state: { data?: ProjectSimilarResponse; isPending: boolean; isError: boolean } = {
  data: undefined,
  isPending: false,
  isError: false,
}

vi.mock('../hooks/useSimilarProjects', () => ({
  useSimilarProjects: () => state,
}))

const { SimilarProjectsDialog } = await import('./SimilarProjectsDialog')

const reference: ProjectRow = {
  id: 'op-1',
  account_id: 'acc-1',
  company_name: 'Acme',
  sector: 'Industrie',
  logo_url: null,
  website: null,
  kind: 'pain',
  label: 'Migration ERP SAP',
  detail: null,
  offer: null,
  source: 'pain',
  confidence: 'high',
  urgency: 'high',
  stage: 'detected',
  stage_entered_at: '2026-07-01T00:00:00.000Z',
  owner_id: null,
  expected_close_on: null,
  closed_at: null,
  outcome: null,
  loss_reason: null,
  first_detected_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
}

/**
 * La comparaison inter-comptes ne doit jamais meubler : quand le portefeuille ne
 * contient rien de proche, l'écran le DIT. Et quand il contient quelque chose, il
 * montre l'entreprise concernée et les mots qui ont produit le rapprochement —
 * la seule justification honnête d'un match calculé sans modèle.
 */
describe('SimilarProjectsDialog', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    state.isPending = false
    state.isError = false
    state.data = undefined
  })

  it('annonce qu’il n’a rien trouvé plutôt que de proposer un rapprochement forcé', () => {
    state.data = { reference, matches: [] }

    render(<SimilarProjectsDialog opportunity={reference} open onOpenChange={vi.fn()} onOpenAccount={vi.fn()} />)

    expect(screen.getByText(/Aucun besoin comparable/)).toBeInTheDocument()
  })

  it('montre le compte concerné et les mots partagés qui justifient le match', () => {
    state.data = {
      reference,
      matches: [
        {
          ...reference,
          id: 'op-9',
          account_id: 'acc-2',
          company_name: 'Globex',
          label: 'Migration ERP SAP du groupe',
          match_score: 0.7,
          shared_terms: ['migration', 'erp', 'sap'],
        },
      ],
    }

    render(<SimilarProjectsDialog opportunity={reference} open onOpenChange={vi.fn()} onOpenAccount={vi.fn()} />)

    expect(screen.getByText('Globex')).toBeInTheDocument()
    expect(screen.getByText('Migration ERP SAP du groupe')).toBeInTheDocument()
    expect(screen.getByText('Mots partagés : migration, erp, sap')).toBeInTheDocument()
  })
})
