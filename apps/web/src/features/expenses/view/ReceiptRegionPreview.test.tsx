import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../i18n'
import { ReceiptRegionPreview } from './ReceiptRegionPreview'

/**
 * #2433.4 — la preuve VISUELLE d'un champ lu : la zone de l'image, surlignée.
 * Aucune zone → aucun bouton (on n'affiche pas ce qu'on n'a pas).
 */
const image = new File([new Uint8Array([1, 2, 3])], 'ticket.png', { type: 'image/png' })

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:ticket') as unknown as typeof URL.createObjectURL
  URL.revokeObjectURL = vi.fn()
})
afterEach(cleanup)

describe('ReceiptRegionPreview', () => {
  it('ne rend rien sans zone', () => {
    const { container } = render(<ReceiptRegionPreview file={image} regions={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('ne rend rien pour un fichier qui n’est pas une image', () => {
    const pdf = new File(['x'], 'note.pdf', { type: 'application/pdf' })
    const { container } = render(
      <ReceiptRegionPreview file={pdf} regions={[{ label: 'Montant', region: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } }]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('montre l’image et surligne chaque zone en pourcentage de l’image', async () => {
    render(
      <ReceiptRegionPreview
        file={image}
        regions={[{ label: 'Montant', region: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 } }]}
      />,
    )
    expect(screen.queryByRole('img')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Voir où c’est lu/ }))
    expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:ticket')
    const zone = screen.getByTestId('receipt-region-Montant')
    expect(zone.style.left).toBe('10%')
    expect(zone.style.top).toBe('20%')
    expect(zone.style.width).toBe('30%')
    expect(zone.style.height).toBe('10%')
    expect(screen.getByText('Zone lue : Montant')).toBeInTheDocument()
  })
})
