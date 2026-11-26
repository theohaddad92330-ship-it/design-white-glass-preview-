import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReverseProspectsSection } from './ReverseProspectsSection'
import type { ReverseProspect } from './planViewData'

const prospects: ReverseProspect[] = [
  {
    fullName: 'Claire Dupont',
    title: 'Architecte Data',
    currentCompany: 'Sopra Steria',
    linkedinUrl: 'https://linkedin.com/in/claire',
  },
  { fullName: 'Marc Petit', title: '', currentCompany: '', linkedinUrl: '' },
]

describe('ReverseProspectsSection', () => {
  it('lists the ex-collaborateurs with their current employer and a LinkedIn link', () => {
    render(<ReverseProspectsSection prospects={prospects} />)

    expect(screen.getByText('Claire Dupont')).toBeInTheDocument()
    expect(screen.getByText('Architecte Data')).toBeInTheDocument()
    expect(screen.getByText("Aujourd'hui chez Sopra Steria")).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://linkedin.com/in/claire')
  })

  it('shows the bare name when nothing else is known (jamais de champ inventé)', () => {
    render(<ReverseProspectsSection prospects={[prospects[1]!]} />)

    expect(screen.getByText('Marc Petit')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('renders nothing when the dossier has no reverse prospect', () => {
    const { container } = render(<ReverseProspectsSection prospects={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
