import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { AnalysisVocabularyTerm } from '@bellum/contracts'
import { AccountVocabularySection } from './AccountVocabularySection'

const mockUseAccountVocabulary = vi.fn()

vi.mock('@/features/accounts/hooks/useAccountVocabulary', () => ({
  useAccountVocabulary: (...args: unknown[]) => mockUseAccountVocabulary(...args),
}))

const TERMS: AnalysisVocabularyTerm[] = [
  {
    term: 'Axians',
    kind: 'internal_competitor',
    meaning: 'ESN interne du groupe VINCI',
    commercialWhy: 'Soit le concurrencer, soit le solliciter en rang 2.',
    aliases: ['VESI'],
    relatedEntity: 'VINCI Energies',
    truthStatus: 'risque',
    sourceRefs: ['https://www.example.com/axians', 'Pappers'],
  },
  {
    term: 'TDSI',
    kind: 'acronym',
    aliases: [],
    sourceRefs: [],
  },
]

describe('AccountVocabularySection', () => {
  it('renders the reading grid: terme / sens / impact commercial / source / statut', () => {
    mockUseAccountVocabulary.mockReturnValue({ data: TERMS })

    render(<AccountVocabularySection accountId="acc-1" />)

    // Section header (FR default in tests) + the grid columns.
    expect(screen.getByText('Vocabulaire du groupe')).toBeInTheDocument()
    expect(screen.getByText('Terme')).toBeInTheDocument()
    expect(screen.getByText('Sens')).toBeInTheDocument()
    expect(screen.getByText('Impact commercial')).toBeInTheDocument()
    expect(screen.getByText('Source')).toBeInTheDocument()
    expect(screen.getByText('Statut')).toBeInTheDocument()

    // One row per term, with translated kind + truth-status labels.
    expect(screen.getByText('Axians')).toBeInTheDocument()
    expect(screen.getByText('Concurrent en place')).toBeInTheDocument()
    expect(screen.getByText('ESN interne du groupe VINCI')).toBeInTheDocument()
    expect(screen.getByText('Soit le concurrencer, soit le solliciter en rang 2.')).toBeInTheDocument()
    expect(screen.getByText('Risque')).toBeInTheDocument()
    expect(screen.getByText('Alias : VESI')).toBeInTheDocument()
    expect(screen.getByText('TDSI')).toBeInTheDocument()
    expect(screen.getByText('Acronyme')).toBeInTheDocument()

    // Provenance: first URL ref renders as an outbound link on its hostname,
    // the extra ref collapses into a +N hint.
    const link = screen.getByRole('link', { name: 'example.com' })
    expect(link).toHaveAttribute('href', 'https://www.example.com/axians')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.getByText('+1')).toBeInTheDocument()
  })

  // Recette 21/10 D.5 (A.6) — une source texte longue (« périmètre : … ») ne se coupe pas.
  it('lets a long text source wrap: no truncate, no max-w-40 on its cell', () => {
    const longRef = 'périmètre : ' + 'infogérance et services applicatifs du groupe '.repeat(20).trim()
    mockUseAccountVocabulary.mockReturnValue({
      data: [{ term: 'Y', kind: 'internal_competitor', aliases: [], sourceRefs: [longRef] }],
    })

    render(<AccountVocabularySection accountId="acc-1" />)

    const chip = screen.getByTitle(longRef)
    expect(chip.className).not.toContain('truncate')
    expect(chip.className).not.toContain('whitespace-nowrap')
    expect(chip.closest('td')?.className).not.toContain('max-w-40')
  })

  it('falls back to the raw value for an unknown kind / truth status (never invents)', () => {
    mockUseAccountVocabulary.mockReturnValue({
      data: [{ term: 'X1', kind: 'future_kind', truthStatus: 'future_status', aliases: [], sourceRefs: [] }],
    })

    render(<AccountVocabularySection accountId="acc-1" />)

    expect(screen.getByText('future_kind')).toBeInTheDocument()
    expect(screen.getByText('future_status')).toBeInTheDocument()
  })

  it('renders nothing while the grid is empty (legacy dossier without vocabulary)', () => {
    mockUseAccountVocabulary.mockReturnValue({ data: [] })

    const { container } = render(<AccountVocabularySection accountId="acc-1" />)

    expect(container).toBeEmptyDOMElement()
  })
})
