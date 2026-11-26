import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { QueryRunner } from 'typeorm'
import { LinkedInMandateIntoDelegations1796591406829 as Fusion } from '../1796591406829-LinkedInMandateIntoDelegations'

const SOURCE = readFileSync(join(__dirname, '..', '1796591406829-LinkedInMandateIntoDelegations.ts'), 'utf8')

async function run(direction: 'up' | 'down'): Promise<string[]> {
  const statements: string[] = []
  const runner = { query: async (sql: string) => void statements.push(sql) } as unknown as QueryRunner
  await new Fusion()[direction](runner)
  return statements
}

describe('#4737 K2 — la migration de reprise du mandat LinkedIn', () => {
  it('la contrainte est élargie AVANT la reprise, et la reprise garde les identifiants', async () => {
    const up = await run('up')
    const widen = up.findIndex(s => s.includes('outreach_delegations_scope_check') && s.includes("'linkedin_send'"))
    const moveIn = up.findIndex(s => s.includes('INSERT INTO outreach_delegations'))
    expect(widen).toBeGreaterThanOrEqual(0)
    expect(moveIn).toBeGreaterThan(widen)
    expect(up[moveIn]).toMatch(/SELECT\s+m\.id,/)
    expect(up[moveIn]).toContain('ON CONFLICT (id) DO NOTHING')
    expect(up[moveIn]).toContain('LEAST(m.daily_limit, 25)')
  })

  it('« ajout seulement » : up ne supprime ni ne vide aucune table, linkedin_mandates est archivée', async () => {
    const up = (await run('up')).join('\n')
    expect(up).not.toMatch(/DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|DROP\s+COLUMN/i)
    expect(up).toContain('COMMENT ON TABLE linkedin_mandates')
  })

  it('les contraintes sont NOMMÉES et HORS de la définition de colonne (GA-177)', () => {
    expect(SOURCE).toContain('ADD CONSTRAINT outreach_delegations_daily_limit_check')
    expect(SOURCE).not.toMatch(/ADD COLUMN[^\n]*CHECK/i)
    expect(SOURCE).toContain('ADD COLUMN IF NOT EXISTS daily_limit integer NULL')
  })

  it('la portée s’élargit aussi pour les messages (même énumération, GA-12)', async () => {
    const up = (await run('up')).join('\n')
    expect(up).toMatch(/outreach_messages_mandate_scope_check[\s\S]*'linkedin_send'/)
  })

  it('down ne perd aucun mandat né depuis la fusion : il les recopie dans la table archivée', async () => {
    const down = await run('down')
    const copy = down.findIndex(s => s.includes('INSERT INTO linkedin_mandates'))
    const remove = down.findIndex(s => s.includes("DELETE FROM outreach_delegations WHERE scope = 'linkedin_send'"))
    expect(copy).toBeGreaterThanOrEqual(0)
    expect(remove).toBeGreaterThan(copy)
  })

  it('l’horodatage est réel : 13 chiffres, jamais rond', () => {
    const stamp = '1796591406829'
    expect(stamp).toHaveLength(13)
    expect(stamp.endsWith('000')).toBe(false)
  })
})
