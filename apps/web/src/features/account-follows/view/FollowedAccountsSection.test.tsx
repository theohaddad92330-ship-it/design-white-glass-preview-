import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import {
  ACCOUNT_FOLLOW_CAP_REACHED,
  accountFollowsResponseSchema,
  type AccountFollowsResponse,
  type SessionUser,
} from '@bellum/contracts'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionContext } from '@/features/auth/session-context'
import { ApiError } from '@/lib/api-error'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/**
 * #4267 — « Comptes suivis » sur /mes-cibles. Ce que ces tests doivent savoir dire NON :
 *  · 4267.2 — sans suivi, l'écran montre UNE carte : le compte analysé le plus récent, avec « Suivre » ;
 *    sans compte analysé, il le dit et renvoie vers l'analyse ;
 *  · 4267.3 — au plafond, l'écran le dit AVANT le clic, et le 409 du serveur se lit en clair ;
 *  · 4267.4 — la notice de reprise se dit une fois, et les suivis archivés se re-suivent en un clic.
 */
const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('@/lib/api', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  apiFetch,
}))

const { FollowedAccountsSection } = await import('./FollowedAccountsSection')

const item = (account_id: string, company_name: string, archived = false) => ({
  account_id,
  company_name,
  sector: null,
  followed_at: '2026-10-10T08:00:00.000Z',
  archived_at: archived ? '2026-10-18T08:00:00.000Z' : null,
  archived_reason: archived ? ('migration_cap' as const) : null,
})

const view = (over: Partial<AccountFollowsResponse>): AccountFollowsResponse => ({
  max: 3,
  followed: [],
  archived: [],
  suggestion: null,
  migration_notice: false,
  ...over,
})

function mockFollows(response: AccountFollowsResponse, signals: { account_id: string }[] = []) {
  apiFetch.mockImplementation(async (args?: { path: string; method?: string }) => {
    if (args?.path === '/account-follows') return response
    if (args?.path === '/accounts/signals') return signals
    if (args?.path?.endsWith('/follow')) return { account_id: 'x', followed: args.method === 'POST', followed_count: 1 }
    return undefined
  })
}

// Un utilisateur par rendu : le cache de requêtes est partagé entre les tests du fichier.
let renders = 0
function renderSection(crmAccountIds?: ReadonlySet<string>) {
  renders += 1
  return renderWithRouter(
    <SessionContext.Provider value={{ user: { id: `u-follow-${renders}` } as SessionUser, loading: false }}>
      <FollowedAccountsSection crmAccountIds={crmAccountIds} />
    </SessionContext.Provider>,
    '/mes-cibles',
  )
}

/** Les suivis tiennent en une phrase (refonte Théo) : ouvrir « Gérer » s'il existe, puis « Suivis précédemment ». */
async function renderOpened() {
  const utils = renderSection()
  await screen.findByTestId('followed-accounts')
  const manage = screen.queryByRole('button', { name: 'Gérer tes comptes suivis' })
  if (manage) fireEvent.click(manage)
  const archived = screen.queryByRole('button', { name: /^Suivis précédemment/ })
  if (archived) fireEvent.click(archived)
  return utils
}

beforeEach(() => apiFetch.mockReset())

describe('Comptes suivis — personne n’est suivi par défaut (4267.2)', () => {
  it('les doubles sont au contrat — sinon le parse de frontière vide l’écran', () => {
    expect(() => accountFollowsResponseSchema.parse(view({ followed: [item('a', 'Nordia')] }))).not.toThrow()
  })

  it('ne suit rien → UNE carte : son compte analysé le plus récent, avec « Suivre »', async () => {
    mockFollows(
      view({
        suggestion: { account_id: 'acc-7', company_name: 'Velmore', sector: null, analyzed_at: '2026-10-17T09:00:00Z' },
      }),
    )
    await renderOpened()

    expect(await screen.findByText('Tu ne suis encore aucun compte.')).toBeInTheDocument()
    expect(screen.getByText('Velmore')).toBeInTheDocument()
    const follow = screen.getByRole('button', { name: 'Suivre Velmore' })
    expect(follow.className).toMatch(/min-h-11/)

    fireEvent.click(follow)
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith({ path: '/accounts/acc-7/follow', method: 'POST' }))
  })

  it('ne suit rien ET n’a rien analysé → le dit, et renvoie vers l’analyse', async () => {
    mockFollows(view({}))
    await renderOpened()

    expect(await screen.findByText('Tu n’as encore analysé aucun compte.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Analyser une entreprise' })).toHaveAttribute('href', '/search')
    expect(screen.queryByRole('button', { name: /^Suivre / })).not.toBeInTheDocument()
  })

  it('suit déjà un compte → pas de carte de proposition, « Ne plus suivre » sur la ligne', async () => {
    mockFollows(view({ followed: [item('acc-1', 'Nordia')] }))
    await renderOpened()

    expect(await screen.findByRole('link', { name: 'Nordia' })).toHaveAttribute('href', '/accounts/acc-1')
    expect(screen.queryByText('Tu ne suis encore aucun compte.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ne plus suivre Nordia' }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith({ path: '/accounts/acc-1/follow', method: 'DELETE' }))
  })
})

