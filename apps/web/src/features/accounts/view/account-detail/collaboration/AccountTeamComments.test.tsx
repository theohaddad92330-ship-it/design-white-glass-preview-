import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountTeamComments } from './AccountTeamComments'

/**
 * #2914 (#2128.10) — LE FIL DE COMMENTAIRES D'UN COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS TIENNENT
 * ─────────────────────────────────────────────────────────────────────────────
 * `AccountDetail.collaboration.test.tsx` prouve qu'un bandeau du dossier est
 * bien MONTÉ — même précaution ici, mais sur le COMPOSANT : il rend le fil
 * scopé au compte (jamais un fil général), poste un nouveau commentaire, et
 * nomme une absence plutôt que de rendre un cadre vide sans le dire.
 */

const list = vi.fn()
const create = vi.fn()
const members = vi.fn()

vi.mock('../../../hooks/useAccountTeamComments', () => ({
  useAccountTeamComments: (accountId: string | null) => list(accountId),
  useCreateAccountTeamComment: (accountId: string | null) => create(accountId),
}))
const myThreads = vi.fn()
const setResolution = vi.fn()
const replyTo = vi.fn()
vi.mock('../../../hooks/useTeamThreads', () => ({
  useMyOpenThreads: (enabled: boolean) => myThreads(enabled),
  useSetThreadResolution: () => setResolution(),
  useReplyToThread: () => replyTo(),
}))
vi.mock('@/features/chat/hooks/useWorkspaceMembers', () => ({ useWorkspaceMembers: () => members() }))

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111'

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <AccountTeamComments accountId={ACCOUNT_ID} />
    </QueryClientProvider>,
  )
}

