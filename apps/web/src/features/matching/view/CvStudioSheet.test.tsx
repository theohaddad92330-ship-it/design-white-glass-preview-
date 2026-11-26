import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/features/consultants/view/studio/CvStudioPanel', () => ({
  CvStudioPanel: ({ talentId }: { talentId: string }) => <div data-testid="cv-studio-panel">{talentId}</div>,
}))

const { CvStudioSheet } = await import('./CvStudioSheet')

describe('CvStudioSheet — préparer le CV depuis le matching (#2936, #2176.45)', () => {
  it('ouvre le studio existant pour CE profil, jamais un second moteur', () => {
    render(<CvStudioSheet consultantId="c-1" name="Alice Martin" onClose={() => {}} />)
    expect(screen.getByText('Préparer le CV — Alice Martin')).toBeInTheDocument()
    expect(screen.getByTestId('cv-studio-panel')).toHaveTextContent('c-1')
  })

  it('sans profil sélectionné, ne rend rien', () => {
    const { container } = render(<CvStudioSheet consultantId={null} name="" onClose={() => {}} />)
    expect(container).toBeEmptyDOMElement()
  })
})
