import { updateProjectStageSchema } from '@bellum/contracts'
import { ProjectsService } from './projects.service'

/**
 * #3246 / #3210.3 (lot W9 + lot cloud 14/10) — la stratégie, le modèle
 * d'achat et l'organisation de la décision se saisissent au geste de
 * clôture « perdu » (vocabulaires FERMÉS), sans jamais être devinés.
 */
describe('stratégie, modèle d’achat et organisation à la clôture (#3246)', () => {
  it('le schéma accepte les codes du vocabulaire et refuse tout le reste', () => {
    const ok = updateProjectStageSchema.safeParse({
      stage: 'lost',
      loss_reason_code: 'price',
      loss_reason: 'Prix',
      strategy: 'via_partenaire',
      buying_model: 'appel_offres',
      organisation: 'comite_restreint',
    })
    expect(ok.success).toBe(true)
    expect(
      updateProjectStageSchema.safeParse({ stage: 'lost', loss_reason_code: 'price', strategy: 'au_feeling' }).success,
    ).toBe(false)
    expect(updateProjectStageSchema.safeParse({ stage: 'won', buying_model: 'inventé' }).success).toBe(false)
    expect(updateProjectStageSchema.safeParse({ stage: 'won', organisation: 'tout_le_monde' }).success).toBe(false)
  })

  it('le service écrit les trois champs, et NE les efface pas quand ils ne sont pas fournis', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'p-1', account_id: 'a', label: 'x', stage: 'lost' }])
    const service = new ProjectsService({ manager: { query } } as never)

    await service.updateStage('p-1', 'w-1', 'lost', 'Prix', 'u-1', {
      strategy: 'via_partenaire',
      buying_model: null,
      organisation: 'comite_elargi',
    })

    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/strategy\s*=\s*COALESCE\(\$8::text, o\.strategy\)/)
    expect(sql).toMatch(/buying_model\s*=\s*COALESCE\(\$9::text, o\.buying_model\)/)
    expect(sql).toMatch(/organisation\s*=\s*COALESCE\(\$10::text, o\.organisation\)/)
    expect(params.slice(7, 10)).toEqual(['via_partenaire', null, 'comite_elargi'])
  })

  // #3989.9 (Louis 15/10/2026) — le motif de perte, liste FERMÉE commune ; effacé si le projet n'est plus perdu.
  it('#3989.9 — le service écrit le motif fermé sur « perdu » et l’efface en sortant de « perdu »', async () => {
    const query = jest.fn().mockResolvedValue([{ id: 'p-1', account_id: 'a', label: 'x', stage: 'lost' }])
    const service = new ProjectsService({ manager: { query } } as never)
    await service.updateStage('p-1', 'w-1', 'lost', 'Budget gelé', 'u-1', { loss_reason_code: 'no_budget' })
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/loss_reason_code = CASE WHEN \$3 = 'lost' THEN \$11::text ELSE NULL END/)
    expect(params[10]).toBe('no_budget')
  })
})
