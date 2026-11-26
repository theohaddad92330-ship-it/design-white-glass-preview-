import { GUARDS_METADATA } from '@nestjs/common/constants'
import type { Repository } from 'typeorm'
import { InternalSecretGuard } from '../../common/internal-secret.guard'
import type { AccountFeedbackEntity } from '../../database/entities/account-feedback.entity'
import { FirstProofRecetteService } from './first-proof-recette.service'
import { InternalFirstProofRecetteController } from './internal-first-proof-recette.controller'

/**
 * #2076.13 — LA RECETTE PRODUIT de la « première preuve » : combien de
 * verdicts « juste / partiel / faux / manquant » sur des comptes que
 * l'utilisateur connaît déjà — lue tous espaces confondus, mais SEULEMENT sur
 * les lignes que leur espace a ouvertes à la généralisation (GA-47).
 */
type Row = { reuse_scope: string; verdict: string; target: string; workspace_id: string; created_at: Date }

/** Un faux dépôt qui REJOUE le SQL sur des lignes en mémoire : le filtre de
 *  portée, de cible et de fenêtre doit être dans la requête, pas deviné. */
function repoOver(rows: Row[]) {
  const sqls: string[] = []
  const repo = {
    query: async (sql: string, params: unknown[]) => {
      sqls.push(sql)
      const since = params[0] as Date
      const inWindow = rows.filter(
        row =>
          row.target === 'global' &&
          ['juste', 'partiel', 'faux', 'manquant'].includes(row.verdict) &&
          row.created_at >= since,
      )
      if (/GROUP BY f\.verdict/.test(sql)) {
        const shared = inWindow.filter(row => row.reuse_scope === 'generalized_only')
        const counts = new Map<string, number>()
        for (const row of shared) counts.set(row.verdict, (counts.get(row.verdict) ?? 0) + 1)
        return [...counts].map(([verdict, n]) => ({ verdict, n: String(n) }))
      }
      const shared = inWindow.filter(row => row.reuse_scope === 'generalized_only')
      return [
        {
          workspaces: String(new Set(shared.map(row => row.workspace_id)).size),
          withheld: String(inWindow.filter(row => row.reuse_scope === 'tenant_private').length),
        },
      ]
    },
  } as unknown as Repository<AccountFeedbackEntity>
  return { repo, sqls }
}

const NOW = new Date('2026-09-23T12:00:00Z')
const recent = new Date('2026-09-20T12:00:00Z')
const old = new Date('2026-06-01T12:00:00Z')

describe('#2076.13 — FirstProofRecetteService', () => {
  it('compte les verdicts PARTAGÉS et nomme ce qui reste privé, jamais un espace', async () => {
    const { repo, sqls } = repoOver([
      { reuse_scope: 'generalized_only', verdict: 'juste', target: 'global', workspace_id: 'ws-a', created_at: recent },
      { reuse_scope: 'generalized_only', verdict: 'juste', target: 'global', workspace_id: 'ws-b', created_at: recent },
      {
        reuse_scope: 'generalized_only',
        verdict: 'manquant',
        target: 'global',
        workspace_id: 'ws-a',
        created_at: recent,
      },
      { reuse_scope: 'tenant_private', verdict: 'faux', target: 'global', workspace_id: 'ws-c', created_at: recent },
      // Hors axe « première preuve » : un pouce sur un play, un verdict d'utilité.
      { reuse_scope: 'generalized_only', verdict: 'juste', target: 'play', workspace_id: 'ws-a', created_at: recent },
      { reuse_scope: 'generalized_only', verdict: 'utile', target: 'global', workspace_id: 'ws-a', created_at: recent },
      // Hors fenêtre.
      { reuse_scope: 'generalized_only', verdict: 'faux', target: 'global', workspace_id: 'ws-a', created_at: old },
    ])
    const report = await new FirstProofRecetteService(repo).report(30, NOW)

    expect(report.windowDays).toBe(30)
    expect(report.verdicts).toEqual({ juste: 2, partiel: 0, faux: 0, manquant: 1 })
    expect(report.shared).toBe(3)
    expect(report.distinctWorkspaces).toBe(2)
    expect(report.withheldPrivate).toBe(1)
    // Aucun identifiant d'espace, aucun texte libre dans la réponse.
    expect(JSON.stringify(report)).not.toMatch(/ws-/)
    // GA-47 : chaque requête filtre sur la portée et ne nomme aucun texte libre.
    for (const sql of sqls) {
      expect(sql).toMatch(/reuse_scope/)
      expect(sql).not.toMatch(/\bnote\b|\btarget_ref\b/)
    }
  })

  it('sait dire NON — aucun retour partagé : « aucun », jamais un taux inventé', async () => {
    const { repo } = repoOver([
      { reuse_scope: 'tenant_private', verdict: 'juste', target: 'global', workspace_id: 'ws-a', created_at: recent },
    ])
    const report = await new FirstProofRecetteService(repo).report(undefined, NOW)
    expect(report.windowDays).toBe(90)
    expect(report.shared).toBe(0)
    expect(report.withheldPrivate).toBe(1)
    expect(report.verdicts).toEqual({ juste: 0, partiel: 0, faux: 0, manquant: 0 })
  })

  it('borne la fenêtre (1 à 365 jours)', async () => {
    const { repo } = repoOver([])
    expect((await new FirstProofRecetteService(repo).report(0, NOW)).windowDays).toBe(1)
    expect((await new FirstProofRecetteService(repo).report(5000, NOW)).windowDays).toBe(365)
  })

  it('la route est derrière InternalSecretGuard (cross-tenant par nature, opérateur seul)', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, InternalFirstProofRecetteController) as unknown[]
    expect(guards).toContain(InternalSecretGuard)
  })
})
