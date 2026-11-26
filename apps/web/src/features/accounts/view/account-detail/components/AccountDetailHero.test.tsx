import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Account, Contact } from '@bellum/contracts'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #4507 — L'EN-TÊTE DU DOSSIER AU DESSIN V22 (contrat validé par Louis le 23/10/2026).
 *
 * Ce que cette suite garde, et qu'elle sait refuser :
 *  1. la barre : « ← Portefeuille » à gauche ; à droite, épingle · Actualiser · « … » — et UN SEUL bouton
 *     plein visible dans tout l'en-tête ;
 *  2. l'identité : sur-titre, nom, UNE ligne ville · effectif · statut · responsable ; responsable absent =
 *     aucun élément (ni « Propriétaire non renseigné », ni avatar vide) ;
 *  3. « Dossier consultable · date · Périmètre & données », et le panneau qui porte statut d'analyse, SIREN,
 *     siège, verdicts ;
 *  4. « … » porte tout le reste, et les gestes d'équipe y fonctionnent comme avant, AVEC leurs portes ;
 *  5. ce qui a quitté l'en-tête n'y est plus (rangée de puces, rangée de fraîcheur, porte, Laura en clair).
 */

const { assignMutate, validationMutate, team, tracker } = vi.hoisted(() => ({
  assignMutate: vi.fn(),
  validationMutate: vi.fn(),
  team: vi.fn(),
  tracker: { trackActionStarted: vi.fn() },
}))
vi.mock('@/lib/product-tracker', () => tracker)
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({
  useWorkspaceMembers: () => ({
    data: [
      { userId: 'u-sarah', fullName: 'Sarah Martin', email: 'sarah@esn.fr' },
      { userId: 'u-karim', fullName: 'Karim Benali', email: 'karim@esn.fr' },
    ],
  }),
}))
vi.mock('@/features/manager/hooks/useAssignAccount', () => ({
  useAssignAccount: () => ({ mutate: assignMutate, isPending: false }),
}))
vi.mock('@/features/accounts/hooks/useRequestManagerValidation', () => ({
  useRequestManagerValidation: () => ({ mutate: validationMutate, isPending: false }),
}))
vi.mock('@/features/team-guardrails/hooks', () => ({
  useAccountTeam: () => team(),
  useAccountTeamMutations: () => ({ add: { mutate: vi.fn(), isPending: false }, remove: { mutate: vi.fn() } }),
  // #4996 — la carte d'équipe lit aussi les fiches d'entité et porte les périmètres / la répartition.
  useGroupEntityFiches: () => ({ data: [] }),
  useAccountTeamScopeMutations: () => ({
    add: { mutate: vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
  }),
  useDistributePreview: () => ({ mutate: vi.fn(), isPending: false, data: undefined }),
  useDistributeApply: () => ({ mutate: vi.fn(), isPending: false }),
  useAssigneeCandidates: () => ({ data: [] }),
}))
vi.mock('@/features/memoire-collective/hooks/useMemoryBridge', () => ({
  useMemoryBridge: () => ({ bridge: { data: undefined } }),
}))

const { AccountDetailHero } = await import('./AccountDetailHero')

// Les menus Radix ont besoin de ces API de pointeur, que jsdom n'implémente pas.
beforeAll(() => {
  const proto = Element.prototype as unknown as Record<string, unknown>
  proto.hasPointerCapture ??= () => false
  proto.setPointerCapture ??= () => {}
  proto.releasePointerCapture ??= () => {}
  proto.scrollIntoView ??= () => {}
})

beforeEach(() => {
  assignMutate.mockReset()
  validationMutate.mockReset()
  tracker.trackActionStarted.mockClear()
  team.mockReset().mockReturnValue({ data: { responsible: null, members: [], can_edit: true } })
})

const stubAccount: Account = {
  id: '00000000-0000-0000-0000-000000000001',
  user_id: '00000000-0000-0000-0000-000000000002',
  company_name: 'ACME Corp',
  siren: '123456789',
  sector: 'Édition de logiciels',
  employees: '1 200 salariés',
  revenue: '210 M€',
  headquarters: '12 rue de la Paix, 75002 Paris',
  website: null,
  subsidiaries: [],
  it_challenges: [],
  recent_signals: [],
  priority_score: null,
  priority_justification: null,
  raw_analysis: null,
  status: 'completed',
  commercial_status: 'customer',
  owner: { user_id: 'u-sarah', name: 'Sarah Martin' },
  error_message: null,
  user_context: null,
  api_cost_euros: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-15T10:30:00Z',
  last_analyzed_at: '2026-10-14T09:00:00Z',
}

const contacts: Contact[] = []

async function renderHero(overrides: Partial<Account> = {}, onTabChange = vi.fn()) {
  const result = renderWithRouter(
    <AccountDetailHero account={{ ...stubAccount, ...overrides }} contacts={contacts} onTabChange={onTabChange} />,
    '/accounts/test-id',
  )
  await waitFor(() => expect(screen.getByTestId('account-hero')).toBeTruthy())
  return result
}

/** Un bouton PLEIN : le remplissage primaire de `Button` (`default` / `violet`). */
function filledButtons(root: HTMLElement): HTMLElement[] {
  return within(root)
    .queryAllByRole('button')
    .filter(button => button.className.includes('bg-[var(--bellum-primary)]'))
}

async function openMore() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Plus d.actions/ }))
  await screen.findByRole('menu')
  return user
}

