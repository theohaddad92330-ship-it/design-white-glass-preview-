import { LIVE_STAGES } from '@bellum/contracts'
import { MissionScoresService } from './mission-scores.service'

/**
 * La ligne ESPÉRÉE du prévisionnel, et les stades qu'elle compte (D52, 26/08).
 *
 * Elle écrivait sa propre liste — `stage NOT IN ('won','lost','dormant')` — à
 * côté de quatre autres requêtes qui écrivaient la leur, dont deux GARDAIENT
 * `dormant`. Cinq listes recopiées à la main sur la même notion : c'est la
 * définition d'un réglage qui vit à cinq endroits, et celle qui dérive en
 * premier est celle que personne ne relit.
 *
 * Ce que ce test fige, ce n'est PAS la conversion : c'est la VALEUR. Un
 * prévisionnel ne compte pas ce qui dort — la mise en veille n'attend rien de
 * personne, et l'espéré gonflé d'un montant que personne ne va chercher est
 * exactement le chiffre sur lequel quelqu'un construit un budget.
 */
describe('MissionScoresService — les stades de la ligne espérée', () => {
  function serviceWith() {
    const query = jest.fn().mockResolvedValue([])
    const service = new MissionScoresService({ manager: { query } } as never)
    return { service, query }
  }

  /** La requête « espérée » : la seule des trois qui lit `opportunities`. */
  async function hopedSql(): Promise<string> {
    const { service, query } = serviceWith()
    // ⚠️ `null` en troisième position depuis le 01/09/2026 : la SOCIÉTÉ s'insère
    // avant `now`, et « toutes les sociétés » est le défaut. La ligne espérée
    // ne la reçoit de toute façon jamais — une opportunité n'a pas encore de
    // mission, donc pas de société : c'est ce que ce fichier garde.
    await service.forecast({ kind: 'workspace', workspaceId: 'ws-1' }, 3, null, new Date('2026-08-28T00:00:00.000Z'))
    const calls = query.mock.calls as [string, unknown[]][]
    const hoped = calls.map(([sql]) => sql).filter(sql => sql.includes('FROM opportunities'))
    // La garde LIT quelque chose : sans cette requête, tout le reste du fichier
    // passerait au vert sur du vide.
    expect(hoped).toHaveLength(1)
    return hoped[0] as string
  }

  it('compte les stades ENCORE EN JEU du contrat, pas une liste recopiée', async () => {
    const sql = await hopedSql()
    expect(LIVE_STAGES.length).toBeGreaterThan(0)
    for (const stage of LIVE_STAGES) expect(sql).toContain(`'${stage}'`)
  })

  it('laisse `dormant` DEHORS — une veille n’est pas de l’espéré', async () => {
    const sql = await hopedSql()
    expect(sql).not.toContain("'dormant'")
    expect(sql).not.toContain("'won'")
    expect(sql).not.toContain("'lost'")
  })
})
