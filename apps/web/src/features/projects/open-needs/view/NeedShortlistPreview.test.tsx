import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Submission } from '@bellum/contracts'
import { NeedShortlistPreview } from './NeedShortlistPreview'

const sub = (id: string, name: string, needId: string) =>
  ({ id, needId, consultantName: name, stage: 'shortlisted' }) as unknown as Submission

// #4344.4 — aperçu de la shortlist : nombre + 3 premiers + lien ; jamais « 0 ».
describe('NeedShortlistPreview — #4344.4', () => {
  afterEach(cleanup)

  it('pas de shortlist → AUCUN aperçu (jamais « 0 »)', () => {
    const { container } = render(
      <NeedShortlistPreview needId="n1" items={[sub('1', 'Autre', 'n2')]} onOpen={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('le nombre, les 3 premiers et le lien vers la fiche du besoin', () => {
    const onOpen = vi.fn()
    const items = ['Ada', 'Bob', 'Cléo', 'Dan', 'Eve'].map((n, i) => sub(String(i), n, 'n1'))
    render(<NeedShortlistPreview needId="n1" items={items} onOpen={onOpen} />)
    expect(screen.getByText(/5/)).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('Cléo')).toBeInTheDocument()
    expect(screen.queryByText('Dan')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Voir la shortlist/ }))
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('sur la fiche du besoin (all), tous les noms sont visibles', () => {
    const items = ['Ada', 'Bob', 'Cléo', 'Dan'].map((n, i) => sub(String(i), n, 'n1'))
    render(<NeedShortlistPreview needId="n1" items={items} all />)
    expect(screen.getByText('Dan')).toBeInTheDocument()
  })
})
