import { LIVE_STAGES } from '@bellum/contracts'
import { ManagerService } from './manager.service'

/**
 * Le pipeline partagé VALORISÉ (cockpit manager, bloc §10) et les stades qu'il
 * a le droit d'additionner.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI ÉTAIT MESURÉ AVANT LE 29/08/2026
 * ─────────────────────────────────────────────────────────────────────────────
 * La requête n'avait AUCUN prédicat de stade. Les seuls filtres étaient l'espace,
 * `a.status <> 'deleted'` et `a.commercial_status <> 'archived'` : tous les
 * stades revenaient — détecté, qualifié, négociation, **signé, perdu, dormant** —
 * et `total_amount` les additionnait tous en un seul chiffre, affiché en gras et
 * en euros sous le titre « Pipeline partagé ».
 *
 * Un montant PERDU dans une valeur de pipeline n'a aucune lecture défendable :
 * le chiffre ne mesure ni ce qui reste à gagner (il contient du gagné et du
 * perdu), ni ce qui a été fait (il contient de l'ouvert). Il ne baisse jamais.
 * C'est exactement la règle du CRM de Louis, feuille `ANOMALIES CRM` du 16/08 :
 * « consolider SANS ADDITIONNER LES STATUTS ».
 *
 * Le plus instructif : `openOpportunitiesByOwner`, VINGT LIGNES au-dessus dans
 * le même fichier, filtre déjà sur `LIVE_STAGES` avec sa raison écrite (« Seuls
 * les stades ENCORE EN JEU comptent »). Le COMPTE de la charge était borné ; le
 * MONTANT juste à côté ne l'était pas. La règle existait, elle n'était pas
 * appliquée au chiffre le plus visible du bloc.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA GARDE LIT LE SQL ET PAS LE RÉSULTAT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le service ne refiltre rien en mémoire : il somme ce que la base lui rend. Un
 * test qui vérifierait le total sur des lignes truquées passerait au vert avec
 * une requête sans prédicat, simplement parce que la fixture n'aurait pas mis de
 * ligne perdue dedans — c'est d'ailleurs exactement ce que faisait
 * `manager.service.spec.ts` (« 30000 + 50000 + 0 = 80000 » sur trois stades
 * choisis à la main). La seule chose vérifiable ici est donc le PÉRIMÈTRE
 * demandé à la base.
 */
describe('ManagerService — les stades du pipeline valorisé', () => {
  async function pipelineSql(): Promise<string> {
    const query = jest.fn().mockResolvedValue([])
    const service = new ManagerService({ query } as never, {} as never)
    await service['pipelineValue']('ws-1', null)
    const calls = query.mock.calls as [string, unknown[]][]
    // La garde LIT : une requête, et c'est bien celle qui valorise les projets.
    expect(calls).toHaveLength(1)
    const sql = calls[0]?.[0] as string
    expect(sql).toContain('FROM opportunities')
    expect(sql).toContain('SUM(o.estimated_amount)')
    return sql
  }

  it('ne valorise que les stades ENCORE EN JEU du contrat', async () => {
    const sql = await pipelineSql()
    expect(LIVE_STAGES.length).toBeGreaterThan(0)
    for (const stage of LIVE_STAGES) expect(sql).toContain(`'${stage}'`)
  })

  it('n’additionne NI le signé, NI le perdu, NI le dormant au pipeline', async () => {
    const sql = await pipelineSql()
    expect(sql).not.toContain("'won'")
    expect(sql).not.toContain("'lost'")
    expect(sql).not.toContain("'dormant'")
  })
})
