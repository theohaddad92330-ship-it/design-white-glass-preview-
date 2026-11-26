import { buildTechStructure } from './account-tech-structure'

const offer = (over: Record<string, unknown> = {}) => ({
  title: 'Consultant fonctionnel (H/F)',
  date: '2026-09-10',
  contract_type: 'CDI',
  url: 'https://offres.example/1',
  skills: [] as string[],
  ...over,
})

describe('buildTechStructure — la structure technique prouvée d’un compte (#4742)', () => {
  it('range une technologie nommée par une offre dans son axe, avec la preuve datée et le lien', () => {
    const result = buildTechStructure({
      jobSignals: [offer({ skills: ['Salesforce', 'SAP S/4HANA'] })],
    })
    const crm = result.axes.find(axis => axis.axis === 'crm')
    const erp = result.axes.find(axis => axis.axis === 'erp')
    expect(crm?.status).toBe('observed')
    expect(crm?.technologies[0]).toMatchObject({ name: 'Salesforce' })
    expect(crm?.technologies[0]?.proofs[0]).toEqual({
      kind: 'job_offer',
      observed_at: '2026-09-10',
      url: 'https://offres.example/1',
      label: 'Consultant fonctionnel (H/F)',
    })
    expect(erp?.technologies[0]?.name).toBe('SAP')
  })

  it('lit aussi le titre de l’offre, et ne confond pas un mot avec une technologie', () => {
    const result = buildTechStructure({
      jobSignals: [offer({ title: 'Administrateur Dynamics 365 CRM', skills: ['Asap', 'Sapristi'] })],
    })
    const names = result.axes.flatMap(axis => axis.technologies.map(tech => tech.name))
    expect(names).toEqual(['Dynamics 365'])
    expect(result.axes.find(axis => axis.axis === 'erp')?.status).toBe('not_observed')
  })

  it('un axe non observé reste NOMMÉ, vide, et la structure se dit partielle — jamais « 0 »', () => {
    const result = buildTechStructure({ jobSignals: [offer({ skills: ['Snowflake'] })] })
    expect(result.axes.map(axis => axis.axis)).toEqual(['crm', 'erp', 'data', 'hosting', 'business'])
    expect(result.axes.find(axis => axis.axis === 'crm')).toEqual({
      axis: 'crm',
      status: 'not_observed',
      technologies: [],
    })
    expect(result.observed_axes).toEqual(['data'])
    expect(result.not_observed_axes).toEqual(['crm', 'erp', 'hosting', 'business'])
  })

  it('une offre de stage ne prouve rien', () => {
    const result = buildTechStructure({ jobSignals: [offer({ contract_type: 'Stage', skills: ['Odoo'] })] })
    expect(result.observed_axes).toEqual([])
  })

  it('cumule les preuves d’une même technologie, la plus récente d’abord, bornées à trois', () => {
    const result = buildTechStructure({
      jobSignals: [
        offer({ date: '2026-05-01', skills: ['AWS'], url: 'https://o.example/a' }),
        offer({ date: '2026-09-01', skills: ['AWS'], url: 'https://o.example/b' }),
        offer({ date: '2026-07-01', skills: ['AWS'], url: 'https://o.example/c' }),
        offer({ date: '2026-06-01', skills: ['AWS'], url: 'https://o.example/d' }),
      ],
    })
    const proofs = result.axes.find(axis => axis.axis === 'hosting')?.technologies[0]?.proofs ?? []
    expect(proofs.map(proof => proof.observed_at)).toEqual(['2026-09-01', '2026-07-01', '2026-06-01'])
  })

  it('les technologies de l’analyse portent une preuve « analyse », datée de la collecte quand on la connaît', () => {
    const result = buildTechStructure({
      detectedTechStack: ['HubSpot'],
      analysedTechnologies: [{ name: 'Power BI' }],
      analysedAt: '2026-10-01',
    })
    const hub = result.axes.find(axis => axis.axis === 'crm')?.technologies[0]
    expect(hub?.proofs[0]).toEqual({ kind: 'analysis', observed_at: '2026-10-01', url: null, label: null })
    expect(result.axes.find(axis => axis.axis === 'data')?.technologies[0]?.name).toBe('Power BI')
  })

  it('ne devine rien : une technologie inconnue du catalogue n’entre dans aucun axe', () => {
    const result = buildTechStructure({ detectedTechStack: ['Cobol maison'] })
    expect(result.observed_axes).toEqual([])
  })
})
