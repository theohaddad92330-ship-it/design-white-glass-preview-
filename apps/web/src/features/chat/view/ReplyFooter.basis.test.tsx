import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { ChatResponseContext } from './ContextDisclosure'

/**
 * #3765 / #3761.16 — le fondement d'une réponse (nature, périmètre, certitude), composé par les pièces de
 * reply-kit (`ReplyContextChips`, `ReplyMetaRow`) dans le panneau « Voir la source » du pied de réponse.
 *
 * #3764 / #3861 (Louis, 11/10) — et JAMAIS une ligne « Complétude », quelle que soit la situation.
 */

vi.mock('./SaveReply', () => ({ SaveReply: () => null }))
vi.mock('./ReplyFeedback', () => ({ ReplyFeedback: () => null }))

const { ReplyFooter } = await import('./ReplyFooter')
const { demoTurn } = await import('../api/demo-turn')
const { DEMO_CHAT_PROMPTS } = await import('@/features/demo/demo-chat-script')

function context(overrides: Partial<ChatResponseContext> = {}): ChatResponseContext {
  return {
    active: {
      profile: { present: false, name: null },
      account: { present: true, name: 'Acme' },
      contacts_count: 0,
      plan: { present: false },
      portfolio: { present: false, count: 0 },
      memory: { pinned_facts: 0, has_summary: false },
    },
    sources: [{ kind: 'crm', label: 'Dossier Acme', as_of: '2026-09-01T00:00:00Z', confidence: 'medium' }],
    not_consulted: ['HubSpot'],
    ...overrides,
  }
}

const renderFooter = (ctx: ChatResponseContext | undefined) =>
  renderWithRouter(<ReplyFooter context={ctx} text="Réponse." accountId={null} timestamp={null} />)

async function openDisclosure() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /^(Sources|Contexte)$/ }))
}

