import type { KeyNote } from '@bellum/contracts'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { KeyNotesCard } from './KeyNotesCard'

const baseNote: KeyNote = {
  label: 'Un organigramme SI codifié à quatre niveaux',
  constat: 'Quatre-vingt-sept codes distincts ont été observés.',
  interpretation: 'Chaque code correspond à une équipe réelle.',
  implication: "C'est le niveau de granularité auquel se vend une prestation.",
  reliability: 'Confirmé',
  amount: null,
  currency: null,
  period: null,
}

describe('KeyNotesCard', () => {
  it('renders nothing when there are no notes — sait dire NON', () => {
    const { container } = render(<KeyNotesCard title="Axes de lecture" icon={null} notes={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing when notes is undefined — analyse antérieure à ce lot', () => {
    const { container } = render(<KeyNotesCard title="Axes de lecture" icon={null} notes={undefined} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('drops a note the source left unlabelled instead of rendering an empty line', () => {
    const { container } = render(
      <KeyNotesCard
        title="Axes de lecture"
        icon={null}
        notes={[
          { ...baseNote, label: null },
          { ...baseNote, label: '' },
        ]}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the label, constat, interpretation, implication and reliability of a real note', () => {
    render(<KeyNotesCard title="Axes de lecture" icon={null} notes={[baseNote]} />)
    expect(screen.getByText('Axes de lecture')).toBeInTheDocument()
    expect(screen.getByText(baseNote.label as string)).toBeInTheDocument()
    expect(screen.getByText(baseNote.constat as string)).toBeInTheDocument()
    expect(screen.getByText(/Chaque code correspond à une équipe réelle/)).toBeInTheDocument()
    expect(screen.getByText(/niveau de granularité/)).toBeInTheDocument()
    expect(screen.getByText(/Confirmé/)).toBeInTheDocument()
  })

  it('omits interpretation/implication/reliability lines the source left empty — no invented text', () => {
    render(
      <KeyNotesCard
        title="Axes de lecture"
        icon={null}
        notes={[{ ...baseNote, interpretation: null, implication: null, reliability: null }]}
      />,
    )
    expect(screen.queryByText(/Lecture :/)).toBeNull()
    expect(screen.queryByText(/Implication :/)).toBeNull()
    expect(screen.queryByText(/Fiabilité :/)).toBeNull()
  })

  it('ne rend AUCUN garde-fou (Louis 14/10/2026) — une note de fiabilité « Garde-fou » ne fait pas de ligne', () => {
    const { container } = render(
      <KeyNotesCard
        title="Axes de lecture"
        icon={null}
        notes={[{ ...baseNote, label: 'Organigramme reconstitué, pas officiel', reliability: 'Garde-fou' }]}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('formats a dated amount when the note carries one (bloc 16_INDICATEURS)', () => {
    const { container } = render(
      <KeyNotesCard
        title="Indicateurs financiers"
        icon={null}
        notes={[
          {
            ...baseNote,
            label: 'Produit net bancaire Groupe',
            amount: 14202,
            currency: 'EUR',
            period: 'H1 2026',
          },
        ]}
      />,
    )
    const amountSpan = container.querySelector('span')
    const normalized = (amountSpan?.textContent ?? '').replace(/\s/gu, ' ')
    expect(normalized).toContain('14')
    expect(normalized).toContain('202')
    expect(normalized).toContain('H1 2026')
    expect(amountSpan?.textContent).toMatch(/[€]/u)
  })

  it('never shows an amount when the source left it null — no invented 0', () => {
    const { container } = render(
      <KeyNotesCard
        title="Indicateurs financiers"
        icon={null}
        notes={[{ ...baseNote, label: 'Clients BoursoBank', reliability: null }]}
      />,
    )
    expect(container.querySelector('span')).toBeNull()
  })
})
