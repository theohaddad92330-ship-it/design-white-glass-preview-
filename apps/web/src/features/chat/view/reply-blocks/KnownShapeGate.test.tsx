import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { replyTransformsFor } from '@bellum/contracts'
import { DEMO_CHAT_PROMPTS } from '@/features/demo/demo-chat-script'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import { StructuredReply } from '../StructuredReply'
import { extractReplyAside } from '../reply-aside'
import { ReplyFamilyRetry } from './ReplyFamilyRetry'

/**
 * Lot L1 07/10 — #3707 / #3762 / #3767 / #3771 / #3764 : la réponse que la porte de forme
 * (`apps/ia/app/services/known_shape_gate.py`) fait PARTIR se rend en CARTE, pas en texte,
 * et le bandeau « restée en texte » se tait quand la carte est là.
 *
 * Le texte ci-dessous a la forme exacte de la sortie de la porte (chapeau du modèle + clôture
 * `bellum-block`), même jeu que `test_l1_known_shape_gate.py::test_3771_…`.
 */
const fence = (block: unknown) => ['```bellum-block', JSON.stringify(block), '```'].join('\n')

const gateReply = (count: number) =>
  `J’ai classé les ${count} premiers comptes.\n\n` +
  fence({
    type: 'account_ranking',
    title: 'Priorités du portefeuille',
    axes: ['Catégorie de la règle du portefeuille'],
    items: Array.from({ length: count }, (_, index) => ({
      name: index < 3 ? `Prioritaire ${index}` : `Surveillé ${index}`,
      level: index < 3 ? 'priority' : 'to_watch',
      why: [index < 3 ? 'Signal daté de la semaine.' : 'Sans mouvement récent.'],
    })),
    not_evaluated: ['1 comptes classés « pas maintenant » ne sont pas listés ici.'],
  })

describe('lot L1 — la carte de la porte se rend en carte', () => {
  it('« Classe-moi huit comptes » : une carte de classement, huit lignes, leurs niveaux, la note « n’établit pas »', async () => {
    await i18n.changeLanguage('fr')
    const { container } = renderWithRouter(<StructuredReply text={gateReply(8)} />)
    const card = await screen.findByRole('group', { name: 'Priorités du portefeuille' })
    // Les trois premiers d'abord, les cinq autres derrière un geste nommé (même règle que toute carte de rang).
    fireEvent.click(within(card).getByRole('button', { expanded: false }))
    expect(within(card).getAllByText(/^(Prioritaire|Surveillé) \d$/)).toHaveLength(8)
    // #3764 — les niveaux dérivés par le serveur sont des badges, pas du texte libre.
    expect(container.querySelectorAll('[data-reply-badge="priority"]')).toHaveLength(3)
    expect(container.querySelectorAll('[data-reply-badge="to_watch"]')).toHaveLength(5)
    // Le chapeau reste, la syntaxe de la clôture ne s'affiche jamais.
    expect(screen.getByText(/J’ai classé les 8 premiers comptes\./)).toBeInTheDocument()
    expect(container.textContent).not.toContain('bellum-block')
    expect(container.textContent).not.toContain('"type"')
    // #5044 — huit lignes sans source datée : le constat n'est plus sous la carte, il est dans le panneau Sources.
    expect(screen.queryByRole('complementary', { name: 'Ce que cette réponse n’établit pas' })).toBeNull()
    expect(extractReplyAside(gateReply(8)).substance).not.toHaveLength(0)
  })

  it('un compte sans niveau ne reçoit aucun badge — rien n’est deviné', async () => {
    const reply = fence({ type: 'account_ranking', axes: ['Signal'], items: [{ name: 'Alpha', why: ['Raison.'] }] })
    const { container } = renderWithRouter(<StructuredReply text={reply} />)
    await screen.findByText('Alpha')
    expect(container.querySelector('[data-reply-badge]')).toBeNull()
  })
})

describe('lot L1 — le bandeau « restée en texte » se tait quand la carte est là', () => {
  const fallback = { family: 'account_ranking' as const, outcome: 'text_fallback' as const }

  it('carte acceptée par la famille dans la réponse : aucun bandeau, même si le contexte dit « text_fallback »', async () => {
    await i18n.changeLanguage('fr')
    const { container } = renderWithRouter(
      <ReplyFamilyRetry family={fallback} content={gateReply(8)} onRetry={() => undefined} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('absence NOMMÉE (missing_data) : aucun bandeau — la relancer en carte n’aurait rien à montrer', () => {
    const absence = fence({
      type: 'missing_data',
      missing: [{ what: 'Comptes : la recherche a répondu sans résultat.', how: 'Élargis les critères.' }],
    })
    const { container } = renderWithRouter(
      <ReplyFamilyRetry family={fallback} content={absence} onRetry={() => undefined} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('SAIT DIRE NON — texte seul, ou carte d’une autre forme : le bandeau reste', async () => {
    await i18n.changeLanguage('fr')
    const other = fence({ type: 'contact_list', items: [{ name: 'Jeanne' }] })
    renderWithRouter(
      <ReplyFamilyRetry family={fallback} content={`Huit comptes.\n\n${other}`} onRetry={() => undefined} />,
    )
    expect(await screen.findByRole('button', { name: 'Refaire en carte' })).toBeInTheDocument()
  })
})

describe('lot L1 — parité démo (craft rule 9)', () => {
  const answerOf = (id: string) => DEMO_CHAT_PROMPTS.find(prompt => prompt.id === id)?.answer ?? ''

  it('« Par où je commence dans mon portefeuille ? » : la même carte qu’en prod, niveaux compris', async () => {
    await i18n.changeLanguage('fr')
    const { container } = renderWithRouter(<StructuredReply text={answerOf('p-priorities')} />)
    await screen.findByRole('group', { name: 'Par où commencer' })
    expect(container.querySelectorAll('[data-reply-badge="priority"]').length).toBeGreaterThan(0)
  })

  it('#3768 — sous cette réponse, « Retravailler » propose les priorités et plus de comptes', () => {
    const ids = replyTransformsFor(answerOf('p-priorities'))
    expect(ids).toContain('priorities_only')
    expect(ids).toContain('more_accounts')
  })

  it('cartographie et tour d’horizon de la salle sortent déjà en carte de leur forme', () => {
    expect(answerOf('p-account-map')).toContain('"type":"account_map"')
    expect(answerOf('p-market-sweep')).toContain('"type":"account_ranking"')
  })
})
