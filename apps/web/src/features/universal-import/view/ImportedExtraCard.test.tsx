import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '@/i18n'
import { ImportedExtraCard } from './ImportedExtraCard'

describe('ImportedExtraCard', () => {
  it('affiche chaque colonne conservée sous son en-tête d’origine', () => {
    render(<ImportedExtraCard extra={{ 'Code interne ERP': 'ERP-0001', 'Commercial historique': 'Équipe Ouest' }} />)
    expect(screen.getByText('Code interne ERP')).toBeInTheDocument()
    expect(screen.getByText('ERP-0001')).toBeInTheDocument()
    expect(screen.getByText('Équipe Ouest')).toBeInTheDocument()
  })

  it('ne rend RIEN sans donnée — ni carte vide, ni « 0 »', () => {
    const { container } = render(<ImportedExtraCard extra={{}} />)
    expect(container).toBeEmptyDOMElement()
    const { container: blank } = render(<ImportedExtraCard extra={{ Vide: '  ' }} />)
    expect(blank).toBeEmptyDOMElement()
    const { container: absent } = render(<ImportedExtraCard extra={undefined} />)
    expect(absent).toBeEmptyDOMElement()
  })
})
