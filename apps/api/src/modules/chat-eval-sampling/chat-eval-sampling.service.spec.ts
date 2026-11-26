import { ChatEvalSamplingService } from './chat-eval-sampling.service'

/** #2899 — opt-in par espace, anonymisé avant stockage, décocher efface. */
function build(opts: { enabled?: boolean; findThrows?: boolean } = {}) {
  const workspaces = {
    findOne: opts.findThrows
      ? jest.fn().mockRejectedValue(new Error('down'))
      : jest.fn().mockResolvedValue({ id: 'ws-1', chat_eval_sampling_enabled: opts.enabled ?? false }),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  }
  const samples = {
    insert: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue({ affected: 2 }),
    find: jest.fn().mockResolvedValue([
      {
        id: 's1',
        workspace_id: 'ws-1',
        anonymized_text: 'prépare une relance pour le DSI de [nom]',
        sampled_at: new Date('2026-10-10T08:00:00Z'),
      },
    ]),
  }
  const service = new ChatEvalSamplingService(workspaces as never, samples as never)
  return { service, workspaces, samples }
}

describe('ChatEvalSamplingService', () => {
  it('décoché : rien n’est versé, le texte n’est même pas lu', async () => {
    const { service, samples } = build({ enabled: false })
    expect(await service.recordUserTurn('ws-1', 'prépare une relance pour Nova')).toBe(false)
    expect(samples.insert).not.toHaveBeenCalled()
  })

  it('coché : verse le texte ANONYMISÉ, jamais l’original', async () => {
    const { service, samples } = build({ enabled: true })
    expect(await service.recordUserTurn('ws-1', 'écris à marie@nova.fr pour le DSI de Nova Logistique')).toBe(true)
    const row = (samples.insert.mock.calls[0] as [{ anonymized_text: string }])[0]
    expect(row.anonymized_text).not.toMatch(/marie@|Nova|Logistique/)
  })

  it('coché mais le tour ressemble à un message rédigé : rien n’est versé', async () => {
    const { service, samples } = build({ enabled: true })
    expect(await service.recordUserTurn('ws-1', 'Bonjour Madame,\nCordialement,\nLouis')).toBe(false)
    expect(samples.insert).not.toHaveBeenCalled()
  })

  it('une lecture du réglage qui échoue = ne rien verser, sans lever', async () => {
    const { service, samples } = build({ findThrows: true })
    await expect(service.recordUserTurn('ws-1', 'une question')).resolves.toBe(false)
    expect(samples.insert).not.toHaveBeenCalled()
  })

  it('décocher PURGE les échantillons déjà versés', async () => {
    const { service, workspaces, samples } = build({ enabled: true })
    await service.set('ws-1', false)
    expect(workspaces.update).toHaveBeenCalledWith(
      { id: 'ws-1' },
      { chat_eval_sampling_enabled: false, chat_eval_sampling_chosen_at: expect.any(Date) },
    )
    expect(samples.delete).toHaveBeenCalledWith({ workspace_id: 'ws-1' })
  })

  it('cocher ne purge rien', async () => {
    const { service, samples } = build()
    await service.set('ws-1', true)
    expect(samples.delete).not.toHaveBeenCalled()
  })

  // #4173 — un choix explicite (dans UN sens OU L'AUTRE) s'horodate : c'est ce qui protège
  // ce choix d'un futur bascule de défaut (une correction humaine gagne toujours).
  it('cocher OU décocher horodate `chat_eval_sampling_chosen_at`, dans les deux sens', async () => {
    const { service: serviceOn, workspaces: workspacesOn } = build()
    await serviceOn.set('ws-1', true)
    expect(workspacesOn.update).toHaveBeenCalledWith(
      { id: 'ws-1' },
      { chat_eval_sampling_enabled: true, chat_eval_sampling_chosen_at: expect.any(Date) },
    )

    const { service: serviceOff, workspaces: workspacesOff } = build({ enabled: true })
    await serviceOff.set('ws-1', false)
    expect(workspacesOff.update).toHaveBeenCalledWith(
      { id: 'ws-1' },
      { chat_eval_sampling_enabled: false, chat_eval_sampling_chosen_at: expect.any(Date) },
    )
  })

  // #2899 / #2443.10 — le LECTEUR des échantillons (corpus « erreurs production anonymisées »).
  it('rejeu : rend le texte anonymisé et la date, JAMAIS l’espace ni l’identifiant', async () => {
    const { service, samples } = build()
    const rows = await service.listForReplay(50)
    expect(rows).toEqual([{ text: 'prépare une relance pour le DSI de [nom]', sampledAt: '2026-10-10T08:00:00.000Z' }])
    expect(JSON.stringify(rows)).not.toMatch(/ws-1|"id"|workspace/)
    expect(samples.find).toHaveBeenCalledWith(expect.objectContaining({ take: 50, order: { sampled_at: 'DESC' } }))
  })

  it('rejeu : le plafond est borné (1..500) et une lecture en panne rend une liste vide, sans lever', async () => {
    const { service, samples } = build()
    await service.listForReplay(100000)
    expect(samples.find).toHaveBeenLastCalledWith(expect.objectContaining({ take: 500 }))
    await service.listForReplay(Number.NaN)
    expect(samples.find).toHaveBeenLastCalledWith(expect.objectContaining({ take: 100 }))
    samples.find.mockRejectedValueOnce(new Error('down'))
    await expect(service.listForReplay(10)).resolves.toEqual([])
  })

  it('#2958.98 — avec l’exception nommée, un corps de message est versé anonymisé', async () => {
    const { service, samples } = build({ enabled: true })
    const body = 'Bonjour Madame,\nJe vous propose un échange.\nCordialement,\nLouis'
    expect(await service.recordUserTurn('ws-1', body)).toBe(false)
    expect(await service.recordUserTurn('ws-1', body, { allowMessageBody: true })).toBe(true)
    expect(samples.insert).toHaveBeenCalledTimes(1)
  })
})
