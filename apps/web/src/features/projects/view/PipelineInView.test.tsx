import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PipelineInView } from './PipelineInView'

// Théo C projects-pipeline.R3 — « 8 affaires dans cette vue » : un seul chiffre de tête, celui de la vue.
describe('PipelineInView', () => {
  it('compte les affaires de la vue, au pluriel', () => {
    render(<PipelineInView count={8} />)
    expect(screen.getByText('8 affaires dans cette vue')).toBeInTheDocument()
  })

  it('au singulier pour une seule', () => {
    render(<PipelineInView count={1} />)
    expect(screen.getByText('1 affaire dans cette vue')).toBeInTheDocument()
  })

  it('dit « Aucune affaire dans cette vue » plutôt que « 0 affaire »', () => {
    render(<PipelineInView count={0} />)
    expect(screen.getByText('Aucune affaire dans cette vue')).toBeInTheDocument()
    expect(screen.queryByText(/^0 /)).toBeNull()
  })
})