describe('AccountTeamComments', () => {
  beforeEach(() => {
    list.mockReset()
    create.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
    members.mockReset().mockReturnValue({ data: [] })
    myThreads.mockReset().mockReturnValue({ data: undefined })
    setResolution.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
    replyTo.mockReset().mockReturnValue({ mutate: vi.fn(), isPending: false })
  })

  it('reste muet tant que la lecture n’a pas abouti — jamais un cadre vide', () => {
    list.mockReturnValue({ isSuccess: false, isError: false, data: undefined })
    show()
    expect(screen.queryByRole('region', { name: 'Commentaires d’équipe' })).toBeNull()
  })

  it('nomme l’échec de lecture plutôt que de rendre un fil vide qui se lirait « aucun commentaire »', () => {
    list.mockReturnValue({ isSuccess: false, isError: true, data: undefined })
    show()
    expect(screen.getByText('Le fil de commentaires n’a pas pu être chargé.')).toBeInTheDocument()
  })

  it('nomme l’absence quand le fil est vide, jamais un cadre muet', () => {
    list.mockReturnValue({ isSuccess: true, isError: false, data: { items: [] } })
    show()
    expect(screen.getByRole('region', { name: 'Commentaires d’équipe' })).toBeInTheDocument()
    expect(screen.getByText('Aucun commentaire pour l’instant sur ce compte.')).toBeInTheDocument()
  })

  it('affiche les commentaires du compte, auteur et corps réels', () => {
    list.mockReturnValue({
      isSuccess: true,
      isError: false,
      data: {
        items: [
          {
            id: 'c-1',
            workspace_id: 'ws-1',
            author_user_id: 'u1',
            author_name: 'Camille Perrin',
            body: 'Prévenir avant tout envoi, DPO pointilleux.',
            account_id: ACCOUNT_ID,
            company_name: 'ACME',
            conversation_id: null,
            message_id: null,
            created_at: '2026-09-20T09:00:00.000Z',
          },
        ],
      },
    })
    show()
    expect(screen.getByText('Camille Perrin')).toBeInTheDocument()
    expect(screen.getByText('Prévenir avant tout envoi, DPO pointilleux.')).toBeInTheDocument()
  })

  it('retombe sur "Membre inconnu" plutôt qu’un nom vide', () => {
    list.mockReturnValue({
      isSuccess: true,
      isError: false,
      data: {
        items: [
          {
            id: 'c-1',
            workspace_id: 'ws-1',
            author_user_id: 'u1',
            author_name: null,
            body: 'Note.',
            account_id: ACCOUNT_ID,
            company_name: null,
            conversation_id: null,
            message_id: null,
            created_at: '2026-09-20T09:00:00.000Z',
          },
        ],
      },
    })
    show()
    expect(screen.getByText('Membre inconnu')).toBeInTheDocument()
  })

  it('poste un commentaire écrit, jamais avant qu’il ait du texte', async () => {
    const mutate = vi.fn()
    create.mockReturnValue({ mutate, isPending: false })
    list.mockReturnValue({ isSuccess: true, isError: false, data: { items: [] } })
    show()

    const submit = screen.getByRole('button', { name: 'Partager' })
    expect(submit).toBeDisabled()

    await userEvent.type(screen.getByLabelText('Ton commentaire'), 'Attention, appel d’offres en cours.')
    expect(submit).not.toBeDisabled()
    await userEvent.click(submit)

    expect(mutate).toHaveBeenCalledWith(
      { body: 'Attention, appel d’offres en cours.' },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('propose les membres de l’espace en tapant "@", et compose la mention choisie', async () => {
    members.mockReturnValue({
      data: [
        { userId: 'u-camille', email: 'camille@acme.fr', fullName: 'Camille Perrin', role: 'member', isSelf: false },
        { userId: 'u-hugo', email: 'hugo@acme.fr', fullName: 'Hugo Bernard', role: 'member', isSelf: false },
      ],
    })
    list.mockReturnValue({ isSuccess: true, isError: false, data: { items: [] } })
    show()

    const input = screen.getByLabelText('Ton commentaire')
    await userEvent.type(input, 'Pour @Cam')

    const suggestion = await screen.findByRole('option', { name: 'Camille Perrin' })
    expect(screen.queryByRole('option', { name: 'Hugo Bernard' })).toBeNull()
    await userEvent.click(suggestion)

    expect((input as HTMLTextAreaElement).value).toBe('Pour @Camille Perrin ')
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('n’envoie que les ids des collègues encore nommés dans le texte tapé', async () => {
    const mutate = vi.fn()
    create.mockReturnValue({ mutate, isPending: false })
    members.mockReturnValue({
      data: [{ userId: 'u-camille', email: null, fullName: 'Camille Perrin', role: 'member', isSelf: false }],
    })
    list.mockReturnValue({ isSuccess: true, isError: false, data: { items: [] } })
    show()

    await userEvent.type(screen.getByLabelText('Ton commentaire'), 'Voir avec @Camille Perrin stp')
    await userEvent.click(screen.getByRole('button', { name: 'Partager' }))

    expect(mutate).toHaveBeenCalledWith(
      { body: 'Voir avec @Camille Perrin stp', mentioned_user_ids: ['u-camille'] },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    )
  })

  it('met en évidence une mention confirmée côté serveur, jamais un texte qui la nommerait sans lien', () => {
    members.mockReturnValue({
      data: [{ userId: 'u-camille', email: null, fullName: 'Camille Perrin', role: 'member', isSelf: false }],
    })
    list.mockReturnValue({
      isSuccess: true,
      isError: false,
      data: {
        items: [
          {
            id: 'c-1',
            workspace_id: 'ws-1',
            author_user_id: 'u1',
            author_name: 'Hugo Bernard',
            body: 'Voir avec @Camille Perrin stp',
            account_id: ACCOUNT_ID,
            company_name: null,
            conversation_id: null,
            message_id: null,
            mentioned_user_ids: ['u-camille'],
            created_at: '2026-09-20T09:00:00.000Z',
          },
        ],
      },
    })
    show()

    const mention = screen.getByText('@Camille Perrin')
    expect(mention.tagName).toBe('SPAN')
    expect(mention.className).toContain('font-semibold')
    expect(mention.closest('li')?.textContent).toContain('Voir avec @Camille Perrin stp')
  })

  // #4158.31 — fils d'équipe : résolu, réponses, « mes fils ouverts ».
  describe('#4158.31 — fils résolus', () => {
    const thread = {
      id: 'root-1',
      workspace_id: 'w',
      author_user_id: 'u1',
      author_name: 'Alice',
      body: 'Qui reprend ce compte ?',
      account_id: ACCOUNT_ID,
      company_name: 'Decathlon',
      conversation_id: null,
      message_id: null,
      mentioned_user_ids: [],
      parent_comment_id: null,
      resolved_at: null,
      resolved_by: null,
      created_at: '2026-10-14T08:00:00.000Z',
    }
    const answer = { ...thread, id: 'r-1', author_name: 'Bob', body: 'Je le prends.', parent_comment_id: 'root-1' }

    it('rend la réponse SOUS sa racine, jamais comme un second fil', () => {
      list.mockReturnValue({ isSuccess: true, isError: false, data: { items: [thread, answer] } })
      show()
      expect(screen.getAllByText('Qui reprend ce compte ?')).toHaveLength(1)
      expect(screen.getByText('Je le prends.')).toBeInTheDocument()
      // une seule racine : un seul bouton « Marquer résolu »
      expect(screen.getAllByRole('button', { name: 'Marquer résolu' })).toHaveLength(1)
    })

    it('« Marquer résolu » demande la résolution de la RACINE', async () => {
      const mutate = vi.fn()
      setResolution.mockReturnValue({ mutate, isPending: false })
      list.mockReturnValue({ isSuccess: true, isError: false, data: { items: [thread] } })
      show()
      await userEvent.setup().click(screen.getByRole('button', { name: 'Marquer résolu' }))
      expect(mutate).toHaveBeenCalledWith({ id: 'root-1', resolved: true })
    })

    it('un fil résolu affiche sa date et propose de le rouvrir', async () => {
      const mutate = vi.fn()
      setResolution.mockReturnValue({ mutate, isPending: false })
      list.mockReturnValue({
        isSuccess: true,
        isError: false,
        data: { items: [{ ...thread, resolved_at: '2026-10-14T09:00:00.000Z', resolved_by: 'u2' }] },
      })
      show()
      expect(screen.getByText(/Résolu le/)).toBeInTheDocument()
      await userEvent.setup().click(screen.getByRole('button', { name: 'Rouvrir' }))
      expect(mutate).toHaveBeenCalledWith({ id: 'root-1', resolved: false })
    })

    it('« Mes fils ouverts » bascule sur la liste du serveur, avec le compte nommé', async () => {
      list.mockReturnValue({ isSuccess: true, isError: false, data: { items: [thread] } })
      myThreads.mockImplementation((enabled: boolean) => ({
        data: enabled ? { items: [{ ...thread, id: 'mine-1', body: 'Un fil à moi' }] } : undefined,
      }))
      show()
      await userEvent.setup().click(screen.getByRole('button', { name: 'Mes fils ouverts' }))
      expect(myThreads).toHaveBeenLastCalledWith(true)
      expect(screen.getByText('Un fil à moi')).toBeInTheDocument()
      expect(screen.getByText('Sur Decathlon')).toBeInTheDocument()
    })

    it('nomme l’absence quand aucun fil ouvert ne me concerne', async () => {
      list.mockReturnValue({ isSuccess: true, isError: false, data: { items: [thread] } })
      myThreads.mockReturnValue({ data: { items: [] } })
      show()
      await userEvent.setup().click(screen.getByRole('button', { name: 'Mes fils ouverts' }))
      expect(screen.getByText('Aucun fil ouvert pour toi.')).toBeInTheDocument()
    })

    it('répondre envoie la réponse rattachée à la racine', async () => {
      const mutate = vi.fn()
      replyTo.mockReturnValue({ mutate, isPending: false })
      list.mockReturnValue({ isSuccess: true, isError: false, data: { items: [thread] } })
      show()
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Répondre' }))
      await user.type(screen.getByLabelText('Ta réponse'), 'Je m’en occupe')
      await user.click(screen.getByRole('button', { name: 'Envoyer' }))
      expect(mutate).toHaveBeenCalledWith({ parentId: 'root-1', body: 'Je m’en occupe' }, expect.anything())
    })
  })
})
