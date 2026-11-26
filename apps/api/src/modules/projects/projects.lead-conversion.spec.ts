import { LEAD_CONVERSION_FIELDS, leadConversionSchema } from '@bellum/contracts'
import { ProjectsController } from './projects.controller'

/**
 * #2172.36 → .40 / .53 — CE QUE L'ÉCRAN DEMANDE, L'API LE REÇOIT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ, ET CE QU'IL N'ÉTAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `leadConversionSchema` fige CINQ champs à la conversion d'une piste —
 * porteur, objectif, étape de départ, prochaine action, besoin éventuel — et le
 * contrat n'avait AUCUN appelant : aucun endpoint ne les recevait. L'écran, lui,
 * était déjà honnête : il ne demandait QUE l'étape, et disait en toutes lettres
 * que le reste se saisissait sur la fiche. Rien n'était donc jeté — c'est la
 * moitié du point qui manquait, pas une saisie perdue.
 *
 * Ce que cette suite tient, c'est le trajet entier : le corps que le formulaire
 * envoie est celui que le contrat décrit, et CHACUN de ses cinq champs atterrit
 * quelque part. Un champ qui cesserait d'atterrir redeviendrait exactement le
 * défaut qu'on refuse — l'écran le demande, personne ne l'enregistre.
 */
describe('ProjectsController — la conversion d’une piste (#2172.36 → .40)', () => {
  const project = { id: 'p-1', account_id: 'acc-1', label: 'Refonte du SI paiement', stage: 'qualified' }

  const build = () => {
    const projects = { applyConversion: jest.fn().mockResolvedValue(project) }
    const pipeline = { addNeed: jest.fn().mockResolvedValue({ id: 'need-1' }) }
    const workspaceContext = {
      resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1' }),
      assertMember: jest.fn().mockResolvedValue(undefined),
    }
    const tasks = { create: jest.fn().mockResolvedValue({ id: 'task-1' }) }
    const controller = new ProjectsController(
      projects as never,
      pipeline as never,
      {} as never,
      workspaceContext as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      tasks as never,
    )
    return { controller, projects, pipeline, workspaceContext, tasks }
  }

  const user = { userId: 'u-1' } as never

  /** Exactement ce que le formulaire envoie : les cinq champs, et rien de plus. */
  const payload = {
    owner_id: '11111111-1111-4111-8111-111111111111',
    objective: 'Décrocher 3 rendez-vous avec la DSI',
    initial_stage: 'qualified' as const,
    next_action: { title: 'Appeler la DSI mardi', due_on: '2026-09-22' },
    need: 'Deux développeurs Java confirmés',
  }

  it('lit un corpus NON VIDE — les cinq champs viennent du contrat, pas d’une liste retapée', () => {
    expect(LEAD_CONVERSION_FIELDS.length).toBe(5)
    expect(leadConversionSchema.safeParse(payload).success).toBe(true)
    // Et le corps du formulaire est EXACTEMENT celui-là : une clé de plus est
    // une ressaisie qui se réintroduit, le contrat est `.strict()`.
    expect(Object.keys(payload).sort()).toEqual([...LEAD_CONVERSION_FIELDS].sort())
  })

  it('écrit l’étape, le porteur et l’objectif sur la ligne — en une seule écriture', async () => {
    const { controller, projects } = build()

    await controller.convert('p-1', payload as never, user)

    expect(projects.applyConversion).toHaveBeenCalledWith(
      'p-1',
      'w-1',
      { stage: 'qualified', ownerId: payload.owner_id, objective: payload.objective },
      'u-1',
    )
  })

  it('refuse d’attribuer la piste à quelqu’un hors de l’espace', async () => {
    const { controller, workspaceContext } = build()

    await controller.convert('p-1', payload as never, user)

    expect(workspaceContext.assertMember).toHaveBeenCalledWith(payload.owner_id, 'w-1')
  })

  it('la prochaine action devient une TÂCHE sur le projet — c’est ce que la carte relit', async () => {
    const { controller, tasks } = build()

    await controller.convert('p-1', payload as never, user)

    expect(tasks.create).toHaveBeenCalledWith(
      'u-1',
      {
        title: 'Appeler la DSI mardi',
        dueOn: '2026-09-22',
        priority: 'normal',
        ownerId: payload.owner_id,
        accountId: 'acc-1',
        projectId: 'p-1',
        // #2395.8 (épopée #2871) — le même objectif que celui de l'opportunité.
        objective: payload.objective,
        // #2395.8, seconde moitié — cette première étape a eu lieu et
        // l'opportunité a avancé, rien de plus n'est vérifiable ici.
        expectedResult: '« Appeler la DSI mardi » a eu lieu, l’opportunité a avancé.',
      },
      // #2105.7 — cette tâche naît d'une conversion, pas du composeur manuel.
      'lead_conversion',
    )
  })

  it('le besoin devient un RÔLE du projet', async () => {
    const { controller, pipeline } = build()

    await controller.convert('p-1', payload as never, user)

    expect(pipeline.addNeed).toHaveBeenCalledWith('w-1', 'p-1', {
      title: 'Deux développeurs Java confirmés',
      owner_id: payload.owner_id,
    })
  })

  it('un besoin ABSENT n’en invente pas un vide', async () => {
    const { controller, pipeline } = build()

    const result = await controller.convert('p-1', { ...payload, need: null } as never, user)

    expect(pipeline.addNeed).not.toHaveBeenCalled()
    expect(result.need).toBeNull()
  })

  it('rend ce qui a été écrit — l’écran n’a rien à deviner', async () => {
    const { controller } = build()

    const result = await controller.convert('p-1', payload as never, user)

    expect(result).toEqual({ project, next_action: { id: 'task-1' }, need: { id: 'need-1' } })
  })
})
