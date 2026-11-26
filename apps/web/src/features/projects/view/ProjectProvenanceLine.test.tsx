import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { ProjectRow } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ProjectProvenanceLine } from './ProjectProvenanceLine'

const row = (patch: Partial<ProjectRow> = {}): ProjectRow => ({
  id: 'op-1',
  account_id: 'acc-1',
  company_name: 'ACME',
  sector: null,
  logo_url: null,
  website: null,
  kind: 'pain',
  label: 'Migration Cloud',
  detail: null,
  offer: null,
  source: 'pain',
  confidence: 'high',
  urgency: null,
  stage: 'detected',
  stage_entered_at: '2026-07-01T00:00:00.000Z',
  owner_id: null,
  expected_close_on: null,
  closed_at: null,
  outcome: null,
  loss_reason: null,
  first_detected_at: '2026-07-20T10:00:00.000Z',
  updated_at: '2026-07-20T10:00:00.000Z',
  ...patch,
})

describe('ProjectProvenanceLine', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
  })

  it('rend la source et la confiance stockées', () => {
    const { container } = render(<ProjectProvenanceLine opportunity={row()} />)

    expect(screen.getByText(/Douleur relevée dans l'analyse/)).toBeInTheDocument()
    expect(screen.getByText('Confiance élevée')).toBeInTheDocument()
    // Actualisée le jour de la détection : rien à annoncer de plus.
    expect(container.textContent).not.toMatch(/Calculé le/)
  })

  it("annonce la date de recalcul quand l'opportunité a été réactualisée un autre jour", () => {
    // La phrase vient désormais de la primitive partagée `ComputedAt` (tome 7,
    // loi 2, élément n°10) : cette ligne avait son propre formateur de date, et
    // c'était la deuxième des trois formulations du produit pour la même idée.
    render(<ProjectProvenanceLine opportunity={row({ updated_at: '2026-07-22T09:00:00.000Z' })} />)

    expect(screen.getByText(/Calculé le 22\/07\/2026/)).toBeInTheDocument()
  })

  it('ne rend RIEN quand rien n’est stocké — un dossier antérieur reste lisible', () => {
    const { container } = render(<ProjectProvenanceLine opportunity={row({ source: null, confidence: null })} />)

    expect(container).toBeEmptyDOMElement()
  })
})
