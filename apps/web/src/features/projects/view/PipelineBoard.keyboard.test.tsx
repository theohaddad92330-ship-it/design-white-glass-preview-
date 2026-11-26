import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { PipelineSummary, ProjectReadRow } from '@bellum/contracts'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#">{children}</a>,
}))
vi.mock('@/components/primitives/AskLaura', () => ({ AskLaura: () => null }))
// Le vrai panneau lit les motifs de perte (react-query) : ici seul compte QUELLE étape il reçoit.
vi.mock('./StageMovePanel', () => ({
  StageMovePanel: ({ target }: { target: string }) => <p>Panneau d’effet → {target}</p>,
}))

const { PipelineBoard } = await import('./PipelineBoard')

/**
 * #4339.1 — recette production : glisser « Data office » de Qualifié vers Besoin exprimé n'avait rien déplacé, ni à
 * la souris ni au clavier (seul le capteur pointeur était câblé, sur une poignée de 14 px). Le clavier déplace
 * désormais : Espace saisit, → saute à la colonne voisine, Espace dépose et le panneau d'effet s'ouvre.
 * Les rectangles sont simulés (le DOM de test ne mesure rien) : colonne 1 = Qualifié, colonne 2 = Besoin exprimé.
 */
const rectOf = (left: number): DOMRect =>
  ({
    left,
    top: 0,
    right: left + 200,
    bottom: 400,
    width: 200,
    height: 400,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }) as DOMRect

const summary = {
  columns: [
    { stage: 'qualified', label: 'Qualifié', count: 1, amount_cents: 0, without_amount: 0, without_next_action: 0 },
    {
      stage: 'confirmed',
      label: 'Besoin exprimé',
      count: 0,
      amount_cents: 0,
      without_amount: 0,
      without_next_action: 0,
    },
  ],
  total_amount_cents: 0,
  total_count: 1,
  total_without_amount: 0,
  intake: 0,
  signals: 0,
} as unknown as PipelineSummary

const card = {
  id: 'p-1',
  account_id: 'a-1',
  company_name: 'ACME',
  kind: 'pain',
  label: 'Data office — renfort en ingénierie des données',
  source: 'pain',
  confidence: 'high',
  stage: 'qualified',
  stage_entered_at: new Date().toISOString(),
  first_detected_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  amount_cents: 1000,
} as unknown as ProjectReadRow

beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.scrollIntoView ??= () => {}
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function stubRects() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const text = this.textContent ?? ''
    // la carte (contient le libellé, pas d'en-tête de colonne) ; sinon colonne par ordre d'apparition
    if (this.getAttribute('aria-roledescription') === 'draggable') return rectOf(0)
    const column = this.className?.toString().includes('min-h-40') ? this : null
    if (column) {
      const columns = Array.from(document.querySelectorAll('[class*="min-h-40"]'))
      return rectOf(columns.indexOf(column) * 220)
    }
    return text.includes('Data office') ? rectOf(0) : rectOf(0)
  })
}

describe('PipelineBoard — déplacer une affaire au clavier', () => {
  it('Espace, →, Espace sur la poignée ouvre le panneau d’effet vers « Besoin exprimé »', async () => {
    stubRects()
    const onMove = vi.fn()
    render(<PipelineBoard summary={summary} projects={[card]} onSelect={() => {}} onMove={onMove} />)
    const handle = screen.getByRole('button', { name: 'Glisser cette carte vers une autre étape' })
    handle.focus()
    await act(async () => {
      fireEvent.keyDown(handle, { code: 'Space', key: ' ' })
      // dnd-kit n'écoute le clavier qu'au tick suivant la saisie.
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    await act(async () => {
      fireEvent.keyDown(document, { code: 'ArrowRight', key: 'ArrowRight' })
      await new Promise(resolve => setTimeout(resolve, 20))
    })
    await act(async () => {
      fireEvent.keyDown(document, { code: 'Space', key: ' ' })
    })
    expect(await screen.findByText('Panneau d’effet → confirmed')).toBeInTheDocument()
  })

  it('sait dire NON : sans geste, aucun panneau', () => {
    stubRects()
    render(<PipelineBoard summary={summary} projects={[card]} onSelect={() => {}} />)
    expect(screen.queryByText(/Panneau d’effet/)).toBeNull()
  })
})