describe('Comptes suivis — la prochaine mise à jour (#4283.8)', () => {
  it('dit « Prochaine mise à jour le <date> » et « dernière le <date> » de chaque suivi, lues de l’API', async () => {
    mockFollows(
      view({
        followed: [
          {
            ...item('acc-1', 'Nordia'),
            last_analyzed_at: '2026-10-10T08:00:00.000Z',
            next_reanalysis_at: '2026-10-25',
            next_reanalysis_reason: null,
          },
        ],
      }),
    )
    await renderOpened()
    expect(await screen.findByText(/Prochaine mise à jour le 25 octobre/)).toBeInTheDocument()
    expect(screen.getByText(/dernière le 10 octobre/)).toBeInTheDocument()
  })

  it('SAIT DIRE NON : jamais analysé ⇒ aucune date, la raison est dite', async () => {
    mockFollows(
      view({
        followed: [
          {
            ...item('acc-2', 'Velmore'),
            last_analyzed_at: null,
            next_reanalysis_at: null,
            next_reanalysis_reason: 'never_analyzed',
          },
        ],
      }),
    )
    await renderOpened()
    expect(await screen.findByText(/Jamais analysé/)).toBeInTheDocument()
    expect(screen.queryByText(/Prochaine mise à jour le/)).not.toBeInTheDocument()
  })
})

describe('Comptes suivis — le plafond (4267.3) et la reprise (4267.4)', () => {
  it('au plafond, l’écran le dit AVANT le clic et ne propose pas de 4e suivi', async () => {
    mockFollows(
      view({
        followed: [item('a1', 'Alpha'), item('a2', 'Beta'), item('a3', 'Gamma')],
        archived: [item('a4', 'Delta', true)],
      }),
    )
    await renderOpened()

    expect(
      await screen.findByText('3 comptes suivis au maximum — retire-en un pour suivre celui-ci.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suivre Delta' })).toBeDisabled()
  })

  it('sous le plafond, un suivi archivé se re-suit en UN clic', async () => {
    mockFollows(view({ followed: [item('a1', 'Alpha')], archived: [item('a4', 'Delta', true)] }))
    await renderOpened()

    const refollow = await screen.findByRole('button', { name: 'Suivre Delta' })
    expect(refollow).toBeEnabled()
    fireEvent.click(refollow)
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith({ path: '/accounts/a4/follow', method: 'POST' }))
  })

  it('le refus du serveur (409) se lit en clair, jamais une erreur générique', async () => {
    apiFetch.mockImplementation(async (args?: { path: string; method?: string }) => {
      if (args?.path === '/account-follows') {
        return view({ followed: [item('a1', 'Alpha')], archived: [item('a4', 'Delta', true)] })
      }
      if (args?.path?.endsWith('/follow')) throw new ApiError('Conflit', 409, ACCOUNT_FOLLOW_CAP_REACHED)
      return undefined
    })
    await renderOpened()

    fireEvent.click(await screen.findByRole('button', { name: 'Suivre Delta' }))
    expect(
      await screen.findByText('3 comptes suivis au maximum — retire-en un pour suivre celui-ci.'),
    ).toBeInTheDocument()
  })

  it('la reprise se dit UNE fois : la notice, puis « Compris » la marque lue', async () => {
    mockFollows(
      view({ followed: [item('a1', 'Alpha')], archived: [item('a4', 'Delta', true)], migration_notice: true }),
    )
    // L'encart vit au-dessus de la phrase, hors de la fenêtre « Gérer » : il se lit sans rien ouvrir.
    renderSection()

    expect(
      await screen.findByText(
        'On a gardé tes 3 comptes les plus récents en suivi ; les autres restent consultables et se re-suivent en un clic.',
      ),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Compris' }))
    await waitFor(() =>
      expect(apiFetch).toHaveBeenCalledWith({ path: '/account-follows/migration-notice/seen', method: 'POST' }),
    )
  })

  it('sans archivage de reprise, aucune notice', async () => {
    mockFollows(view({ followed: [item('a1', 'Alpha')] }))
    await renderOpened()

    await screen.findByRole('link', { name: 'Alpha' })
    expect(screen.queryByText(/On a gardé tes 3 comptes/)).not.toBeInTheDocument()
  })
})

