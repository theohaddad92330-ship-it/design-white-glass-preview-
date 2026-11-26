import { resolveChatAuthors } from './chat-message-authors'

/**
 * #1940.4 — « Comprendre qui a posé la question ».
 *
 * Le résolveur transforme un `user_id` de `chat_messages` en `{ firstName,
 * avatarUrl }`, et c'est lui qui porte les deux interdits du lot : aucun
 * collègue d'un AUTRE espace, aucune identité effacée. La table simulée
 * ci-dessous applique les paramètres réellement liés par la requête — ce qui
 * prouve que le résolveur borne par l'espace QU'ON LUI DONNE, pas par celui de
 * l'auteur.
 */

type MemberRow = { user_id: string; workspace_id: string }
type ProfileRow = { user_id: string; first_name: string | null; avatar_url: string | null; anonymized_at: Date | null }

function fakeDatabase(members: MemberRow[], profiles: ProfileRow[]) {
  const query = jest.fn(async (_sql: string, params: unknown[] = []) => {
    const [workspaceId, userIds] = params as [string, string[]]
    return members
      .filter(member => member.workspace_id === workspaceId && userIds.includes(member.user_id))
      .flatMap(member => {
        const profile = profiles.find(row => row.user_id === member.user_id && row.anonymized_at === null)
        return profile
          ? [{ userId: profile.user_id, firstName: profile.first_name, avatarUrl: profile.avatar_url }]
          : []
      })
  })
  return { query }
}

const THEO: ProfileRow = {
  user_id: 'u-theo',
  first_name: 'Théo',
  avatar_url: 'https://cdn.example.test/theo.png',
  anonymized_at: null,
}

describe('resolveChatAuthors (#1940.4)', () => {
  it('rend le prénom et l’avatar d’un membre de l’espace lu', async () => {
    const db = fakeDatabase([{ user_id: 'u-theo', workspace_id: 'ws-1' }], [THEO])

    const authors = await resolveChatAuthors(db, 'ws-1', ['u-theo'])

    expect(authors.get('u-theo')).toEqual({ firstName: 'Théo', avatarUrl: 'https://cdn.example.test/theo.png' })
  })

  it('NON — un membre d’un AUTRE espace n’obtient ni prénom ni avatar', async () => {
    // Sarah existe, a un prénom et une photo — mais dans ws-2. Lue depuis ws-1,
    // elle ne doit rien rendre : l'identité d'un concurrent ne traverse pas.
    const sarah: ProfileRow = {
      user_id: 'u-sarah',
      first_name: 'Sarah',
      avatar_url: 'https://cdn.example.test/sarah.png',
      anonymized_at: null,
    }
    const db = fakeDatabase([{ user_id: 'u-sarah', workspace_id: 'ws-2' }], [sarah])

    const authors = await resolveChatAuthors(db, 'ws-1', ['u-sarah'])

    expect(authors.has('u-sarah')).toBe(false)
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('m.workspace_id = $1'), ['ws-1', ['u-sarah']])
  })

  it('un compte EFFACÉ ne rend rien — même si sa ligne de membre traîne encore', async () => {
    const db = fakeDatabase(
      [{ user_id: 'u-theo', workspace_id: 'ws-1' }],
      [{ ...THEO, first_name: '[supprimé]', anonymized_at: new Date('2026-09-12T10:00:00Z') }],
    )

    const authors = await resolveChatAuthors(db, 'ws-1', ['u-theo'])

    expect(authors.has('u-theo')).toBe(false)
    expect(db.query.mock.calls[0]?.[0]).toContain('p.anonymized_at IS NULL')
  })

  it('un message dont l’auteur a été retiré (`user_id` null) est ignoré sans requête inutile', async () => {
    const db = fakeDatabase([], [])

    const authors = await resolveChatAuthors(db, 'ws-1', [null, undefined, null])

    expect(authors.size).toBe(0)
    expect(db.query).not.toHaveBeenCalled()
  })

  it('dédoublonne les identifiants — un fil de 40 messages du même auteur fait UNE entrée', async () => {
    const db = fakeDatabase([{ user_id: 'u-theo', workspace_id: 'ws-1' }], [THEO])

    await resolveChatAuthors(db, 'ws-1', ['u-theo', 'u-theo', null, 'u-theo'])

    expect(db.query).toHaveBeenCalledWith(expect.any(String), ['ws-1', ['u-theo']])
  })

  it('un prénom BLANC n’est pas un prénom : pas d’auteur plutôt qu’une bulle sans nom', async () => {
    const db = fakeDatabase([{ user_id: 'u-theo', workspace_id: 'ws-1' }], [{ ...THEO, first_name: '   ' }])

    const authors = await resolveChatAuthors(db, 'ws-1', ['u-theo'])

    expect(authors.has('u-theo')).toBe(false)
  })

  it('un avatar qui n’est pas une adresse https est écarté — le prénom reste, les initiales prennent le relais', async () => {
    const db = fakeDatabase(
      [{ user_id: 'u-theo', workspace_id: 'ws-1' }],
      [{ ...THEO, first_name: '  Théo ', avatar_url: 'javascript:alert(1)' }],
    )

    const authors = await resolveChatAuthors(db, 'ws-1', ['u-theo'])

    expect(authors.get('u-theo')).toEqual({ firstName: 'Théo', avatarUrl: null })
  })

  it('une lecture qui échoue ne casse pas le fil : aucun auteur, jamais un auteur deviné', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('connection reset')) }

    const authors = await resolveChatAuthors(db, 'ws-1', ['u-theo'])

    expect(authors.size).toBe(0)
  })

  it('n’écrit jamais l’adresse e-mail dans la requête — le prénom ou rien', async () => {
    const db = fakeDatabase([{ user_id: 'u-theo', workspace_id: 'ws-1' }], [THEO])

    await resolveChatAuthors(db, 'ws-1', ['u-theo'])

    expect(db.query.mock.calls[0]?.[0]).not.toMatch(/email/i)
  })
})