describe('#4507 — la barre d’actions', () => {
  it('« ← Portefeuille » à gauche mène au portefeuille', async () => {
    await renderHero()
    const back = within(screen.getByTestId('hero-toolbar')).getByRole('link', { name: 'Revenir au portefeuille' })
    expect(back.getAttribute('href')).toBe('/accounts')
    expect(back).toHaveTextContent('Portefeuille')
  })

  it('à droite : Actualiser, les livrables, puis « … », dans cet ordre', async () => {
    await renderHero()
    const tools = screen.getByTestId('hero-tools')
    const names = within(tools)
      .getAllByRole('button')
      .map(button => button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '')
    const at = (re: RegExp) => names.findIndex(name => re.test(name))
    expect(at(/^Actualiser$/)).toBeGreaterThanOrEqual(0)
    expect(at(/^Actualiser$/)).toBeLessThan(at(/Aperçu PDF/))
    expect(at(/Aperçu PDF/)).toBeLessThan(at(/Brief/))
    expect(at(/Brief/)).toBeLessThan(at(/Partager/))
    expect(at(/Partager/)).toBeLessThan(at(/Télécharger PDF/))
    expect(at(/Télécharger PDF/)).toBeLessThan(at(/Plus d.actions/))
  })

  it('arbitrage Louis 24/10 : la porte de priorité (« Signaler ») est où elle était, PREMIER outil de la barre', async () => {
    await renderHero()
    const tools = screen.getByTestId('hero-tools')
    const first = within(tools).getAllByRole('button')[0]
    expect(first).toHaveAccessibleName(/Décider/)
  })

  it('arbitrage Louis 24/10 : « Exporter » (Télécharger PDF) reste un bouton visible de la barre, avec ses trois voisins', async () => {
    await renderHero()
    const tools = screen.getByTestId('hero-tools')
    for (const name of [/Aperçu PDF/, /Télécharger PDF/, /Brief/, /Partager/]) {
      expect(within(tools).getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('UN SEUL bouton plein dans tout l’en-tête, et c’est « Actualiser »', async () => {
    await renderHero()
    const filled = filledButtons(screen.getByTestId('account-hero'))
    expect(filled).toHaveLength(1)
    expect(filled[0]).toHaveTextContent('Actualiser')
  })

  it('un dossier jamais analysé : le bouton plein unique dit « Analyser le compte » (même geste)', async () => {
    await renderHero({ status: 'prospect', last_analyzed_at: null })
    const filled = filledButtons(screen.getByTestId('account-hero'))
    expect(filled).toHaveLength(1)
    expect(filled[0]).toHaveTextContent('Analyser le compte')
  })

  it('NON : pendant une analyse, et sur une archive de référence, aucun bouton plein', async () => {
    const { unmount } = await renderHero({ status: 'analyzing' })
    expect(filledButtons(screen.getByTestId('account-hero'))).toHaveLength(0)
    unmount()
    const archive = {
      label: 'Archive du dépôt fourni',
      period_from: '2026-09-30',
      period_to: '2026-10-01',
      scope_note: 'périmètre France',
      verified_online: false,
    }
    await renderHero({ raw_analysis: { reference_archive: archive } })
    expect(screen.queryByRole('button', { name: 'Actualiser' })).toBeNull()
  })

  it('ce qui a quitté le premier niveau n’y est plus : Laura, puces, fraîcheur', async () => {
    await renderHero()
    const tools = screen.getByTestId('hero-tools')
    expect(within(tools).queryByRole('button', { name: /Demander à/ })).toBeNull()
    expect(screen.queryByTestId('hero-chips-row')).toBeNull()
    expect(screen.queryByTestId('hero-meta-row')).toBeNull()
  })
})

describe('#4507 — l’identité', () => {
  it('sur-titre « secteur · taille », puis le nom en grand titre', async () => {
    await renderHero()
    expect(screen.getByTestId('hero-eyebrow')).toHaveTextContent('Édition de logiciels · CA 210 M€')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ACME Corp')
  })

  it('le CA brut du registre se lit en notation compacte ; sans effectif, la taille n’est pas doublée', async () => {
    const { unmount } = await renderHero({ revenue: '57412795000' })
    expect(screen.getByTestId('hero-eyebrow').textContent).toMatch(/^Édition de logiciels · CA 57,4\s?Md\s?€$/)
    unmount()
    // Sans effectif, le CA est LA taille de la ligne d'identité : il ne se répète pas au sur-titre.
    await renderHero({ employees: null })
    expect(screen.getByTestId('hero-eyebrow')).toHaveTextContent(/^Édition de logiciels$/)
  })

  it('UNE ligne : ville · effectif · statut · responsable, dans cet ordre', async () => {
    await renderHero()
    const line = screen.getByTestId('hero-identity-line')
    const order = [...line.querySelectorAll('[data-testid]')].map(node => node.getAttribute('data-testid'))
    expect(order).toEqual(['hero-fact-headquarters', 'hero-fact-size', 'hero-commercial-status', 'hero-owner'])
    expect(within(line).getByTestId('hero-fact-headquarters')).toHaveTextContent('Paris')
    expect(within(line).getByTestId('hero-commercial-status')).toHaveTextContent('Client')
    // Avatar + PRÉNOM, et le nom entier pour qui ne voit pas l'écran.
    expect(within(line).getByTestId('hero-owner')).toHaveTextContent('Sarah')
    expect(within(line).getByText('Responsable : Sarah Martin')).toBeInTheDocument()
  })

  it('NON : sans responsable, aucun élément — ni « Propriétaire non renseigné », ni avatar', async () => {
    await renderHero({ owner: null })
    expect(screen.queryByTestId('hero-owner')).toBeNull()
    expect(screen.queryByText(/Propriétaire/)).toBeNull()
    expect(screen.queryByText(/Responsable/)).toBeNull()
  })

  it('les encarts propriétaire et équipe ne sont plus dans la page', async () => {
    await renderHero()
    expect(screen.queryByRole('region', { name: 'Équipe du compte' })).toBeNull()
    expect(screen.queryByText('Équipe du compte')).toBeNull()
    expect(screen.queryByTestId('account-collab-row')).toBeNull()
  })
})

describe('#4507 — « Dossier consultable · date · Périmètre & données »', () => {
  it('nomme l’état du dossier et sa date', async () => {
    await renderHero()
    const check = screen.getByTestId('hero-dossier-check')
    expect(check).toHaveTextContent('Dossier consultable')
    expect(within(check).getByTestId('hero-analyzed-at')).toHaveTextContent('2026')
    expect(within(check).getByRole('button', { name: 'Périmètre & données' })).toBeInTheDocument()
  })

  it('le panneau porte statut d’analyse, SIREN (lien registre), siège et les quatre verdicts', async () => {
    await renderHero()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Périmètre & données' }))
    const panel = await screen.findByTestId('account-scope-panel')
    expect(within(panel).getByTestId('scope-analysis')).toHaveTextContent(/Analyse/)
    expect(within(panel).getByRole('link', { name: /SIREN 123456789/ })).toBeInTheDocument()
    expect(within(panel).getByTestId('scope-registry')).toHaveTextContent('75002 Paris')
    expect(within(within(panel).getByTestId('scope-verdict')).getAllByRole('button').length).toBeGreaterThanOrEqual(4)
    // Arbitrage Louis 24/10 : la porte de priorité n'est PAS déplacée ici (un réglage, un seul endroit).
    expect(within(panel).queryByTestId('scope-priority')).toBeNull()
    expect(within(panel).queryByRole('button', { name: /Décider/ })).toBeNull()
  })
})

describe('#4507 — tout le reste dans « … »', () => {
  it('porte les gestes nommés par le contrat', async () => {
    await renderHero()
    await openMore()
    const menu = screen.getByRole('menu')
    for (const name of [
      /Demander à/,
      /Commenter/,
      /Planifier un créneau/,
      /Mettre à jour dans mon CRM/,
      /Attribuer ce compte/,
      /Demander une validation/,
      /Ajouter un co-équipier/,
      /Archiver/,
    ]) {
      expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument()
    }
  })

  it('NON : les livrables ne sont plus dans « … » (ils sont dans la barre)', async () => {
    await renderHero()
    await openMore()
    const menu = screen.getByRole('menu')
    expect(within(menu).queryByRole('menuitem', { name: /Aperçu PDF|Télécharger PDF|Brief|Partager/ })).toBeNull()
  })

  it('« Commenter » ouvre la section Historique (le fil de commentaires d’équipe)', async () => {
    const onTabChange = vi.fn()
    await renderHero({}, onTabChange)
    const user = await openMore()
    await user.click(screen.getByRole('menuitem', { name: /Commenter/ }))
    expect(onTabChange).toHaveBeenCalledWith('history')
  })

  it('« Demander une validation » demande au serveur, comme avant', async () => {
    await renderHero()
    const user = await openMore()
    await user.click(screen.getByRole('menuitem', { name: /Demander une validation/ }))
    expect(validationMutate).toHaveBeenCalledTimes(1)
  })

  it('« Attribuer le compte » propose les membres et demande l’attribution AU SERVEUR', async () => {
    await renderHero()
    const user = await openMore()
    const trigger = screen.getByRole('menuitem', { name: /Attribuer ce compte/ })
    // Le libellé visible reste « Attribuer le compte » ; le nom accessible dit à qui.
    expect(trigger).toHaveTextContent('Attribuer le compte')
    trigger.focus()
    await user.keyboard('{ArrowRight}')
    fireEvent.click(await screen.findByRole('menuitem', { name: /Karim Benali/ }))
    expect(assignMutate).toHaveBeenCalledWith({ accountId: stubAccount.id, assignedTo: 'u-karim' })
  })

  it('« Ajouter un co-équipier » ouvre la carte d’équipe (même sélecteur)', async () => {
    await renderHero()
    const user = await openMore()
    await user.click(screen.getByRole('menuitem', { name: /Ajouter un co-équipier/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getAllByText('Équipe du compte').length).toBeGreaterThan(0)
    expect(within(dialog).getByRole('combobox', { name: 'Co-équipier à ajouter' })).toBeInTheDocument()
  })

  it('DROITS — sans `can_edit`, « Ajouter un co-équipier » n’est pas proposé (comme le sélecteur d’avant)', async () => {
    team.mockReturnValue({ data: { responsible: null, members: [], can_edit: false } })
    await renderHero()
    await openMore()
    expect(screen.queryByRole('menuitem', { name: /Ajouter un co-équipier/ })).toBeNull()
  })

  it('un plan actif : « Continuer la prochaine action » est une entrée de « … », jamais un bouton plein', async () => {
    await renderHero({ raw_analysis: { plan: { immediate_action: 'Appeler la DSI' } } })
    expect(filledButtons(screen.getByTestId('account-hero'))).toHaveLength(1)
    await openMore()
    expect(
      screen.queryByRole('menuitem', { name: /Continuer la prochaine action|Préparer le plan/ }),
    ).toBeInTheDocument()
  })
})