describe('ReplyFooter — le fondement de la réponse', () => {
  it("ne s'affiche pas tant que le panneau « Voir la source » n'est pas ouvert", () => {
    renderFooter(context())
    expect(screen.queryByTestId('reply-basis')).toBeNull()
  })

  it('nomme la nature, le périmètre et le palier de certitude une fois le panneau ouvert', async () => {
    renderFooter(context())
    await openDisclosure()
    const basis = screen.getByTestId('reply-basis')
    expect(basis).toHaveTextContent('Fondée sur')
    expect(basis).toHaveTextContent('Données de l’espace et connecteurs')
    expect(basis).toHaveTextContent('compte Acme')
    expect(basis).toHaveTextContent('Certitude')
    expect(basis).toHaveTextContent('moyenne')
    expect(basis.textContent).not.toMatch(/%/)
  })

  it('le périmètre est une chip de contexte (reply-kit), pas un texte ad hoc', async () => {
    renderFooter(context())
    await openDisclosure()
    const chips = screen.getByRole('list', { name: 'Périmètre de la réponse' })
    expect(chips).toHaveTextContent('compte Acme')
  })

  // #3764 gagne : la ligne « Complétude », sous toutes ses formes, n'existe plus.
  it.each([
    ['sources non consultées', context()],
    ['rien de non consulté', context({ not_consulted: [] })],
    ['plusieurs non consultées', context({ not_consulted: ['HubSpot', 'Réseaux professionnels non croisés'] })],
    ['tour partiel', context({ partial: { reason: 'turn_timeout' }, not_consulted: [] })],
  ])('jamais de « Complétude » ni d’« Incomplet » — %s', async (_name, ctx) => {
    renderFooter(ctx)
    await openDisclosure()
    expect(document.body.textContent).not.toMatch(/Complétude|Incomplet|Très partiel|Completeness/)
    expect(document.querySelector('[data-reply-badge^="completeness"]')).toBeNull()
  })

  it('le fait « sources non consultées » se dit UNE fois : le badge nommé porte les noms', async () => {
    // #4150 — `qualification_needed` (posé par context_transparency.py sur une action réelle
    // ou une panne) pilote le badge ; `not_consulted` reste la liste complète affichée dedans.
    renderFooter(
      context({ not_consulted: ['HubSpot', 'Réseaux professionnels non croisés'], qualification_needed: true }),
    )
    await openDisclosure()
    const badge = document.querySelector('[data-reply-badge="qualification_needed"]')
    expect(badge).toHaveTextContent(
      'Qualification complémentaire nécessaire : HubSpot · Réseaux professionnels non croisés',
    )
    expect(screen.getByTestId('reply-basis').textContent).not.toMatch(/HubSpot/)
  })

  // recette MZ 10/10 — le badge portant les noms était `nowrap` : une pilule qui porte une LISTE s'enroule.
  it('le badge qui porte des noms de sources s’enroule au lieu de déborder', async () => {
    renderFooter(
      context({ not_consulted: ['HubSpot', 'Réseaux professionnels non croisés'], qualification_needed: true }),
    )
    await openDisclosure()
    const classes = (document.querySelector('[data-reply-badge="qualification_needed"]')?.className ?? '').split(/\s+/)
    expect(classes).toContain('whitespace-normal')
    expect(classes).toContain('max-w-full')
  })

  // #4150 (recette prod 14/10) — le badge ne se fie plus à la longueur de `not_consulted`
  // (qui porte toujours des absences structurelles) mais à `qualification_needed` seul.
  it('#4150 — tout connecté (qualification_needed absent) : aucun bandeau, même avec des absences structurelles', async () => {
    renderFooter(
      context({ not_consulted: ['Réseaux professionnels non interrogés', "Signaux d'achat archivés non inclus"] }),
    )
    await openDisclosure()
    expect(document.querySelector('[data-reply-badge="qualification_needed"]')).toBeNull()
  })

  it('#4150 — aucun CRM connecté (qualification_needed posé) : le bandeau s’affiche', async () => {
    renderFooter(context({ not_consulted: ['Aucun CRM connecté'], qualification_needed: true }))
    await openDisclosure()
    expect(document.querySelector('[data-reply-badge="qualification_needed"]')).not.toBeNull()
  })

  it('sait dire NON : sans contexte, aucun fondement ni aucune pastille', () => {
    renderFooter(undefined)
    expect(screen.queryByTestId('reply-basis')).toBeNull()
  })

  it('nomme une fraîcheur inconnue plutôt que de la taire', async () => {
    renderFooter(context({ sources: [{ kind: 'crm', label: 'Dossier' }] }))
    await openDisclosure()
    expect(screen.getByTestId('reply-basis')).toHaveTextContent('Fraîcheur : source non datée')
  })

  it('est rempli en démo : le contexte des tours scriptés porte déjà son fondement', async () => {
    // L'amorce « signaux SNCF » (`p-signals`) a son propre fondement daté (#4069.4, test suivant) : on lit ici
    // une amorce de PORTEFEUILLE, la première qui n'est pas celle-là.
    const portfolioPrompt = DEMO_CHAT_PROMPTS.find(entry => entry.id !== 'p-signals' && !entry.sources?.length)
    const turn = demoTurn(portfolioPrompt?.question ?? '', 'fallback')
    renderFooter(turn?.context)
    await openDisclosure()
    const basis = screen.getByTestId('reply-basis')
    expect(basis).toHaveTextContent('Inférence Bellum')
    expect(basis).toHaveTextContent('6 comptes du portefeuille')
  })

  it('#4069.4 — l’amorce des signaux SNCF est fondée sur les faits datés qu’elle cite', async () => {
    const turn = demoTurn(DEMO_CHAT_PROMPTS.find(entry => entry.id === 'p-signals')?.question ?? '', 'fallback')
    renderFooter(turn?.context)
    await openDisclosure()
    expect(screen.getByTestId('reply-basis')).toHaveTextContent('juin 2026')
  })
})
