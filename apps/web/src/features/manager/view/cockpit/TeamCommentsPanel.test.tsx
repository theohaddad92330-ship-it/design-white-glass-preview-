import { fireEvent, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManagerMemberStats } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { renderWithRouter } from '@/test-utils/renderWithRouter'

/** Théo D team-activite › Échanges d'équipe : « Les sujets ouverts », partager, répondre, résoudre. */

let commentsStub: { isSuccess: boolean; data: unknown }
const createMock = vi.fn()
const resolveMock = vi.fn()
vi.mock('../../hooks/useTeamComments', () => ({
  useTeamComments: () => commentsStub,
  useCreateTeamComment: () => ({ mutate: createMock, isPending: false }),
  useSetTeamCommentResolution: () => ({ mutate: resolveMock, isPending: false }),
}))
vi.mock('@/features/accounts/hooks/useAccounts', () => ({
  useAccounts: () => ({
    data: { pages: [{ data: [{ id: 'acc-1', company_name: 'Decathlon' }], pagination: { totalItems: 1 } }] },
  }),
}))

const { TeamCommentsPanel } = await import('./TeamCommentsPanel')

const MEMBERS = [
  { user_id: 'u1', name: 'Alice Martin' },
  { user_id: 'u2', name: 'Bob Durand' },
] as ManagerMemberStats[]
const comment = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  workspace_id: 'ws-1',
  author_user_id: 'u1',
  author_name: 'Alice Martin',
  body: 'Attention, ce compte a déjà été démarché.',
  account_id: 'acc-1',
  company_name: 'Decathlon',
  conversation_id: null,
  message_id: null,
  mentioned_user_ids: ['u2'],
  parent_comment_id: null,
  resolved_at: null,
  resolved_by: null,
  created_at: '2026-07-22T08:30:00.000Z',
  ...extra,
})

describe('TeamCommentsPanel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fr')
    commentsStub = { isSuccess: false, data: undefined }
    createMock.mockReset()
    resolveMock.mockReset()
  })

  it('stays hidden until the endpoint answers (deploy-skew)', () => {
    const { container } = renderWithRouter(<TeamCommentsPanel members={MEMBERS} />)
    expect(container.querySelector('[data-board-block="exchanges"]')).toBeNull()
  })

  it('« Les sujets ouverts » : une carte par sujet — auteur, statut, texte, compte, mention, réponses', async () => {
    commentsStub = {
      isSuccess: true,
      data: {
        items: [
          comment('c-1'),
          comment('c-2', { parent_comment_id: 'c-1', body: 'Vu, je relis.', author_name: 'Bob Durand' }),
        ],
      },
    }
    renderWithRouter(<TeamCommentsPanel members={MEMBERS} />)
    expect(await screen.findByRole('heading', { name: 'Les sujets ouverts' })).toBeInTheDocument()
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(1)
    const card = cards[0]
    expect(within(card).getByText('Alice Martin')).toBeInTheDocument()
    expect(within(card).getByText('À discuter')).toBeInTheDocument()
    expect(within(card).getByText(/déjà été démarché/)).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: 'Decathlon' })).toHaveAttribute('href', '/accounts/acc-1')
    expect(within(card).getByText('@Bob Durand')).toBeInTheDocument()
    expect(within(within(card).getByRole('list', { name: 'Réponses' })).getByText('Vu, je relis.')).toBeInTheDocument()
  })

  it('« Marquer résolu » passe par la porte de résolution', async () => {
    commentsStub = { isSuccess: true, data: { items: [comment('c-1')] } }
    renderWithRouter(<TeamCommentsPanel members={MEMBERS} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Marquer résolu' }))
    expect(resolveMock).toHaveBeenCalledWith({ id: 'c-1', resolved: true })
  })

  it('« Répondre » ouvre sa fenêtre et accroche la réponse au sujet', async () => {
    commentsStub = { isSuccess: true, data: { items: [comment('c-1')] } }
    renderWithRouter(<TeamCommentsPanel members={MEMBERS} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Répondre' }))
    const dialog = await screen.findByRole('dialog', { name: 'Répondre au sujet' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Ta réponse' }), {
      target: { value: 'Je m’en charge.' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Répondre' }))
    expect(createMock).toHaveBeenCalledWith({ body: 'Je m’en charge.', parent_comment_id: 'c-1' }, expect.anything())
  })

  it('« Partager un point » ouvre la fenêtre de Théo et poste le texte réel', async () => {
    commentsStub = { isSuccess: true, data: { items: [] } }
    renderWithRouter(<TeamCommentsPanel members={MEMBERS} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Partager un point' }))
    const dialog = await screen.findByRole('dialog', { name: 'Partager un point d’équipe' })
    const share = within(dialog).getByRole('button', { name: 'Partager' })
    expect(share).toBeDisabled()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Le point à partager' }), {
      target: { value: 'Idée : mutualiser la soutenance.' },
    })
    fireEvent.click(share)
    expect(createMock).toHaveBeenCalledWith({ body: 'Idée : mutualiser la soutenance.' }, expect.anything())
  })

  it('shows an empty state rather than a fabricated feed', async () => {
    commentsStub = { isSuccess: true, data: { items: [] } }
    renderWithRouter(<TeamCommentsPanel members={MEMBERS} />)
    expect(await screen.findByTestId('team-comments-empty')).toHaveTextContent('Aucun sujet partagé pour l’instant.')
  })
})
