import type { QueryRunner } from 'typeorm'
import { InvitedUserJoinOnConfirm1796560559348 } from '../1796560559348-InvitedUserJoinOnConfirm'

/** Capture le SQL émis par la migration (pas de base vivante). */
function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

async function upSql(): Promise<string[]> {
  const { runner, queries } = createRunner()
  await new InvitedUserJoinOnConfirm1796560559348().up(runner)
  return queries.map(normalize)
}

async function fnSql(): Promise<string> {
  return (await upSql()).find(q => q.includes('FUNCTION handle_invited_user_join()')) ?? ''
}

describe('InvitedUserJoinOnConfirm1796560559348 (prod 19/10/2026, eXteam)', () => {
  it('crée une fonction SECURITY DEFINER au search_path épinglé, comme handle_new_user_workspace', async () => {
    const fn = await fnSql()
    expect(fn).not.toBe('')
    expect(fn).toContain('SECURITY DEFINER')
    expect(fn).toContain('SET search_path = public, auth, extensions')
  })

  it("n'agit JAMAIS sans e-mail confirmé (une adresse non prouvée n'entre pas chez un tiers)", async () => {
    const fn = await fnSql()
    expect(fn).toMatch(/NEW\.email_confirmed_at IS NULL THEN RETURN NEW/)
    // en UPDATE : seulement la transition NULL -> non NULL
    expect(fn).toMatch(/TG_OP = 'UPDATE' AND OLD\.email_confirmed_at IS NOT NULL THEN RETURN NEW/)
  })

  it("ne retient que les invitations pending, non expirées, à l'e-mail du nouvel utilisateur (lower)", async () => {
    const fn = await fnSql()
    expect(fn).toContain("i.status = 'pending'")
    expect(fn).toContain('i.expires_at > now()')
    expect(fn).toContain('lower(i.email) = lower(NEW.email)')
  })

  it('reproduit les effets de acceptInvitation : membre au rôle invité, invitation acceptée, espace actif', async () => {
    const fn = await fnSql()
    expect(fn).toContain('INSERT INTO workspace_members (workspace_id, user_id, role)')
    expect(fn).toContain('ON CONFLICT (workspace_id, user_id) DO NOTHING')
    expect(fn).toContain("SET status = 'accepted', accepted_at = now()")
    expect(fn).toContain('INSERT INTO workspace_active_selections (user_id, workspace_id)')
    expect(fn).toContain('ON CONFLICT (user_id) DO UPDATE')
    expect(fn).toContain('ORDER BY i.created_at DESC')
  })

  it("un échec du rattachement n'empêche JAMAIS l'inscription (avertissement, puis RETURN NEW)", async () => {
    const fn = (await upSql()).find(s => s.startsWith('CREATE OR REPLACE FUNCTION handle_invited_user_join'))
    expect(fn).toMatch(/EXCEPTION WHEN OTHERS THEN RAISE WARNING .+ RETURN NEW;/)
  })

  it("ne contrôle pas les sièges et ne touche pas l'espace perso", async () => {
    const all = (await upSql()).join(' ')
    expect(all).not.toMatch(/seat|siege/i)
    expect(all).not.toContain('handle_new_user_workspace')
    expect(all).not.toContain("'Mon espace'")
  })

  it("pose un trigger dédié AFTER INSERT OR UPDATE OF email_confirmed_at, sans rattrapage de l'existant", async () => {
    const q = await upSql()
    const trg = q.find(s => s.startsWith('CREATE TRIGGER on_auth_user_invited_join'))
    expect(trg).toBeDefined()
    expect(trg).toContain('AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users')
    expect(trg).toContain('EXECUTE FUNCTION handle_invited_user_join()')
    expect(q.some(s => /^(UPDATE|INSERT INTO) workspace/.test(s))).toBe(false)
  })

  it('down supprime le trigger puis la fonction', async () => {
    const { runner, queries } = createRunner()
    await new InvitedUserJoinOnConfirm1796560559348().down(runner)
    const q = queries.map(normalize)
    expect(q[0]).toBe('DROP TRIGGER IF EXISTS on_auth_user_invited_join ON auth.users')
    expect(q[1]).toBe('DROP FUNCTION IF EXISTS handle_invited_user_join()')
  })
})
