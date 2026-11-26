import { ProjectSynthesisService } from './project-synthesis.service'

/**
 * #2171.27 — la synthèse en 7 questions d'une opportunité. Premier APPELANT
 * RÉEL du contrat `project-synthesis.ts` (contact confirmé/hypothèse, garde
 * anti-phrase-vague #2171.28).
 */
describe('ProjectSynthesisService', () => {
  const PROJECT_ID = '11111111-1111-4111-8111-111111111111'
  const WORKSPACE_ID = 'w-1'
  const PROJECT_ROW = {
    id: PROJECT_ID,
    workspace_id: WORKSPACE_ID,
    account_id: 'a-1',
    label: 'Migration ERP',
    kind: 'program',
    detail: 'Refonte du SI achats',
    offer: null,
    urgency: null,
    stage: 'confirmed',
  }
  const VALID_SYNTHESIS = {
    problem: 'Le client cherche à absorber la charge sans recruter.',
    confirmed: ['Le budget est validé pour le T1.'],
    hypotheses: [],
    decisionMaker: 'DSI',
    blockingConditions: [],
    nextToObtain: 'La date du comité achats.',
    whatNotToDo: 'Ne pas relancer avant le comité.',
  }

  function buildService(
    over: Partial<{ projectsFindOne: unknown; accountsFindOne: unknown; iaResult: unknown; iaThrows: Error }> = {},
  ) {
    const projects = {
      findOne: jest.fn().mockResolvedValue('projectsFindOne' in over ? over.projectsFindOne : PROJECT_ROW),
    }
    const accounts = {
      findOne: jest.fn().mockResolvedValue(over.accountsFindOne ?? { company_name: 'ACME', sector: 'Industrie' }),
    }
    const projectContacts = { find: jest.fn().mockResolvedValue([]) }
    const contacts = { find: jest.fn().mockResolvedValue([]) }
    const ia = {
      projectSynthesis: over.iaThrows
        ? jest.fn().mockRejectedValue(over.iaThrows)
        : jest.fn().mockResolvedValue({ data: over.iaResult ?? VALID_SYNTHESIS }),
    }
    const service = new ProjectSynthesisService(
      projects as never,
      accounts as never,
      projectContacts as never,
      contacts as never,
      ia as never,
    )
    return { service, ia, projects }
  }

  it('refuse une opportunité hors de l’espace', async () => {
    const { service } = buildService({ projectsFindOne: null })

    const result = await service.generate(PROJECT_ID, WORKSPACE_ID)

    expect(result).toEqual({ ok: false, code: 'not_found' })
  })

  it('renvoie la synthèse quand le modèle répond une forme valide', async () => {
    const { service } = buildService()

    const result = await service.generate(PROJECT_ID, WORKSPACE_ID)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.synthesis.problem).toBe(VALID_SYNTHESIS.problem)
      expect(result.synthesis.projectId).toBe(PROJECT_ID)
      expect(result.synthesis.confirmed).toEqual(VALID_SYNTHESIS.confirmed)
    }
  })

  it('un échec IA ne renvoie ni ne persiste rien', async () => {
    const { service } = buildService({ iaThrows: new Error('boom') })

    const result = await service.generate(PROJECT_ID, WORKSPACE_ID)

    expect(result).toEqual({ ok: false, code: 'ia_failed' })
  })

  it('une forme qui ne tient pas le contrat (#2171.44 : faits/hypothèses) est refusée', async () => {
    // `confirmed` doit être un tableau — un modèle qui répond une chaîne casse
    // la distinction fait/hypothèse que le contrat impose.
    const { service } = buildService({ iaResult: { ...VALID_SYNTHESIS, confirmed: 'un fait' } })

    const result = await service.generate(PROJECT_ID, WORKSPACE_ID)

    expect(result).toEqual({ ok: false, code: 'ia_failed' })
  })

  it('#2171.28 — une phrase bannie sans fait pour la porter est refusée avant l’écran', async () => {
    const { service } = buildService({
      iaResult: { ...VALID_SYNTHESIS, problem: 'Bon potentiel', confirmed: [], hypotheses: [] },
    })

    const result = await service.generate(PROJECT_ID, WORKSPACE_ID)

    expect(result).toEqual({ ok: false, code: 'vague_without_fact' })
  })

  it('#2171.28 — la même phrase bannie PASSE dès qu’un fait l’accompagne', async () => {
    const { service } = buildService({
      iaResult: { ...VALID_SYNTHESIS, problem: 'Bon potentiel', confirmed: ['Un budget validé.'] },
    })

    const result = await service.generate(PROJECT_ID, WORKSPACE_ID)

    expect(result.ok).toBe(true)
  })
})