describe('Comptes suivis — une phrase au-dessus de la veille, la liste derrière « Gérer » (refonte Théo)', () => {
  it('au chargement : la phrase nomme les suivis et leur plafond, aucun bouton de liste', async () => {
    mockFollows(
      view({
        followed: [item('a1', 'Alpha'), item('a2', 'Beta'), item('a3', 'Gamma')],
        archived: [item('a4', 'Zeta', true), item('a5', 'Eta', true)],
      }),
    )
    renderSection()

    const sentence = await screen.findByTestId('followed-sentence')
    // Plafond 3 (Louis 23/10) : la phrase nomme les trois suivis, jamais les archivés.
    expect(sentence).toHaveTextContent('Tu suis 3 comptes sur 3 : Alpha, Beta et Gamma.')
    expect(screen.queryByRole('button', { name: 'Ne plus suivre Alpha' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Zeta/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Comptes suivis/ })).not.toBeInTheDocument()
  })

  it('N-SUIVIS (#4538) — trois comptes suivis dont AUCUN n’a de fait de veille ⇒ trois lignes, jamais un onglet vide', async () => {
    mockFollows(view({ followed: [item('a1', 'Alpha'), item('a2', 'Beta'), item('a3', 'Gamma')] }), [])
    renderSection()

    const sentence = await screen.findByTestId('followed-sentence')
    expect(sentence).toHaveTextContent('Tu suis 3 comptes sur 3')
    const list = screen.getByRole('list', { name: 'Comptes suivis' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    for (const [id, name] of [
      ['a1', 'Alpha'],
      ['a2', 'Beta'],
      ['a3', 'Gamma'],
    ]) {
      expect(within(list).getByRole('link', { name })).toHaveAttribute('href', `/accounts/${id}`)
    }
    // Ce qui manque se NOMME sur la ligne, une fois la veille répondue.
    await waitFor(() => expect(screen.getAllByText('Aucun fait dans ta veille pour l’instant')).toHaveLength(3))
  })

  it('les faits de veille enrichissent la ligne : le compte qui en a le dit, celui qui n’en a pas le nomme', async () => {
    mockFollows(view({ followed: [item('a1', 'Alpha'), item('a2', 'Beta')] }), [
      { account_id: 'a1' },
      { account_id: 'a1' },
    ])
    renderSection()

    const alpha = await screen.findByTestId('followed-row-a1')
    const beta = screen.getByTestId('followed-row-a2')
    await waitFor(() => expect(alpha).toHaveTextContent('2 faits dans ta veille'))
    expect(beta).toHaveTextContent('Aucun fait dans ta veille pour l’instant')
    expect(alpha).not.toHaveTextContent('Aucun fait')
  })

  it('veille pas encore répondue : la ligne existe et n’affirme rien sur ses faits', async () => {
    let release: (value: unknown[]) => void = () => undefined
    const signalsPending = new Promise<unknown[]>(resolve => {
      release = resolve
    })
    apiFetch.mockImplementation(async (args?: { path: string }) => {
      if (args?.path === '/account-follows') return view({ followed: [item('a1', 'Alpha')] })
      return signalsPending
    })
    renderSection()

    const row = await screen.findByTestId('followed-row-a1')
    expect(row).toHaveTextContent('Alpha')
    expect(row).not.toHaveTextContent(/fait/)
    release([])
  })

  it('sans aucun suivi, aucune liste : le repli de #4267.2 reste seul', async () => {
    mockFollows(view({}))
    renderSection()

    expect(await screen.findByText('Tu n’as encore analysé aucun compte.')).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Comptes suivis' })).not.toBeInTheDocument()
  })

  it('« Gérer » ouvre la fenêtre : les suivis, puis les anciens suivis repliés derrière leur compte', async () => {
    mockFollows(view({ followed: [item('a1', 'Alpha')], archived: [item('a4', 'Delta', true)] }))
    renderSection()

    fireEvent.click(await screen.findByRole('button', { name: 'Gérer tes comptes suivis' }))
    expect(await screen.findByRole('dialog', { name: 'Tes comptes suivis' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ne plus suivre Alpha' })).toBeInTheDocument()
    const archived = screen.getByRole('button', { name: /^Suivis précédemment/ })
    expect(archived).toHaveAttribute('aria-expanded', 'false')
    expect(archived).toHaveTextContent('1')
    expect(screen.queryByText('Delta')).not.toBeInTheDocument()

    fireEvent.click(archived)
    expect(screen.getByRole('button', { name: 'Suivre Delta' })).toBeInTheDocument()
  })
})

// #4526.3 — « Suivis » ET « Mon CRM » se COMBINENT : l'intersection, jamais la liste des suivis à part.
describe('Comptes suivis — filtre « Mon CRM » combiné (#4526.3)', () => {
  const three = view({ followed: [item('a', 'Aureosys'), item('b', 'Beneteau'), item('c', 'Nordia')] })

  it('ne garde que les suivis qui sont aussi dans le CRM', async () => {
    mockFollows(three)
    renderSection(new Set(['b']))
    await screen.findByTestId('followed-accounts')
    expect(screen.getByTestId('followed-row-b')).toBeInTheDocument()
    expect(screen.queryByTestId('followed-row-a')).not.toBeInTheDocument()
    expect(screen.queryByTestId('followed-row-c')).not.toBeInTheDocument()
  })

  it('aucun suivi dans le CRM : l\u2019écran le DIT, il ne montre pas les suivis hors CRM', async () => {
    mockFollows(three)
    renderSection(new Set(['zzz']))
    expect(await screen.findByTestId('followed-crm-none')).toBeInTheDocument()
    expect(screen.queryByTestId('followed-list')).not.toBeInTheDocument()
  })

  it('sans filtre CRM : tous les suivis restent affichés', async () => {
    mockFollows(three)
    renderSection()
    await screen.findByTestId('followed-accounts')
    expect(screen.getAllByTestId(/^followed-row-/)).toHaveLength(3)
  })
})
