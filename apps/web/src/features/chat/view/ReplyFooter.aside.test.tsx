import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { extractReplyAside } from './reply-aside'

vi.mock('./SaveReply', () => ({ SaveReply: () => null }))
vi.mock('./ReplyFeedback', () => ({ ReplyFeedback: () => null }))

const { ReplyFooter } = await import('./ReplyFooter')
const { ReplyTransformProvider } = await import('./reply-transform-context')

const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')
const ranking = (count: number, sourced: number) => ({
  type: 'account_ranking',
  title: 'Par où commencer',
  axes: ['Signal daté'],
  items: Array.from({ length: count }, (_, index) => ({
    name: `Compte ${index + 1}`,
    why: ['Raison écrite.'],
    ...(index < sourced ? { source: { label: 'Registre', as_of: '2026-09' } } : {}),
  })),
})

function renderFooter(source: string, notes?: string[]) {
  return render(
    <ReplyTransformProvider value={{ onTransform: vi.fn(), disabled: false }}>
      <ReplyFooter
        context={undefined}
        text="Réponse."
        source={source}
        aside={extractReplyAside(source, notes)}
        accountId={null}
        timestamp={null}
      />
    </ReplyTransformProvider>,
  )
}

// #5044 — le panneau Sources porte ce que le corps ne montre plus.
describe('ReplyFooter — panneau Sources (#5044)', () => {
  const REPLY = [
    '## Verdict\nGo.',
    '## Pourquoi\nRaison courte.\n\nPreuve détaillée.',
    '## Sources\nAnnonce publique du 12/09.',
    '## Limites de cette analyse\nPérimètre réduit.',
  ].join('\n\n')

  it('sans context : le bouton Sources existe dès qu’une section est sortie, et le panneau la montre sous son intertitre', async () => {
    renderFooter(REPLY)
    expect(screen.queryByText('Annonce publique du 12/09.')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Sources' }))
    const panel = screen.getByTestId('reply-aside')
    expect(within(panel).getByText('Pourquoi')).toBeInTheDocument()
    expect(within(panel).getByText('Preuve détaillée.')).toBeInTheDocument()
    expect(within(panel).getByText('Sources citées par Laura')).toBeInTheDocument()
    expect(within(panel).getByText('Annonce publique du 12/09.')).toBeInTheDocument()
    expect(within(panel).getByText('Limites de cette analyse', { selector: 'span, p, div' })).toBeInTheDocument()
    expect(within(panel).getByText('Périmètre réduit.')).toBeInTheDocument()
  })

  it('sans rien à porter : pas de bouton Sources (le test sait dire NON)', () => {
    renderFooter('## Verdict\nGo.\n\n## Pourquoi\nUne raison.')
    expect(screen.queryByRole('button', { name: /Sources|Contexte/ })).toBeNull()
  })

  it('note de substance : pastille d’alerte + nom accessible, rangée visible au repos, note EN TÊTE du panneau', async () => {
    renderFooter(fence(ranking(8, 2)))
    const row = screen.getByTestId('reply-footer-row')
    expect(row).not.toHaveClass('opacity-0')
    const button = screen.getByRole('button', { name: 'Sources — réponse partielle à vérifier' })
    expect(within(button).getByTestId('sources-alert-dot')).toBeInTheDocument()
    // les autres contrôles restent cachés au repos
    expect(screen.getByRole('button', { name: 'Copier la réponse' }).closest('div.opacity-0')).not.toBeNull()
    await userEvent.click(button)
    const note = await screen.findByRole('complementary', { name: 'Ce que cette réponse n’établit pas' })
    expect(within(note).getByText(/2 lignes sur 8 portent une source datée/)).toBeInTheDocument()
  })

  it('une réponse étayée : ni pastille, ni rangée forcée (le test sait dire NON)', () => {
    renderFooter(fence(ranking(3, 3)))
    expect(screen.queryByTestId('sources-alert-dot')).toBeNull()
    expect(screen.getByTestId('reply-footer-row')).toHaveClass('opacity-0')
  })
})

// #5086 — les deux notes sorties du corps se lisent dans le panneau Sources.
describe('ReplyFooter — notes de la réponse dans le panneau Sources (#5086)', () => {
  const NOTES = ['Contrainte retenue : volume attendu « 5 comptes ».', 'Précision : je n’ai rien envoyé.']

  it('sans context : le bouton Sources existe et le panneau montre chaque note', async () => {
    renderFooter('Voici cinq comptes.', NOTES)
    expect(screen.queryByText(NOTES[0])).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Sources' }))
    const panel = screen.getByTestId('reply-aside')
    expect(within(panel).getByText(NOTES[0])).toBeInTheDocument()
    expect(within(panel).getByText(NOTES[1])).toBeInTheDocument()
  })

  it('sans note : pas de liste de notes', async () => {
    renderFooter('## Verdict\nGo.\n\n## Sources\nAnnonce du 12/09.')
    await userEvent.click(screen.getByRole('button', { name: 'Sources' }))
    expect(screen.queryByTestId('reply-notes')).toBeNull()
  })
})
