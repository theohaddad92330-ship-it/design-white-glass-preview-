import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { AnalysisAttachment } from '../hooks/useAnalysisAttachments'
import { AnalysisAttachmentsStrip } from './AnalysisAttachmentsStrip'

describe('#3808 — AnalysisAttachmentsStrip', () => {
  it('ne pose plus la phrase descriptive sous le dépôt de documents', () => {
    const { container } = render(
      <AnalysisAttachmentsStrip entries={[]} refusals={[]} demo={false} accountName="Accor" onRemove={() => {}} />,
    )
    expect(screen.queryByText(/base documentaire/i)).toBeNull()
    expect(container.querySelector('p')).toBeNull()
  })

  it('#3623.1c — une pièce rattachée NOMME le compte, jamais « ce compte »', () => {
    const entry: AnalysisAttachment = {
      key: '1:recherches.csv',
      file: new File(['x'], 'recherches.csv'),
      kind: 'text',
      phase: 'done',
      newDocumentIds: ['doc-1'],
      readCount: 1,
      bound: true,
    }
    render(
      <AnalysisAttachmentsStrip entries={[entry]} refusals={[]} demo={false} accountName="Accor" onRemove={() => {}} />,
    )
    expect(screen.getByText(/Rattachée à Accor/)).toBeInTheDocument()
  })

  // #4294.1 — chaque pièce de l'archive est nommée avec son sort ; la pièce en échec dit pourquoi.
  it('#4294.1 — nomme chaque pièce d’une archive avec son sort, la pièce en échec dit pourquoi', () => {
    const entry: AnalysisAttachment = {
      key: '1:pack.zip',
      file: new File(['x'], 'pack.zip'),
      kind: 'zip',
      phase: 'done',
      newDocumentIds: ['doc-1'],
      readCount: 1,
      bound: true,
      pieces: [
        { name: 'bon.pdf', fate: 'read' },
        { name: 'faux.pdf', fate: 'failed', reason: 'ce fichier n’est pas un PDF' },
      ],
    }
    render(
      <AnalysisAttachmentsStrip entries={[entry]} refusals={[]} demo={false} accountName="Accor" onRemove={() => {}} />,
    )
    const list = screen.getByRole('list', { name: 'Pièces de pack.zip' })
    expect(list).toHaveTextContent('bon.pdf')
    expect(list).toHaveTextContent('Lue')
    expect(list).toHaveTextContent('faux.pdf')
    expect(list).toHaveTextContent('Non lue — ce fichier n’est pas un PDF')
  })

  it('#4294.1 — avant envoi, les pièces sont nommées « en attente d’envoi » ; sans pièce, aucune liste', () => {
    const base: AnalysisAttachment = {
      key: '1:pack.zip',
      file: new File(['x'], 'pack.zip'),
      kind: 'zip',
      phase: 'ready',
      newDocumentIds: [],
      readCount: 0,
      bound: false,
    }
    const { rerender } = render(
      <AnalysisAttachmentsStrip
        entries={[{ ...base, pieces: [{ name: 'bon.pdf', fate: 'pending' }] }]}
        refusals={[]}
        demo={false}
        accountName="Accor"
        onRemove={() => {}}
      />,
    )
    expect(screen.getByRole('list', { name: 'Pièces de pack.zip' })).toHaveTextContent('En attente d’envoi')
    rerender(
      <AnalysisAttachmentsStrip entries={[base]} refusals={[]} demo={false} accountName="Accor" onRemove={() => {}} />,
    )
    expect(screen.queryByRole('list', { name: 'Pièces de pack.zip' })).toBeNull()
  })
})
