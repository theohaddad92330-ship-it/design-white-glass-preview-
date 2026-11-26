import { LEAD_DISMISS_REASONS } from '@bellum/contracts'
import type { QueryRunner } from 'typeorm'
import { QualificationLeadDecisions1794100418506 } from '../1794100418506-QualificationLeadDecisions'

/**
 * #2172.42 → .49 / .54 — LA TABLE DES DÉCISIONS PRISES SUR UNE PISTE.
 *
 * Elle est posée AVANT le code qui l'écrit (GA-11 / GA-12), et elle tient
 * elle-même les deux règles qu'un chemin d'écriture fautif pourrait défaire :
 * un écartement porte un MOTIF, et sa portée est l'ESPACE — la base refuse une
 * ligne « globale », donc même une écriture directe ne peut pas faire d'un
 * refus local un fait de marché.
 */

/** Capture chaque instruction SQL émise (aucune base réelle n'est nécessaire). */
async function ranQueries(direction: 'up' | 'down' = 'up'): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new QualificationLeadDecisions1794100418506()[direction](runner)
  return queries
}

const inList = (values: readonly string[]) => `IN (${values.map(v => `'${v}'`).join(', ')})`

describe('QualificationLeadDecisions1794100418506 — #2172.42-.49 / .54', () => {
  it('crée la table sans jamais toucher à une autre — porte « ajout seulement »', async () => {
    const sql = (await ranQueries()).join('\n')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS qualification_lead_decisions')
    expect(sql).not.toContain('DROP TABLE')
    expect(sql).not.toContain('ALTER TABLE opportunities')
  })

  it('couvre EXACTEMENT les sept motifs du contrat (GA-12)', async () => {
    const sql = (await ranQueries()).join('\n')
    expect(sql).toContain(
      `CONSTRAINT qualification_lead_decisions_reason_check CHECK (reason IS NULL OR reason ${inList(LEAD_DISMISS_REASONS)})`,
    )
  })

  it('refuse EN BASE une décision hors de l’espace — la portée n’est pas qu’une convention', async () => {
    const sql = (await ranQueries()).join('\n')
    expect(sql).toContain("CONSTRAINT qualification_lead_decisions_scope_check CHECK (scope = 'workspace')")
  })

  it('exige un motif pour un écartement, une échéance pour une veille', async () => {
    const sql = (await ranQueries()).join('\n')
    expect(sql).toContain(
      "CONSTRAINT qualification_lead_decisions_shape_check CHECK ( (decision = 'dismissed' AND reason IS NOT NULL AND snoozed_until IS NULL) OR (decision = 'snoozed' AND reason IS NULL AND snoozed_until IS NOT NULL) )",
    )
  })

  it('une seule décision par piste et par espace — la dernière remplace la précédente', async () => {
    const sql = (await ranQueries()).join('\n')
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS qualification_lead_decisions_key_idx ON qualification_lead_decisions (workspace_id, lead_key)',
    )
  })

  it('se défait sans perte : `down` retire la table qu’elle a créée, et rien d’autre', async () => {
    const sql = (await ranQueries('down')).join('\n')
    expect(sql).toContain('DROP TABLE IF EXISTS qualification_lead_decisions')
    expect(sql.split('DROP TABLE').length - 1).toBe(1)
  })
})
