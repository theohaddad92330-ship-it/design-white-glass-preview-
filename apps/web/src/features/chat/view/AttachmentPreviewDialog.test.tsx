import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { AttachmentPreviewDialog } from './AttachmentPreviewDialog'

vi.mock('@/features/rag/hooks/useRagDocumentContent', () => ({
  useRagDocumentContent: () => ({ data: undefined, isLoading: false, isError: false }),
}))
vi.mock('@/features/rag/hooks/useChatImageUrl', () => ({
  useChatImageUrl: () => ({ data: undefined, isLoading: false }),
}))

/**
 * #3751.4 — l'aperçu d'un classeur garde ses lignes ET ses colonnes : le texte
 * extrait sépare les lignes par `\n` et les colonnes par des tabulations, l'aperçu
 * ne doit pas les écraser en une ligne (`white-space: pre-wrap`).
 */
describe('AttachmentPreviewDialog — aperçu d’un classeur (#3751.4)', () => {
  it('rend chaque ligne du tableur sur sa propre ligne, colonnes tabulées conservées', () => {
    const sheet = 'Exigence\tObligatoire\nSécurité\toui\nSLA\tnon'
    render(<AttachmentPreviewDialog id="doc-1" name="grille.xlsx" content={sheet} onOpenChange={() => {}} />)

    const preview = screen.getByText(/Exigence/)
    expect(preview.textContent).toBe(sheet)
    expect(preview.className).toContain('whitespace-pre-wrap')
  })
})

/**
 * #2433.4 (épopée #2876, lot M10 09/10) — la CITATION VISUELLE : sur l'image
 * jointe au chat, la zone où chaque ligne a été lue est surlignée, et la ligne
 * citée est nommée. Sans zone, rien n'est dessiné — on n'affiche pas ce qu'on
 * n'a pas.
 */
describe('AttachmentPreviewDialog — zones de lecture d’une image (#2433.4)', () => {
  const citations = [{ image_id: 'img-1', quote: 'TOTAL 42,00 €', bounding_box: { x: 0.1, y: 0.7, w: 0.5, h: 0.08 } }]

  it('surligne la zone de chaque ligne lue, et nomme la citation', () => {
    render(
      <AttachmentPreviewDialog
        id="ephemeral:1"
        name="ticket.png"
        imageUrl="blob:ticket"
        citations={citations}
        onOpenChange={() => {}}
      />,
    )
    const zone = screen.getByTestId('chat-image-citation-0')
    expect(zone.style.left).toBe('10%')
    expect(zone.style.top).toBe('70%')
    expect(zone.style.width).toBe('50%')
    expect(screen.getByText(/TOTAL 42,00 €/)).toBeInTheDocument()
  })

  it('sans zone, aucun surlignage — et sans image, aucune zone même si elles existent', () => {
    const { rerender } = render(
      <AttachmentPreviewDialog id="ephemeral:1" name="ticket.png" imageUrl="blob:ticket" onOpenChange={() => {}} />,
    )
    expect(screen.queryByTestId('chat-image-citation-0')).toBeNull()
    rerender(
      <AttachmentPreviewDialog
        id="ephemeral:1"
        name="ticket.png"
        content="TOTAL 42,00 €"
        citations={citations}
        onOpenChange={() => {}}
      />,
    )
    expect(screen.queryByTestId('chat-image-citation-0')).toBeNull()
  })
})

/**
 * #2433.12 (épopée #2876, lot P02 09/10) — le LOCALISEUR D'OBJETS : les bords
 * du document deviennent un recadrage PROPOSÉ (jamais appliqué d'office), la
 * grille d'un tableau est rendue dans la grille de tableau existante. Sans
 * bords détectés, l'image reste entière et l'aperçu le DIT ; rien mesuré, il
 * ne dit rien.
 */
describe('AttachmentPreviewDialog — recadrage et tableau d’une image (#2433.12)', () => {
  const bounds = { x: 0.1, y: 0.05, w: 0.8, h: 0.9 }
  const table = {
    boundingBox: null,
    rows: [
      ['Profil', 'TJM'],
      ['Tech lead', null],
    ],
  }

  it('propose le recadrage sans l’appliquer, puis le montre au clic', async () => {
    render(
      <AttachmentPreviewDialog
        id="ephemeral:1"
        name="capture.png"
        imageUrl="blob:capture"
        objects={{ documentBounds: bounds, table: null }}
        onOpenChange={() => {}}
      />,
    )
    const image = screen.getByRole('img')
    expect(image.style.clipPath).toBe('')
    expect(screen.getByTestId('chat-image-crop-frame').style.left).toBe('10%')

    await userEvent.click(screen.getByRole('button', { name: 'Voir recadrée' }))
    expect(image.style.clipPath).toBe('inset(5% 10% 5% 10%)')
    expect(screen.getByRole('button', { name: 'Voir l’image entière' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('sans bords détectés : l’image reste entière, et l’aperçu le dit', () => {
    render(
      <AttachmentPreviewDialog
        id="ephemeral:1"
        name="capture.png"
        imageUrl="blob:capture"
        objects={{ documentBounds: null, table: null }}
        onOpenChange={() => {}}
      />,
    )
    expect(screen.getByText('Bords du document non détectés : l’image reste entière.')).toBeInTheDocument()
    expect(screen.queryByTestId('chat-image-crop-frame')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Voir recadrée' })).toBeNull()
  })

  it('rien mesuré : ni recadrage, ni « non détecté », ni tableau', () => {
    render(
      <AttachmentPreviewDialog id="ephemeral:1" name="capture.png" imageUrl="blob:capture" onOpenChange={() => {}} />,
    )
    expect(screen.queryByText('Bords du document non détectés : l’image reste entière.')).toBeNull()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('rend le tableau lu dans la grille existante — une case vide reste VIDE, jamais « 0 »', () => {
    render(
      <AttachmentPreviewDialog
        id="ephemeral:1"
        name="capture.png"
        imageUrl="blob:capture"
        objects={{ documentBounds: null, table }}
        onOpenChange={() => {}}
      />,
    )
    const grid = screen.getByRole('table')
    expect(grid).toHaveTextContent('Tech lead')
    const cells = Array.from(grid.querySelectorAll('tbody tr:nth-child(2) td')).map(cell => cell.textContent)
    expect(cells).toEqual(['Tech lead', ''])
    expect(grid).not.toHaveTextContent(/\b0\b/)
  })
})
