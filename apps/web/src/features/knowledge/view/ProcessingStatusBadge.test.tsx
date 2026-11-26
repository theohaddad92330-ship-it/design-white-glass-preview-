import { RAG_PROCESSING_STATUSES } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import fr from '@/i18n/locales/fr/knowledge.json'
import en from '@/i18n/locales/en/knowledge.json'
import { ProcessingStatusBadge } from './ProcessingStatusBadge'

// #3669.2 — un document non exploitable n'est jamais annoncé « intégré » ; un
// statut absent ne fait AUCUNE ligne.
describe('ProcessingStatusBadge', () => {
  it('ne rend rien sans statut (non évalué)', () => {
    const { container } = render(<ProcessingStatusBadge status={null} />)
    expect(container).toBeEmptyDOMElement()
    const undef = render(<ProcessingStatusBadge status={undefined} />)
    expect(undef.container).toBeEmptyDOMElement()
  })

  it.each(RAG_PROCESSING_STATUSES)('rend le statut %s avec son état', status => {
    render(<ProcessingStatusBadge status={status} />)
    expect(screen.getByTestId('document-processing-status').getAttribute('data-status')).toBe(status)
  })

  it('FR et EN nomment les cinq statuts, et seul « usable » dit exploitable', () => {
    for (const status of RAG_PROCESSING_STATUSES) {
      expect(fr.documents.processingStatus[status]).toBeTruthy()
      expect(en.documents.processingStatus[status]).toBeTruthy()
    }
    expect(fr.documents.processingStatus.to_fix).not.toMatch(/exploitable/i)
    expect(en.documents.processingStatus.to_fix).not.toMatch(/usable/i)
    expect(fr.documents.processingStatus.partial).toMatch(/Partiellement/)
  })
})
