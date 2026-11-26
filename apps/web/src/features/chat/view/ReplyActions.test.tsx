import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_CHAT_PROMPTS } from '@/features/demo/demo-chat-script'
import { discoverCriteriaOfReply } from './discover-handoff'
import { ReplyActions } from './ReplyActions'
import { replyActionPlan, replyActionTarget } from './reply-actions'

const navigate = vi.fn()
vi.mock('@tanstack/react-router', async importOriginal => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useNavigate: () => navigate,
}))
const create = vi.fn()
const addItem = vi.fn()
vi.mock('@/features/target-lists/api', () => ({
  targetListsApi: {
    create: (...args: unknown[]) => create(...args),
    addItem: (...args: unknown[]) => addItem(...args),
  },
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'fr' },
    t: (key: string, opts?: Record<string, string>) => (opts?.criteria ? `${key}|${opts.criteria}` : key),
  }),
}))

const ALPHA = '11111111-1111-4111-8111-111111111111'
const BETA = '22222222-2222-4222-8222-222222222222'
const fixtures = JSON.parse(
  readFileSync(resolve(process.cwd(), '../../packages/contracts/src/schemas/reply-blocks.fixtures.json'), 'utf8'),
) as { valid: Record<string, unknown> }
const ranking = JSON.stringify(fixtures.valid.account_ranking).replaceAll('/accounts/alpha-1', `/accounts/${ALPHA}`)
// Un tour de /chat : « par où commencer ? » → réponse avec classement, deux comptes cités.
const rankingReply = `Voici le classement.\n\`\`\`bellum-block\n${ranking}\n\`\`\`\nVoir aussi [Beta](/accounts/${BETA}).`

const props = { notConsulted: undefined, onPrefill: vi.fn(), onQualify: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  create.mockResolvedValue({ id: 'list-1', name: 'x' })
  addItem.mockResolvedValue({})
})

describe('#3766 — ReplyActions : rejoue le tour (entrée → réponse riche → action)', () => {
  it('un classement : un seul bouton principal « liste de travail », les autres secondaires, « Ignorer » en dernier', () => {
    render(<ReplyActions content={rankingReply} discoverCriteria={null} {...props} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons.filter(b => b.dataset.primary === 'true').map(b => b.textContent)).toEqual([
      'replyActions.kind.create_worklist',
    ])
    expect(buttons.at(-1)?.textContent).toBe('replyActions.kind.dismiss')
  })

  it('« Créer une liste de travail » crée la liste (source laura) avec les comptes cités, puis ouvre Mes cibles', async () => {
    render(<ReplyActions content={rankingReply} discoverCriteria={null} {...props} />)
    fireEvent.click(screen.getByText('replyActions.kind.create_worklist'))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith({ to: '/accounts', search: { lens: 'lists' } }))
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ source: 'laura' }))
    expect(addItem.mock.calls.map(c => (c[1] as { ref_id: string }).ref_id)).toEqual([ALPHA, BETA])
  })

  it('une liste qui échoue le dit, sans navigation', async () => {
    create.mockRejectedValue(new Error('boom'))
    render(<ReplyActions content={rankingReply} discoverCriteria={null} {...props} />)
    fireEvent.click(screen.getByText('replyActions.kind.create_worklist'))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('« Trouver les contacts » ouvre l’onglet contacts DU compte cité', () => {
    render(<ReplyActions content={rankingReply} discoverCriteria={null} {...props} />)
    fireEvent.click(screen.getByText('replyActions.kind.find_contacts'))
    expect(navigate).toHaveBeenCalledWith({ to: '/accounts/$id', params: { id: ALPHA }, search: { tab: 'contacts' } })
  })

  it('« Affiner la recherche » pose les critères dans le composeur, sans rien envoyer', () => {
    render(
      <ReplyActions
        content="Voici."
        discoverCriteria={{ sectors: 'finance', department: '34', laura: '1' }}
        {...props}
      />,
    )
    fireEvent.click(screen.getByText('replyActions.kind.refine_search'))
    expect(props.onPrefill).toHaveBeenCalledWith(
      'replyActions.refinePrompt|replyActions.criteria.sectors : finance ; replyActions.criteria.department : 34',
    )
    expect(navigate).not.toHaveBeenCalled()
  })

  it('« Lancer une qualification complémentaire » ouvre le repli de la réponse', () => {
    render(<ReplyActions content={rankingReply} discoverCriteria={null} {...{ ...props, notConsulted: ['x'] }} />)
    expect(screen.getByText('replyActions.kind.qualify_further').closest('button')?.dataset.primary).toBe('true')
    fireEvent.click(screen.getByText('replyActions.kind.qualify_further'))
    expect(props.onQualify).toHaveBeenCalledTimes(1)
  })

  it('« Ignorer » masque le bloc sans rien effacer', () => {
    render(<ReplyActions content={rankingReply} discoverCriteria={null} {...props} />)
    fireEvent.click(screen.getByText('replyActions.kind.dismiss'))
    expect(screen.queryByTestId('reply-actions')).toBeNull()
    expect(create).not.toHaveBeenCalled()
  })

  it('une réponse sans objet réel n’affiche aucun bouton', () => {
    render(<ReplyActions content="Bonjour, comment puis-je aider ?" discoverCriteria={null} {...props} />)
    expect(screen.queryByTestId('reply-actions')).toBeNull()
  })
})

describe('#3766 — le geste ne se résout jamais sans son objet', () => {
  it('chaque geste proposé a une destination réelle', () => {
    const resolved = replyActionPlan(rankingReply, { sectors: 'finance' }, ['x'])
    expect(resolved).not.toBeNull()
    for (const kind of [resolved!.plan.primary, ...resolved!.plan.secondary]) {
      expect(replyActionTarget(kind, resolved!.input, { sectors: 'finance' }), kind).not.toBeNull()
    }
  })
})

describe('#3766 — démo : la suite de Laura se voit sans donnée réelle', () => {
  it('« tour d’horizon des industriels » porte une proposition Découvrir → « Affiner la recherche » est offert', () => {
    const prompt = DEMO_CHAT_PROMPTS.find(entry => entry.id === 'p-market-sweep')
    const criteria = discoverCriteriaOfReply(prompt?.pendingActions?.() ?? [])
    expect(criteria).not.toBeNull()
    render(<ReplyActions content={prompt?.answer ?? ''} discoverCriteria={criteria} {...props} />)
    expect(screen.getByText('replyActions.kind.refine_search')).toBeTruthy()
  })
})
