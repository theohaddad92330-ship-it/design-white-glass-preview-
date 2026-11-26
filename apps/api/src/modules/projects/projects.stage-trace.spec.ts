import { ProjectsService } from './projects.service'

/**
 * Déplacer un projet laisse une trace.
 *
 * `stage_change` était déclaré dans `ACTIVITY_KINDS`, contraint en SQL par la
 * migration `ActivitiesTimeline`, traduit à l'écran — et **aucun code ne
 * l'écrivait jamais**. C'est exactement la classe de défaut que
 * `wired-write-paths.spec.ts` a été écrit pour attraper après s'être présentée
 * trois fois : la table existe, l'écran l'affiche, les tests passent, et rien
 * ne se produit en production.
 *
 * Conséquence concrète : la timeline d'un compte ne montrait pas le mouvement
 * commercial le plus important — « ce projet est passé en négociation »,
 * « ce projet a été perdu, pour cette raison ». Un historique qui omet ça
 * raconte les e-mails et tait les décisions.
 *
 * Deux règles portent l'écriture :
 *  - la trace est BEST-EFFORT, comme celle des positionnements : perdre une
 *    ligne d'historique ne doit jamais faire échouer le déplacement lui-même ;
 *  - l'identifiant externe porte l'étape ET l'horodatage d'entrée, pas
 *    seulement l'étape : un projet qui revient en négociation le mois suivant
 *    est un vrai second mouvement, et une clé sans date l'avalerait en doublon.
 */
describe('ProjectsService — la trace du déplacement d’étape', () => {
  const row = {
    id: 'p-1',
    account_id: 'acc-1',
    company_name: 'ACME',
    label: 'Migration Cloud',
    stage: 'negotiation',
    stage_entered_at: '2026-08-19T10:00:00.000Z',
    loss_reason: null,
  }

  const build = (overrides: { rows?: unknown[]; ingest?: jest.Mock } = {}) => {
    const query = jest.fn().mockResolvedValue(overrides.rows ?? [row])
    const repo = { manager: { query } }
    const ingest = overrides.ingest ?? jest.fn().mockResolvedValue(undefined)
    const activities = { ingest }
    return { service: new ProjectsService(repo as never, activities as never), query, ingest }
  }

  it('écrit une activité `stage_change` sur le compte ET le projet', async () => {
    const { service, ingest } = build()

    await service.updateStage('p-1', 'w-1', 'negotiation', null, 'u-1')

    expect(ingest).toHaveBeenCalledTimes(1)
    const [workspaceId, userId, entries] = ingest.mock.calls[0] as [string, string, Array<Record<string, unknown>>]
    expect(workspaceId).toBe('w-1')
    expect(userId).toBe('u-1')
    expect(entries[0]).toMatchObject({
      kind: 'stage_change',
      source: 'system',
      accountId: 'acc-1',
      projectId: 'p-1',
    })
  })

  it('porte l’étape ET l’horodatage d’entrée dans la clé — un retour en négociation est un vrai second mouvement', async () => {
    const { service, ingest } = build()

    await service.updateStage('p-1', 'w-1', 'negotiation', null, 'u-1')

    const entries = (ingest.mock.calls[0] as [string, string, Array<Record<string, unknown>>])[2]
    expect(entries[0].externalId).toBe('project:p-1:negotiation:2026-08-19T10:00:00.000Z')
  })

  it('reprend le motif de perte dans la trace — c’est ce qu’on relira dans six mois', async () => {
    const { service, ingest } = build({
      rows: [{ ...row, stage: 'lost', loss_reason: 'Budget gelé côté client' }],
    })

    await service.updateStage('p-1', 'w-1', 'lost', 'Budget gelé côté client', 'u-1')

    const entries = (ingest.mock.calls[0] as [string, string, Array<Record<string, unknown>>])[2]
    expect(entries[0].body).toContain('Budget gelé côté client')
  })

  it('n’écrit RIEN quand le projet est introuvable ou hors de l’espace', async () => {
    const { service, ingest } = build({ rows: [] })

    const result = await service.updateStage('p-1', 'w-1', 'negotiation', null, 'u-1')

    expect(result).toBeNull()
    expect(ingest).not.toHaveBeenCalled()
  })

  it('rend le projet déplacé même si la trace échoue — on ne perd pas un mouvement pour une ligne d’historique', async () => {
    const ingest = jest.fn().mockRejectedValue(new Error('activities down'))
    const { service } = build({ ingest })

    const result = await service.updateStage('p-1', 'w-1', 'negotiation', null, 'u-1')

    expect(result).not.toBeNull()
  })

  it('reste inchangé quand le journal d’activité n’est pas câblé', async () => {
    const query = jest.fn().mockResolvedValue([row])
    const service = new ProjectsService({ manager: { query } } as never)

    await expect(service.updateStage('p-1', 'w-1', 'negotiation', null, 'u-1')).resolves.not.toBeNull()
  })

  it('n’écrit aucune trace sans appelant identifié — une activité sans auteur ne se relit pas', async () => {
    const { service, ingest } = build()

    await service.updateStage('p-1', 'w-1', 'negotiation', null)

    expect(ingest).not.toHaveBeenCalled()
  })
})
