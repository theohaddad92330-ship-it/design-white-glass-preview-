import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PageRecordLinks } from './PageRecordLinks'

const recordLinks = vi.fn()
vi.mock('./useRecordLinks', () => ({ useRecordLinks: () => recordLinks() }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => vi.fn() }))

describe('PageRecordLinks (#4198)', () => {
  it('ne rend rien tant que la lecture n’a rien rendu', () => {
    recordLinks.mockReturnValue({ data: undefined })
    const { container } = render(<PageRecordLinks kind="need" id="n1" />)
    expect(container).toBeEmptyDOMElement()
  })

  it('une réponse sans `links` ne fait pas tomber la fiche qui la monte', () => {
    recordLinks.mockReturnValue({ data: { items: [], total: 0 } })
    const { container } = render(<PageRecordLinks kind="need" id="n1" />)
    expect(container).toBeEmptyDOMElement()
  })
})
