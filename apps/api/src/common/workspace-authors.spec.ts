import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { resolveWorkspaceAuthors } from './workspace-authors'

/**
 * QUI A ÉCRIT, QUI A ÉPINGLÉ — UNE SEULE RÈGLE D'AUTEUR (GA-26).
 *
 * Deux lots l'ont écrite le même jour, à l'identique : l'auteur d'un message de
 * Laura (#1940.4, `resolveChatAuthors`) et l'auteur d'un élément de mémoire
 * (#1916.16). Deux copies d'une règle d'identité divergent au premier
 * changement — un avatar accepté ici et refusé là, un compte effacé nommé d'un
 * côté seulement. Elle vit ici ; les appelants l'appellent.
 *
 * Les tests NON de la règle : un membre d'un AUTRE espace, un compte EFFACÉ, un
 * avatar non https, l'adresse e-mail — jamais servis. Chaque appelant garde en
 * plus les siens (`chat-message-authors.spec.ts`, `memory-edit-history.spec.ts`).
 */

type MemberRow = { user_id: string; workspace_id: string }
type ProfileRow = { user_id: string; first_name: string | null; avatar_url: string | null; anonymized_at: Date | null }

/** Une base qui APPLIQUE les clauses réellement écrites dans la requête : retirer un filtre le fait voir. */
function fakeDatabase(members: MemberRow[], profiles: ProfileRow[]) {
  const query = jest.fn(async (sql: string, params: unknown[] = []) => {
    const [workspaceId, userIds] = params as [string, string[]]
    const scoped = /m\.workspace_id = \$1/.test(sql)
    const hideErased = /p\.anonymized_at IS NULL/.test(sql)
    return members
      .filter(member => (!scoped || member.workspace_id === workspaceId) && userIds.includes(member.user_id))
      .flatMap(member => {
        const profile = profiles.find(row => row.user_id === member.user_id && (!hideErased || !row.anonymized_at))
        return profile
          ? [{ userId: profile.user_id, firstName: profile.first_name, avatarUrl: profile.avatar_url }]
          : []
      })
  })
  return { query }
}

const JULIE: ProfileRow = {
  user_id: 'u-julie',
  first_name: 'Julie',
  avatar_url: 'https://cdn.example.test/julie.png',
  anonymized_at: null,
}

describe('resolveWorkspaceAuthors — la règle d’auteur', () => {
  it('rend le prénom et l’avatar d’un membre de l’espace lu', async () => {
    const db = fakeDatabase([{ user_id: 'u-julie', workspace_id: 'ws-1' }], [JULIE])
    const authors = await resolveWorkspaceAuthors(db, 'ws-1', ['u-julie'])
    expect(authors.get('u-julie')).toEqual({ firstName: 'Julie', avatarUrl: 'https://cdn.example.test/julie.png' })
  })

  it('NON — un membre d’un AUTRE espace n’obtient ni prénom ni avatar (le témoin, lui, est résolu)', async () => {
    const sarah: ProfileRow = { ...JULIE, user_id: 'u-sarah', first_name: 'Sarah' }
    const db = fakeDatabase(
      [
        { user_id: 'u-julie', workspace_id: 'ws-1' },
        { user_id: 'u-sarah', workspace_id: 'ws-2' },
      ],
      [JULIE, sarah],
    )
    const authors = await resolveWorkspaceAuthors(db, 'ws-1', ['u-julie', 'u-sarah'])
    expect([...authors.keys()]).toEqual(['u-julie'])
  })

  it('NON — un compte EFFACÉ ne rend rien, même si sa ligne de membre traîne encore', async () => {
    const db = fakeDatabase(
      [{ user_id: 'u-julie', workspace_id: 'ws-1' }],
      [{ ...JULIE, anonymized_at: new Date('2026-09-12T10:00:00Z') }],
    )
    expect((await resolveWorkspaceAuthors(db, 'ws-1', ['u-julie'])).size).toBe(0)
  })

  it('NON — un avatar non https n’est jamais servi ; un prénom blanc ne produit pas d’auteur', async () => {
    const db = fakeDatabase(
      [
        { user_id: 'u-julie', workspace_id: 'ws-1' },
        { user_id: 'u-blank', workspace_id: 'ws-1' },
      ],
      [
        { ...JULIE, avatar_url: 'javascript:alert(1)' },
        { user_id: 'u-blank', first_name: '   ', avatar_url: null, anonymized_at: null },
      ],
    )
    const authors = await resolveWorkspaceAuthors(db, 'ws-1', ['u-julie', 'u-blank'])
    expect(authors.get('u-julie')).toEqual({ firstName: 'Julie', avatarUrl: null })
    expect(authors.has('u-blank')).toBe(false)
  })

  it('aucune requête sans identifiant ; une lecture en échec rend une carte VIDE, jamais un prénom deviné', async () => {
    const empty = fakeDatabase([], [])
    expect((await resolveWorkspaceAuthors(empty, 'ws-1', [null, undefined, ''])).size).toBe(0)
    expect(empty.query).not.toHaveBeenCalled()

    const broken = { query: jest.fn().mockRejectedValue(new Error('connexion perdue')) }
    expect((await resolveWorkspaceAuthors(broken, 'ws-1', ['u-julie'])).size).toBe(0)
  })

  it('NON — ne lit jamais l’adresse e-mail, et ne sert jamais l’identifiant dans la valeur', async () => {
    const db = fakeDatabase([{ user_id: 'u-julie', workspace_id: 'ws-1' }], [JULIE])
    const authors = await resolveWorkspaceAuthors(db, 'ws-1', ['u-julie'])
    expect(String(db.query.mock.calls[0]?.[0])).not.toMatch(/email/i)
    expect(JSON.stringify([...authors.values()])).not.toContain('u-julie')
  })
})

/** Tous les fichiers source de l'API, hors tests. */
function sources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sources(full))
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

describe('une seule règle d’auteur dans l’API (GA-26)', () => {
  const root = join(__dirname, '..')
  const corpus = sources(root).map(file => ({ file: relative(root, file), text: readFileSync(file, 'utf8') }))
  /** La règle, reconnue à sa forme : membres × profils non effacés, prénom + avatar. */
  const isAuthorRule = (text: string) =>
    /FROM\s+workspace_members\s+m/.test(text) &&
    /JOIN\s+profiles\s+p\s+ON\s+p\.user_id\s*=\s*m\.user_id/.test(text) &&
    /p\.anonymized_at\s+IS\s+NULL/.test(text) &&
    /avatar_url/.test(text)

  it('lit un corpus réel', () => {
    expect(corpus.length).toBeGreaterThan(500)
  })

  it('n’existe qu’à UN endroit : `common/workspace-authors.ts`', () => {
    expect(corpus.filter(source => isAuthorRule(source.text)).map(source => source.file)).toEqual([
      'common/workspace-authors.ts',
    ])
  })

  it('n’attrape pas ce qu’elle ne vise pas : les autres lectures des membres d’un espace restent libres', () => {
    const otherMemberReads = corpus.filter(
      source => /workspace_members/.test(source.text) && !isAuthorRule(source.text),
    )
    expect(otherMemberReads.length).toBeGreaterThan(0)
  })

  it('les deux appelants l’appellent — le fil de Laura et la mémoire', () => {
    const importsRule = (file: string) =>
      /from '(\.\.\/)+common\/workspace-authors'/.test(corpus.find(source => source.file === file)?.text ?? '')
    expect(importsRule('modules/ia-proxy/chat-message-authors.ts')).toBe(true)
    expect(importsRule('modules/memory/memory.service.ts')).toBe(true)
  })
})
