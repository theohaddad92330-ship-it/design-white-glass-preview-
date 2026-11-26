import {
  DIRECT_SESSION_SETTINGS,
  applyDirectSessionSettings,
  directConnectionWarning,
  resolveDirectConnection,
} from './direct-connection'

/**
 * Incident pool du 04/10/2026 (soir) — les migrations et le verrou consultatif
 * passaient par le pooler Supavisor en mode TRANSACTION (port 6543) : un verrou
 * de SESSION y change de backend entre deux requêtes (il ne protège rien), et
 * le client de migration prenait une place du pool déjà saturé.
 */
describe('resolveDirectConnection — la connexion directe/session hors pooler transaction', () => {
  const base = {
    POSTGRES_HOST: 'aws-0-eu-west-1.pooler.supabase.com',
    POSTGRES_PORT: '6543',
    POSTGRES_USER: 'postgres.ref',
    POSTGRES_PASSWORD: 'secret',
    POSTGRES_DB: 'postgres',
  }

  it('sans POSTGRES_DIRECT_PORT : comportement INCHANGÉ (mêmes hôte et port que l’API), direct=false', () => {
    const cfg = resolveDirectConnection(base)
    expect(cfg).toMatchObject({ host: base.POSTGRES_HOST, port: 6543, user: 'postgres.ref', direct: false })
  })

  it('POSTGRES_DIRECT_PORT posé : même hôte, port direct (5432 = mode session Supavisor), direct=true', () => {
    const cfg = resolveDirectConnection({ ...base, POSTGRES_DIRECT_PORT: '5432' })
    expect(cfg).toMatchObject({ host: base.POSTGRES_HOST, port: 5432, direct: true })
  })

  it('POSTGRES_DIRECT_HOST posé : l’hôte direct remplace l’hôte du pooler', () => {
    const cfg = resolveDirectConnection({ ...base, POSTGRES_DIRECT_HOST: 'db.ref.supabase.co' })
    expect(cfg).toMatchObject({ host: 'db.ref.supabase.co', port: 6543, direct: true })
  })

  it('un port direct illisible n’est pas deviné : comportement inchangé', () => {
    const cfg = resolveDirectConnection({ ...base, POSTGRES_DIRECT_PORT: 'abc' })
    expect(cfg).toMatchObject({ port: 6543, direct: false })
  })

  it('SSL en production seulement, comme le reste de l’API', () => {
    expect(resolveDirectConnection({ ...base, NODE_ENV: 'production' }).ssl).toEqual({ rejectUnauthorized: false })
    expect(resolveDirectConnection(base).ssl).toBe(false)
  })

  it('l’avertissement nomme la variable manquante quand rien n’est posé, et se tait sinon', () => {
    expect(directConnectionWarning(resolveDirectConnection(base))).toMatch(/POSTGRES_DIRECT_PORT/)
    expect(directConnectionWarning(resolveDirectConnection({ ...base, POSTGRES_DIRECT_PORT: '5432' }))).toBeNull()
  })

  it('l’avertissement ne porte JAMAIS le mot de passe', () => {
    expect(directConnectionWarning(resolveDirectConnection(base))).not.toContain('secret')
  })
})

describe('DIRECT_SESSION_SETTINGS — réglages de la session de migration', () => {
  it('lock_timeout court (échec clair au lieu d’une file) et statement_timeout levé', () => {
    expect(DIRECT_SESSION_SETTINGS).toEqual(["SET lock_timeout = '10s'", 'SET statement_timeout = 0'])
  })

  it('applyDirectSessionSettings joue chaque réglage sur le client, dans l’ordre', async () => {
    const sent: string[] = []
    await applyDirectSessionSettings({ query: async (sql: string) => void sent.push(sql) })
    expect(sent).toEqual([...DIRECT_SESSION_SETTINGS])
  })
})
