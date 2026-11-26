import { INTAKE_STAGES, UNDECIDED_STAGES } from '@bellum/contracts'
import { CrmKpisService } from './crm-kpis.service'

/**
 * Les deux KPI CRM qui filtrent sur le stade d'un projet (D52, 26/08).
 *
 * Deux des cinq listes écrites à la main vivaient ici, et l'une d'elles portait
 * un stade FANTÔME : `to_qualify`. Ce n'est pas un stade de projet — c'est un
 * statut de BESOIN (`project_needs.status`), reste du cycle FR d'avant le pivot
 * Projet du 17/08. La contrainte `opportunities_stage_check` interdit sa
 * présence dans la colonne, donc l'exclure ne retirait rien : ces tests le
 * disent au lieu de le supposer.
 *
 * ⚠️ Les deux KPI ne demandent PAS la même chose, et l'écart est voulu :
 *  - « projets qualifiés » = tout ce qui n'est plus à l'admission (y compris
 *    les projets clos : un projet signé a bien été qualifié un jour) ;
 *  - « âge d'étape » = tout ce dont l'issue n'est pas connue, `dormant`
 *    compris — c'est précisément un projet qui dort dont on veut voir l'âge.
 */
describe('CrmKpisService — les stades des KPI de projets', () => {
  async function stageFilteringSqls(): Promise<string[]> {
    const query = jest.fn().mockResolvedValue([])
    const service = new CrmKpisService({ manager: { query } } as never)
    await service.overview('ws-1', 30)
    const calls = query.mock.calls as [string, unknown[]][]
    return calls.map(([sql]) => sql).filter(sql => sql.includes('FROM opportunities') && sql.includes('stage'))
  }

  async function only(predicate: (sql: string) => boolean): Promise<string> {
    const matching = (await stageFilteringSqls()).filter(predicate)
    // La garde LIT : une seule requête porte chaque filtre de stade. Sans cela,
    // tout le fichier passerait au vert sur une liste vide.
    expect(matching).toHaveLength(1)
    return matching[0] as string
  }

  /** « Projets qualifiés » — ceux qui ne sont plus à l'admission. */
  const qualified = () => only(sql => !sql.includes('stage_entered_at'))

  /** « Âge d'étape » — ceux dont l'issue n'est pas connue. */
  const stageAges = () => only(sql => sql.includes('stage_entered_at'))

  it('mesure les projets qualifiés en écartant les stades d’ADMISSION du contrat', async () => {
    const sql = await qualified()
    expect(INTAKE_STAGES.length).toBeGreaterThan(0)
    for (const stage of INTAKE_STAGES) expect(sql).toContain(`'${stage}'`)
  })

  it('ne mentionne plus `to_qualify` — ce n’est pas un stade de projet', async () => {
    expect(await qualified()).not.toContain('to_qualify')
    expect(await stageAges()).not.toContain('to_qualify')
  })

  it('mesure l’âge d’étape sur tout ce dont l’issue n’est pas tranchée', async () => {
    const sql = await stageAges()
    expect(UNDECIDED_STAGES.length).toBeGreaterThan(0)
    for (const stage of UNDECIDED_STAGES) expect(sql).toContain(`'${stage}'`)
    // `dormant` DEDANS : un projet qui dort depuis six mois est exactement ce
    // que cet indicateur doit rendre visible.
    expect(sql).toContain("'dormant'")
    expect(sql).not.toContain("'won'")
    expect(sql).not.toContain("'lost'")
  })
})
