import { SAVED_VIEW_ALERT_CHANNELS, SAVED_VIEW_ALERT_FREQUENCIES } from '@bellum/contracts'
import type { QueryRunner } from 'typeorm'
import { DiscoverSavedSearches1793700500000 } from '../1793700500000-DiscoverSavedSearches'

/**
 * ⚠️ Les scopes attendus ci-dessous sont un INSTANTANÉ délibéré, pas
 * `SAVED_VIEW_SCOPES` importé en direct — corrigé le 25/09/2026 (issue #3001).
 * Cette migration a élargi `saved_views_scope_check` à SIX scopes le
 * 15/09/2026 ; `projects_pipe` n'a rejoint l'énumération TypeScript que le
 * 17/09/2026, par une migration SÉPARÉE et POSTÉRIEURE
 * (`SavedViewsProjectsPipeReissued`). Importer l'enum en direct faisait de ce
 * test un test mouvant : il exigeait que CETTE migration, qui n'a jamais connu
 * `projects_pipe`, contienne quand même toute valeur qu'un enum VIVANT
 * porterait un jour — un test qui casse à chaque scope ajouté par n'importe
 * quelle migration future, jamais la faute de celle-ci.
 */
const SCOPES_KNOWN_AT_THIS_MIGRATION = ['accounts', 'contacts', 'projects', 'talents', 'missions', 'discover'] as const

async function upQueries(): Promise<string[]> {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql.replace(/\s+/g, ' ').trim())
      return []
    }),
  } as unknown as QueryRunner
  await new DiscoverSavedSearches1793700500000().up(runner)
  return queries
}

/**
 * #2151.3 / .6 / .7 / .12 — la contrainte s'ÉLARGIT avant le code qui écrit.
 *
 * Le défaut que GA-11 / GA-12 gardent est arrivé deux fois dans ce dépôt : une
 * valeur ajoutée proprement au TypeScript, écrite dans une colonne dont le
 * `CHECK` ne la connaissait pas, et l'erreur avalée en « impossible de… ».
 */
describe('DiscoverSavedSearches1793700500000', () => {
  it('élargit `saved_views_scope_check` à TOUTE la taxonomie, `discover` compris (GA-12)', async () => {
    const sql = (await upQueries()).join('\n')
    const constraint = sql.split('CONSTRAINT ').find(part => part.startsWith('saved_views_scope_check')) ?? ''
    for (const scope of SCOPES_KNOWN_AT_THIS_MIGRATION) expect(constraint).toContain(`'${scope}'`)
  })

  it('n’enlève AUCUN scope existant — une contrainte ne rétrécit jamais (GA-11)', async () => {
    const sql = (await upQueries()).join('\n')
    const constraint = sql.split('CONSTRAINT ').find(part => part.startsWith('saved_views_scope_check')) ?? ''
    for (const scope of ['accounts', 'contacts', 'projects', 'talents', 'missions']) {
      expect(constraint).toContain(`'${scope}'`)
    }
  })

  it('n’ajoute que des colonnes NULLABLES ou à défaut — porte « ajout seulement »', async () => {
    const sql = (await upQueries()).join('\n')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS objective text')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS last_run_at timestamptz')
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS alert_frequency text NOT NULL DEFAULT 'manual'")
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS alert_channel text')
    // Une colonne NOT NULL sans défaut casserait les lignes déjà écrites.
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS (objective|alert_channel|last_run_at)[^,\n]*NOT NULL/)
  })

  it('borne les deux énumérations neuves sur tout leur contrat (GA-12)', async () => {
    const sql = (await upQueries()).join('\n')
    const byName = (name: string) => sql.split('CONSTRAINT ').find(part => part.startsWith(name)) ?? ''
    for (const value of SAVED_VIEW_ALERT_FREQUENCIES) {
      expect(byName('saved_views_alert_frequency_check')).toContain(`'${value}'`)
    }
    for (const value of SAVED_VIEW_ALERT_CHANNELS) {
      expect(byName('saved_views_alert_channel_check')).toContain(`'${value}'`)
    }
    // `null` = aucune alerte, et c'est un état distinct de « dans l'application ».
    expect(byName('saved_views_alert_channel_check')).toContain('alert_channel IS NULL')
  })
})
