import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithRouter } from '@/test-utils/renderWithRouter'
import type { ChatResponseContext } from './ContextDisclosure'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// `SaveReply` porte son propre réseau (`usePinFact` → React Query). Le pied de
// réponse n'est pas ce que CE fichier garde : on le remplace par un témoin nul
// pour ne pas monter de `QueryClientProvider` juste pour un bouton voisin.
vi.mock('./SaveReply', () => ({ SaveReply: () => <button type="button">Enregistrer (témoin)</button> }))
// #1919 — le geste de retour a sa propre suite (`ReplyFeedback.test.tsx`) et son
// propre réseau ; ici on vérifie seulement que le pied le MONTE.
vi.mock('./ReplyFeedback', () => ({ ReplyFeedback: () => <span data-testid="reply-feedback" /> }))

/**
 * ⚠️ Le type de l'argument est DÉCLARÉ, il ne se devine pas — même piège que
 * documenté dans `ShareConversation.test.tsx` (TS2493 au `tsc`, invisible en
 * vitest).
 */
function clipboardSpy(impl?: (text: string) => Promise<void>) {
  const writeText = vi.fn<(text: string) => Promise<void>>(impl ?? (() => Promise.resolve()))
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

const { ReplyFooter } = await import('./ReplyFooter')
const { ReplyTransformProvider } = await import('./reply-transform-context')

const baseContext = {
  active: {
    profile: { present: true, name: null },
    account: { present: true, name: 'LATÉCOÈRE', as_of: null },
    contacts_count: 0,
    plan: { present: false },
    portfolio: { present: false, count: 0 },
    memory: { pinned_facts: 0, has_summary: false },
  },
  sources: [],
  not_consulted: [],
} as unknown as ChatResponseContext

describe('ReplyFooter — #1953.4 copier la réponse', () => {
  beforeEach(() => vi.clearAllMocks())

  it('copie le texte BRUT de la réponse, et le dit par un toast', async () => {
    const writeText = clipboardSpy()
    const { toast } = await import('sonner')
    render(<ReplyFooter context={undefined} text="Voici la réponse de Laura." accountId={null} timestamp={null} />)
    await userEvent.click(screen.getByRole('button', { name: /copier/i }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Voici la réponse de Laura.'))
    expect(toast.success).toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('sait dire NON — un presse-papier refusé ne prétend PAS avoir copié', async () => {
    clipboardSpy(() => Promise.reject(new Error('denied')))
    const { toast } = await import('sonner')
    render(<ReplyFooter context={undefined} text="Une réponse." accountId={null} timestamp={null} />)
    await userEvent.click(screen.getByRole('button', { name: /copier/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('aucun bouton copier sur une réponse SANS texte', () => {
    render(<ReplyFooter context={undefined} text="" accountId={null} timestamp={null} />)
    expect(screen.queryByRole('button', { name: /copier/i })).not.toBeInTheDocument()
  })
})

// #3876 (VU EN PASSANT, lot V09 08/10, recette prod) — « Source du 22
// septembre » affichée sous une réponse du 08/10 se lisait comme la date DE
// LA SOURCE (la page lue, consultée aujourd'hui), jamais comme celle du FAIT
// qu'elle rapporte. Le libellé doit nommer ce qu'il date : la DONNÉE.
describe('ReplyFooter — #3876 la fraîcheur nomme la donnée, jamais « la source »', () => {
  it('affiche « Donnée du … », jamais « Source du … »', async () => {
    const context = {
      ...baseContext,
      active: { ...baseContext.active, account: { ...baseContext.active.account, as_of: '2026-09-22T00:00:00Z' } },
    } as unknown as ChatResponseContext
    renderWithRouter(
      <ReplyFooter context={context} text="Réponse." accountId={null} timestamp={new Date('2026-10-08')} />,
    )
    await screen.findByRole('button', { name: /^(Sources|Contexte)$/ })
    // #5032.7 — la fraîcheur vit DANS le panneau Sources, plus dans la ligne.
    expect(screen.queryByText(/Donnée du/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^(Sources|Contexte)$/ }))
    expect(await screen.findByText(/Donnée du/)).toBeInTheDocument()
    expect(screen.queryByText(/^Source du/)).not.toBeInTheDocument()
  })
})

describe('ReplyFooter — #1919 le geste de retour vit dans le pied de réponse', () => {
  it('le pied monte le geste de retour sous une réponse qui a un texte', () => {
    render(<ReplyFooter context={undefined} text="Voici la réponse." accountId={null} timestamp={null} />)
    expect(screen.getByTestId('reply-feedback')).toBeInTheDocument()
  })

  it('une réponse vide n’a rien à noter — aucun geste de retour', () => {
    render(<ReplyFooter context={undefined} text="  " accountId={null} timestamp={null} />)
    expect(screen.queryByTestId('reply-feedback')).not.toBeInTheDocument()
  })
})

describe('ReplyFooter — #1915.2 la ligne compacte compte les sources', () => {
  it('un VRAI compte (≥ 1) apparaît dans le panneau Sources, plus dans la ligne (#5032.7)', async () => {
    const context = { ...baseContext, sources: [{ kind: 'crm', label: 'CRM', as_of: null }] } as ChatResponseContext
    renderWithRouter(<ReplyFooter context={context} text="Réponse." accountId={null} timestamp={null} />)
    await userEvent.click(await screen.findByRole('button', { name: /^(Sources|Contexte)$/ }))
    expect(await screen.findByText('1 source')).toBeInTheDocument()
  })

  it('plusieurs sources : le pluriel', async () => {
    const context = {
      ...baseContext,
      sources: [
        { kind: 'crm', label: 'CRM', as_of: null },
        { kind: 'account_dossier', label: 'Dossier', as_of: null },
        { kind: 'account_dossier', label: 'Dossier 2', as_of: null },
      ],
    } as ChatResponseContext
    renderWithRouter(<ReplyFooter context={context} text="Réponse." accountId={null} timestamp={null} />)
    await userEvent.click(await screen.findByRole('button', { name: /^(Sources|Contexte)$/ }))
    expect(await screen.findByText('3 sources')).toBeInTheDocument()
  })

  it('« non mesuré » n’est jamais « 0 » — une liste VIDE n’affiche RIEN, pas « 0 source »', () => {
    // `sources: []` EST une mesure (0 sources citées) mais l'issue #1915.2 est
    // explicite : le compte ne s'affiche que connu ET ≥ 1. Un « 0 source »
    // dans une ligne aussi dense se lirait comme une panne de plus.
    render(<ReplyFooter context={baseContext} text="Réponse." accountId={null} timestamp={null} />)
    expect(screen.queryByText(/0 source/)).not.toBeInTheDocument()
  })

  it('une réponse relue depuis l’historique (pas de contexte) n’affiche RIEN', () => {
    render(<ReplyFooter context={undefined} text="Réponse." accountId={null} timestamp={null} />)
    expect(screen.queryByText(/source/)).not.toBeInTheDocument()
  })

  it('aucun score de confiance — jamais de pourcentage ni de mot "confiance"', () => {
    const context = { ...baseContext, sources: [{ kind: 'crm', label: 'CRM', as_of: null }] } as ChatResponseContext
    render(<ReplyFooter context={context} text="Réponse." accountId={null} timestamp={null} />)
    const texte = document.body.textContent ?? ''
    expect(texte).not.toMatch(/%/)
    expect(texte.toLowerCase()).not.toContain('confiance')
  })
})

describe('ReplyFooter — #3356.1 (LAU-UI-308) le badge « X données manquantes » ne se montre plus nu', () => {
  // Louis, 29/09/2026 (issue #3356) : le badge ne disait ni quelles données
  // manquent, ni l'impact, ni l'action — un compteur seul, dans une ligne déjà
  // dense. Le détail NOMMÉ (`not_consulted`) existe déjà et reste lisible dans
  // le panneau derrière « Voir la source » (`ContextDisclosure`, inchangé) :
  // tranché sans Louis — option 1 de l'issue (retirer le badge ambigu) plutôt
  // que l'option 2, puisque le nommé qu'elle demanderait est déjà servi
  // ailleurs sur la même ligne, à un clic.
  it('un contexte avec des éléments NON CONSULTÉS n’affiche plus de badge nu sur la ligne compacte', () => {
    const context = { ...baseContext, not_consulted: ['Site web', 'LinkedIn'] } as ChatResponseContext
    render(<ReplyFooter context={context} text="Réponse." accountId={null} timestamp={null} />)
    expect(screen.queryByText(/donnée[s]? manquante/i)).not.toBeInTheDocument()
  })

  it('le détail NOMMÉ reste accessible derrière « Sources », rien n’est perdu', async () => {
    const context = { ...baseContext, not_consulted: ['Site web'] } as ChatResponseContext
    renderWithRouter(<ReplyFooter context={context} text="Réponse." accountId={null} timestamp={null} />)
    await userEvent.click(await screen.findByRole('button', { name: /^(Sources|Contexte)$/ }))
    expect(await screen.findByText('Site web')).toBeInTheDocument()
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// #5032 — LE PIED V8 : une rangée invisible au repos, cinq contrôles, un panneau Sources qui porte le reste.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
describe('ReplyFooter — #5032 la rangée du pied', () => {
  const withSources = {
    ...baseContext,
    sources: [{ kind: 'crm', label: 'CRM', as_of: null }],
    not_consulted: ['Site web'],
    qualification_needed: true,
  } as unknown as ChatResponseContext

  function renderRow(over: Partial<React.ComponentProps<typeof ReplyFooter>> = {}) {
    return render(
      <ReplyTransformProvider value={{ onTransform: vi.fn(), disabled: false }}>
        <ReplyFooter
          context={withSources}
          text="Voici la réponse."
          accountId={null}
          timestamp={new Date('2026-10-31T14:32:00')}
          onRetry={() => {}}
          onEditLastMessage={() => {}}
          onAlternativeAngle={() => {}}
          {...over}
        />
      </ReplyTransformProvider>,
    )
  }

  it('#5032.1 — la rangée est invisible au repos et se montre au survol, au focus ou menu ouvert', () => {
    renderRow()
    const row = screen.getByTestId('reply-footer-row')
    expect(row).toHaveClass('opacity-0')
    expect(row.className).toContain('group-hover/reply:opacity-100')
    expect(row.className).toContain('focus-within:opacity-100')
    expect(row.className).toContain('has-[[aria-expanded=true]]:opacity-100')
  })

  it('#5032.1 — cinq contrôles, dans l’ordre : Sources · Copier · Enregistrer · Ajuster · ⋯, tous nommés et tabulables', () => {
    renderRow({ source: 'Voici la réponse.' })
    const names = within(screen.getByTestId('reply-footer-row'))
      .getAllByRole('button')
      .map(button => button.getAttribute('aria-label') ?? button.textContent?.trim())
    expect(names).toEqual([
      'Sources',
      'Copier la réponse',
      'Enregistrer (témoin)',
      'Ajuster cette réponse',
      'Plus d’actions sur cette réponse',
    ])
    for (const button of within(screen.getByTestId('reply-footer-row')).getAllByRole('button')) {
      expect(button).not.toHaveAttribute('tabindex', '-1')
    }
  })

  it('#5032.6 — « Contexte » quand aucune source n’est citée', () => {
    renderRow({ context: baseContext })
    expect(screen.getByRole('button', { name: 'Contexte' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sources' })).toBeNull()
  })

  it('#5032.3 / .4 / .5 — ni l’heure, ni « Commentaires », ni « Écouter »', () => {
    renderRow()
    const row = screen.getByTestId('reply-footer-row')
    expect(row.textContent).not.toMatch(/\d{2}:\d{2}/)
    expect(screen.queryByRole('button', { name: /commentaire/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /écouter/i })).toBeNull()
  })

  it('#5032.7 / .8 / .17 — fraîcheur, nombre de sources et badges ne sont QUE dans le panneau, qui garde son contenu', async () => {
    const context = {
      ...withSources,
      active: { ...baseContext.active, account: { ...baseContext.active.account, as_of: '2026-09-22T00:00:00Z' } },
    } as unknown as ChatResponseContext
    renderWithRouter(<ReplyFooter context={context} text="Voici la réponse." accountId={null} timestamp={null} />)
    await screen.findByRole('button', { name: 'Sources' })
    expect(screen.queryByText(/Donnée du/)).toBeNull()
    expect(screen.queryByText('1 source')).toBeNull()
    expect(screen.queryByText('Site web')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Sources' }))
    expect(await screen.findByText(/Donnée du/)).toBeInTheDocument()
    expect(screen.getByText('1 source')).toBeInTheDocument()
    // Le détail nommé (`ContextDisclosure`) et le fondement (`ReplyBasis`) sont toujours là.
    expect(await screen.findByText('Site web')).toBeInTheDocument()
  })

  it('#5032.15 — ⋯ ouvre Signaler un problème (retour sur la réponse), Réessayer, Modifier ma demande, Autre angle', async () => {
    renderRow()
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions sur cette réponse' }))
    for (const name of [/Réessayer/, /Modifier ma demande/, /autre angle/i, /Signaler un problème/]) {
      expect(await screen.findByRole('menuitem', { name })).toBeInTheDocument()
    }
    await userEvent.click(screen.getByRole('menuitem', { name: /Signaler un problème/ }))
    // Le panneau de retour est piloté par le pied ; l’icône de ReplyFeedback n’est plus dans la rangée.
    expect(screen.getByTestId('reply-footer-row')).toHaveClass('opacity-100')
  })

  it('#5032.15 — « Exporter » n’est offert que pour une réponse à cartes', async () => {
    const plan = { type: 'action_plan', title: 'Plan', steps: [{ label: 'Qualifier', when: 'Cette semaine' }] }
    const withBlock = ['Voici le plan.', '```bellum-block', JSON.stringify(plan), '```'].join('\n')
    renderRow({ source: withBlock })
    await userEvent.click(screen.getByRole('button', { name: 'Plus d’actions sur cette réponse' }))
    expect(await screen.findByRole('menuitem', { name: 'Copier en version structurée' })).toBeInTheDocument()
  })

  it('#5032.2 — mobile : visible sous la dernière réponse (revealed), masquée sinon — voir ReplyFooter.mobile.test', () => {
    renderRow({ revealed: false })
    // Sur grand écran `revealed` ne change rien : c’est le survol qui montre la rangée.
    expect(screen.getByTestId('reply-footer-row')).toHaveClass('opacity-0')
  })

  // #5032.12 / .13 — UN chemin vers le moteur d'approfondissement : Ajuster, ou le CTA de qualification.
  const ACCOUNT = '11111111-1111-4111-8111-111111111111'

  it('#5032.12 — Ajuster › « Approfondir (avec devis) » ouvre le flux de DeepenActions', async () => {
    renderRow({ accountId: ACCOUNT, timestamp: null })
    expect(screen.queryByRole('group', { name: /approfondir/i })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Ajuster cette réponse' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Approfondir (avec devis)' }))
    expect(await screen.findByRole('group', { name: /approfondir/i })).toBeInTheDocument()
  })

  it('#5032.13 — « Lancer une qualification complémentaire » (deepenRequest) ouvre ce même flux', () => {
    renderRow({ accountId: ACCOUNT, timestamp: null, deepenRequest: 1 })
    expect(screen.getByRole('group', { name: /approfondir/i })).toBeInTheDocument()
  })

  it('#5032.12 — sans compte visé, aucune entrée « Approfondir (avec devis) »', async () => {
    renderRow({ accountId: null })
    await userEvent.click(screen.getByRole('button', { name: 'Ajuster cette réponse' }))
    expect(screen.queryByRole('menuitem', { name: 'Approfondir (avec devis)' })).toBeNull()
  })
})
