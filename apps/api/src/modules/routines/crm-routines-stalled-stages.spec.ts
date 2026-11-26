import { UNDECIDED_STAGES } from '@bellum/contracts'
import { CrmRoutinesService } from './crm-routines.service'

/**
 * Les projets IMMOBILES d'une routine de relance, et les stades qu'elle regarde
 * (D52, 26/08).
 *
 * ⚠️ Cette requête garde `dormant` DANS son périmètre, contrairement au
 * prévisionnel et au cockpit manager. Ce n'est pas une faute de frappe restée
 * là : une routine de relance existe PRÉCISÉMENT pour réveiller ce qui dort.
 * L'aligner sur « encore en jeu » rendrait muet le seul mécanisme capable de
 * sortir un projet de sa veille — et ça ne se verrait pas : la routine
 * continuerait de tourner, simplement sans jamais rien remonter.
 *
 * C'est cet ÉCART que ce test fige, pour qu'une prochaine « unification » le
 * casse en rouge plutôt qu'en silence.
 */
describe('CrmRoutinesService — les stades des projets immobiles', () => {
  async function stalledSql(): Promise<string> {
    const query = jest.fn().mockResolvedValue([])
    const service = new CrmRoutinesService({ manager: { query } } as never)
    await service.stalledProjects('ws-1', 21)
    const calls = query.mock.calls as [string, unknown[]][]
    // La garde LIT : sans cette requête, les assertions passeraient sur du vide.
    expect(calls).toHaveLength(1)
    const sql = calls[0]?.[0] as string
    expect(sql).toContain('FROM opportunities')
    return sql
  }

  it('regarde tout ce dont l’issue n’est pas tranchée, pas une liste recopiée', async () => {
    const sql = await stalledSql()
    expect(UNDECIDED_STAGES.length).toBeGreaterThan(0)
    for (const stage of UNDECIDED_STAGES) expect(sql).toContain(`'${stage}'`)
  })

  it('garde `dormant` DEDANS — une relance existe pour réveiller ce qui dort', async () => {
    const sql = await stalledSql()
    expect(sql).toContain("'dormant'")
  })

  it('écarte les deux issues CONNUES — on ne relance pas un projet signé ni perdu', async () => {
    const sql = await stalledSql()
    expect(sql).not.toContain("'won'")
    expect(sql).not.toContain("'lost'")
  })
})
