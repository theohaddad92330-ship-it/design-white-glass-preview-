import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { LAURA_INTERVENTIONS } from '@bellum/contracts'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { LauraAcceptanceService } from './laura-acceptance.service'

const NOW = new Date('2026-08-30T12:00:00.000Z')

type Row = { intervention_key: string; reaction: string | null }

function makeService(rows: Row[]) {
  const interventions = {
    find: jest.fn().mockResolvedValue(rows),
  }
  return { interventions }
}

async function build(mocks: ReturnType<typeof makeService>) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      LauraAcceptanceService,
      { provide: getRepositoryToken(LauraInterventionEntity), useValue: mocks.interventions },
    ],
  }).compile()
  return moduleRef.get(LauraAcceptanceService)
}

describe('LauraAcceptanceService — ce qu’on accepte de Laura, par surface (D643-D648)', () => {
  afterEach(() => {
    delete process.env['OBSERVABILITY_ALERT_MIN_SAMPLE']
  })

  it('compte une acceptation et un rejet enregistrés', async () => {
    process.env['OBSERVABILITY_ALERT_MIN_SAMPLE'] = '2'
    const rows: Row[] = [
      { intervention_key: 'crm_not_connected', reaction: 'acted' },
      { intervention_key: 'crm_not_connected', reaction: 'refused' },
    ]
    const laura = await build(makeService(rows))
    const bySurface = await laura.bySurface(NOW)
    expect(bySurface.get('crm_not_connected')).toEqual({ state: 'measured', acceptedPercent: 50, sample: 2 })
  })

  it('rend un taux exploitable sur une surface qui a assez d’échantillon', async () => {
    process.env['OBSERVABILITY_ALERT_MIN_SAMPLE'] = '20'
    const rows: Row[] = [
      ...Array(3).fill({ intervention_key: 'no_connector', reaction: 'acted' }),
      ...Array(17).fill({ intervention_key: 'no_connector', reaction: 'refused' }),
    ]
    const laura = await build(makeService(rows))
    const bySurface = await laura.bySurface(NOW)
    expect(bySurface.get('no_connector')).toEqual({ state: 'measured', acceptedPercent: 15, sample: 20 })
  })

  it('« non mesuré » sur une surface sans la moindre proposition dans la fenêtre', async () => {
    process.env['OBSERVABILITY_ALERT_MIN_SAMPLE'] = '20'
    const laura = await build(makeService([]))
    const bySurface = await laura.bySurface(NOW)
    // Chaque clé du CATALOGUE porte une entrée — même celles qui n'ont rien
    // proposé. C'est ce qui distingue « je n'ai pas cette clé » (un bug) de
    // « cette surface n'a rien à mesurer » (le cas normal, nommé).
    expect(bySurface.size).toBe(LAURA_INTERVENTIONS.length)
    expect(bySurface.get('trial_ending')).toEqual({ state: 'unmeasured', reason: 'no_observation', sample: 0 })
  })

  it('« échantillon insuffisant » nommé comme tel sur une surface qui en a trop peu', async () => {
    process.env['OBSERVABILITY_ALERT_MIN_SAMPLE'] = '20'
    const rows: Row[] = [
      { intervention_key: 'long_bench', reaction: 'acted' },
      { intervention_key: 'long_bench', reaction: 'refused' },
    ]
    const laura = await build(makeService(rows))
    const bySurface = await laura.bySurface(NOW)
    expect(bySurface.get('long_bench')).toEqual({ state: 'unmeasured', reason: 'sample_too_small', sample: 2 })
  })

  it('n’enregistre aucune issue pour une intervention sans réaction — ni acceptée ni rejetée', async () => {
    process.env['OBSERVABILITY_ALERT_MIN_SAMPLE'] = '1'
    const rows: Row[] = [
      { intervention_key: 'no_skills_dossier', reaction: null },
      { intervention_key: 'no_skills_dossier', reaction: 'acted' },
    ]
    const laura = await build(makeService(rows))
    const bySurface = await laura.bySurface(NOW)
    // Une seule issue exploitable : la ligne `null` n'est ni acceptée ni
    // rejetée, elle sort du dénominateur (D644).
    expect(bySurface.get('no_skills_dossier')).toEqual({ state: 'measured', acceptedPercent: 100, sample: 1 })
  })

  it('lit sur une fenêtre de 30 jours glissants, sans borne d’espace — décision GLOBALE (D645)', async () => {
    // La question posée par ce compteur — « cette surface mérite-t-elle encore
    // d'interrompre ? » — est une décision de CATALOGUE, pas une décision par
    // espace : un seul espace propose trop rarement une surface donnée pour
    // jamais atteindre l'échantillon minimum en 30 jours (le plafond
    // d'interruption est de 1 à 5 par JOUR, toutes surfaces confondues). La
    // lecture ne filtre donc PAS par `workspace_id` — voir la doc du service.
    process.env['OBSERVABILITY_ALERT_MIN_SAMPLE'] = '1'
    const mocks = makeService([{ intervention_key: 'no_routine_enabled', reaction: 'acted' }])
    const laura = await build(mocks)
    await laura.bySurface(NOW)
    const call = mocks.interventions.find.mock.calls[0]![0] as { where: Record<string, unknown> }
    expect(call.where).not.toHaveProperty('workspace_id')
  })
})
