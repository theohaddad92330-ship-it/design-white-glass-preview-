import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EnrichmentBatchResultDialog } from './EnrichmentBatchResultDialog'

describe('EnrichmentBatchResultDialog — #2988 (#2161), résultat contact par contact', () => {
  it('affiche une ligne par contact, avec son statut nommé, et le titre le nombre exact du lot', () => {
    render(
      <EnrichmentBatchResultDialog
        open
        onOpenChange={vi.fn()}
        rows={[
          { contactId: '1', fullName: 'Alice Martin', status: 'matched_both' },
          { contactId: '2', fullName: 'Bruno Vaquette', status: 'opt_out' },
          { contactId: '3', fullName: 'Chloé Dupuis', status: 'technical_error' },
        ]}
      />,
    )

    expect(screen.getByText("Résultat de l'enrichissement — 3 contacts")).toBeInTheDocument()
    expect(screen.getByText('Alice Martin')).toBeInTheDocument()
    expect(screen.getByText('Email + téléphone trouvés')).toBeInTheDocument()
    expect(screen.getByText('Bruno Vaquette')).toBeInTheDocument()
    expect(screen.getByText("A demandé qu'on cesse")).toBeInTheDocument()
    expect(screen.getByText('Chloé Dupuis')).toBeInTheDocument()
    expect(screen.getByText('Erreur technique')).toBeInTheDocument()
  })
})
