import { duplicatePairKey } from '@bellum/contracts'
import {
  CRM_FUSION_FAMILIES,
  crmFusionMoveSql,
  crmFusionUndoSql,
  planCrmFusionPairs,
  type FusionCandidate,
} from './account-crm-fusion'

function row(overrides: Partial<FusionCandidate>): FusionCandidate {
  return {
    id: 'x',
    company_name: 'Veepee',
    siren: null,
    status: 'completed',
    has_runs: false,
    updated_at: null,
    crm_side: false,
    commercial_status: 'inbox',
    ...overrides,
  }
}

const crm = row({ id: 'crm', company_name: 'VEEPEE', status: 'analyzing', crm_side: true })
const analysed = row({ id: 'ana', company_name: 'Veepee SAS', has_runs: true })
const none = { humanDecidedPairKeys: new Set<string>(), limit: 25 }

describe('#4603 — planCrmFusionPairs : la paire compte-CRM ↔ compte-analyse, et RIEN d’autre', () => {
  it('apparie la fiche CRM sans run et le compte analysé de la même société (clé nom normalisé)', () => {
    expect(planCrmFusionPairs([crm, analysed], none)).toEqual({
      pairs: [
        {
          keptId: 'ana',
          keptName: 'Veepee SAS',
          absorbedId: 'crm',
          absorbedName: 'VEEPEE',
          basis: 'name',
          key: 'veepee',
        },
      ],
      ambiguous: 0,
      humanDecided: 0,
      deferred: 0,
    })
  })

  it('le SIREN d’abord, même quand le nom du CRM n’est pas la raison sociale', () => {
    const plan = planCrmFusionPairs(
      [row({ ...crm, company_name: 'vente-privee', siren: '440297785' }), row({ ...analysed, siren: '440297785' })],
      none,
    )
    expect(plan.pairs[0]).toEqual(expect.objectContaining({ basis: 'siren', key: '440297785', keptId: 'ana' }))
  })

  it('NE FUSIONNE PAS deux homonymes d’origines quelconques (aucun côté CRM) — ils restent proposés', () => {
    const plan = planCrmFusionPairs([row({ id: 'a', has_runs: true }), row({ id: 'b', has_runs: false })], none)
    expect(plan.pairs).toEqual([])
  })

  it('NE FUSIONNE PAS deux fiches venues du CRM entre elles (aucun côté analysé)', () => {
    expect(planCrmFusionPairs([crm, row({ id: 'crm2', crm_side: true })], none).pairs).toEqual([])
  })

  it('un compte CRM déjà analysé (il porte un run) n’est pas une coquille à absorber', () => {
    expect(planCrmFusionPairs([row({ ...crm, has_runs: true }), analysed], none).pairs).toEqual([])
  })

  it('deux comptes analysés pour la même clé : AMBIGU, compté, rien fusionné', () => {
    const plan = planCrmFusionPairs([crm, analysed, row({ id: 'ana2', has_runs: true })], none)
    expect(plan).toEqual(expect.objectContaining({ pairs: [], ambiguous: 1 }))
  })

  it('un SIREN contradictoire n’apparie jamais sur le nom (ROCHE ≠ ROCHE BOBOIS)', () => {
    const plan = planCrmFusionPairs(
      [row({ ...crm, siren: '493229280' }), row({ ...analysed, siren: '552012031' })],
      none,
    )
    expect(plan.pairs).toEqual([])
  })

  it('une paire déjà tranchée par un humain (annulée, écartée) n’est jamais refusionnée — comptée', () => {
    const plan = planCrmFusionPairs([crm, analysed], {
      humanDecidedPairKeys: new Set([duplicatePairKey('crm', 'ana')]),
      limit: 25,
    })
    expect(plan).toEqual(expect.objectContaining({ pairs: [], humanDecided: 1 }))
  })

  it('une fiche CRM TRIÉE à la main (étape commerciale différente) gagne : rien fusionné par-dessus', () => {
    const plan = planCrmFusionPairs([row({ ...crm, commercial_status: 'client' }), analysed], none)
    expect(plan).toEqual(expect.objectContaining({ pairs: [], humanDecided: 1 }))
  })

  it('jamais tout le parc d’un coup : la borne du passage, le reste DIT en attente', () => {
    const rows = [
      crm,
      analysed,
      row({ id: 'crm-b', company_name: 'Decathlon', crm_side: true, status: 'imported' }),
      row({ id: 'ana-b', company_name: 'DECATHLON', has_runs: true }),
    ]
    const plan = planCrmFusionPairs(rows, { humanDecidedPairKeys: new Set(), limit: 1 })
    expect(plan.pairs).toHaveLength(1)
    expect(plan.deferred).toBe(1)
  })
})

describe('#4603 — le SQL des familles déplacées', () => {
  it('l’union : contacts, affaires, activités, runs, notes et liens CRM', () => {
    expect(CRM_FUSION_FAMILIES.map(f => f.family)).toEqual([
      'contacts',
      'deals',
      'crm_deals',
      'crm_deal_facts',
      'activities',
      'crm_activities',
      'runs',
      'notes',
      'crm_links',
    ])
  })

  it.each(CRM_FUSION_FAMILIES.map(f => [f.family, f] as const))(
    '%s : chaque déplacement et chaque retour sont bornés à l’espace ($1) et à la fiche, jamais un id seul',
    (_name, family) => {
      expect(crmFusionMoveSql(family)).toMatch(/workspace_id (= \$1|IS NOT DISTINCT FROM \$1)/)
      expect(crmFusionMoveSql(family)).toContain(`t.${family.column} = $3`)
      expect(crmFusionUndoSql(family)).toMatch(/workspace_id (= \$1|IS NOT DISTINCT FROM \$1)/)
      expect(crmFusionUndoSql(family)).toContain('t.id = ANY($4::uuid[])')
    },
  )

  it('un contact homonyme d’un contact de la fiche gardée reste sur la fiche archivée (jamais écrasé)', () => {
    const contacts = CRM_FUSION_FAMILIES.find(f => f.family === 'contacts')!
    expect(crmFusionMoveSql(contacts)).toContain(
      'bellum_normalize_name(kept.full_name) = bellum_normalize_name(t.full_name)',
    )
  })
})
