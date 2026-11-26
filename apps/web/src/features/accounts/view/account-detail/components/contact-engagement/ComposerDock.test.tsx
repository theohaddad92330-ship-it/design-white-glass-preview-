import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ComposerDock } from './ComposerDock'

vi.mock('./ApprovedTemplatePicker', () => ({ ApprovedTemplatePicker: () => null }))

/**
 * #3550.4 — recette prod 02/10 : le panneau est `overflow-hidden` à hauteur
 * fixe ; « Paramètres du message » déplié, le bas du composeur (donc le bouton
 * d'envoi) sortait de la fenêtre (y 1018 pour 805) sans défilement. La rangée
 * de paramètres défile EN INTERNE, le bouton d'envoi reste toujours posé.
 */
describe('ComposerDock — le bouton d’envoi reste dans la fenêtre', () => {
  it('#3550.4 : la rangée des paramètres a une hauteur bornée en dvh et défile en interne', () => {
    render(
      <ComposerDock
        channel="email"
        channels={['email']}
        contactId="c1"
        context=""
        hasObjections={false}
        objections={[]}
        showObjections={false}
        onChannelChange={vi.fn()}
        onContextChange={vi.fn()}
        onGenerate={vi.fn()}
        parameters={{}}
        onParametersChange={vi.fn()}
        onToggleObjections={vi.fn()}
        styleOptions={[]}
        styleTemplateId={null}
        onStyleTemplateIdChange={vi.fn()}
        onUseApprovedTemplate={vi.fn()}
      />,
    )
    const row = screen.getByRole('button', { name: /Paramètres du message/ }).closest('.overflow-y-auto') as HTMLElement
    expect(row, 'la rangée des paramètres défile en interne').not.toBeNull()
    expect(row.className).toMatch(/max-h-\[[^\]]*dvh[^\]]*\]/)
    expect(row.className).not.toMatch(/\bvh\b|\d+vh/)
  })
  it('#3696.7 : une seule section « Paramètres du message » dans le DOM', () => {
    render(
      <ComposerDock
        channel="email"
        channels={['email']}
        contactId="c1"
        context=""
        hasObjections={false}
        objections={[]}
        showObjections={false}
        onChannelChange={vi.fn()}
        onContextChange={vi.fn()}
        onGenerate={vi.fn()}
        parameters={{}}
        onParametersChange={vi.fn()}
        onToggleObjections={vi.fn()}
        styleOptions={[]}
        styleTemplateId={null}
        onStyleTemplateIdChange={vi.fn()}
        onUseApprovedTemplate={vi.fn()}
      />,
    )
    expect(screen.getAllByText(/Paramètres du message/)).toHaveLength(1)
  })

  it('#3694.4/.6 : le brief s’affiche au-dessus des paramètres, « Corriger » les déplie, toujours une seule section', async () => {
    render(
      <ComposerDock
        channel="email"
        channels={['email']}
        contactId="c1"
        context=""
        hasObjections={false}
        objections={[]}
        showObjections={false}
        onChannelChange={vi.fn()}
        onContextChange={vi.fn()}
        onGenerate={vi.fn()}
        parameters={{}}
        onParametersChange={vi.fn()}
        brief={{
          objective: 'relance',
          objectiveSource: 'relation',
          relationship: null,
          persona: null,
          formality: 'vous',
          formalitySource: 'defaut',
          cta: 'question_facile',
          ctaSource: 'objectif',
          missing: [],
        }}
        onToggleObjections={vi.fn()}
        styleOptions={[]}
        styleTemplateId={null}
        onStyleTemplateIdChange={vi.fn()}
        onUseApprovedTemplate={vi.fn()}
      />,
    )
    expect(screen.getByRole('region', { name: 'Brief du message' })).toHaveTextContent('Relancer')
    expect(screen.queryByLabelText('Objectif')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Corriger le brief' }))
    expect(screen.getByLabelText('Objectif')).toBeInTheDocument()
    expect(screen.getAllByText(/Paramètres du message/)).toHaveLength(1)
  })
})
