import { CopilotBridgeController } from './copilot-bridge.controller'

/**
 * #3427 — Laura choisit un modèle approuvé par ses champs STRUCTURÉS (canal,
 * scénario, persona), jamais par ressemblance de mots. La règle absolue et la
 * sélection vivent dans `@bellum/contracts` ; le pont ne fait que relayer la
 * trace (quel exemple, pourquoi, lesquels écartés et pourquoi).
 */
describe('CopilotBridgeController.messageTemplateSelect (#3427)', () => {
  const workspaceContext = {
    resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'w-1', role: 'sales' }),
  }
  const dto = { userId: 'u-1', channel: 'linkedin_draft', scenarioId: 'accepted_connection', persona: 'decideur' }

  function call(messageLibrary: unknown) {
    return CopilotBridgeController.prototype.messageTemplateSelect.call(
      { workspaceContext, messageLibrary } as never,
      dto as never,
    )
  }

  it('relaie la trace et le texte VERBATIM de l’entrée choisie, avec ses variables', async () => {
    const select = jest
      .fn()
      .mockResolvedValue({ selectedId: 'e-1', reasons: ['canal, scénario, persona'], rejected: [] })
    const get = jest.fn().mockResolvedValue({
      id: 'e-1',
      title: 'M1 — invitation acceptée',
      text: 'Bonjour {{Prenom}}',
      expectedVariables: ['Prenom'],
      version: 2,
      usageConstraints: [],
    })
    const out = await call({ select, get })
    expect(select).toHaveBeenCalledWith(
      { userId: 'u-1', workspaceId: 'w-1', role: 'sales' },
      { channel: 'linkedin_draft', scenarioId: 'accepted_connection', persona: 'decideur' },
    )
    expect(out).toMatchObject({
      selectedId: 'e-1',
      template: { text: 'Bonjour {{Prenom}}', expectedVariables: ['Prenom'] },
    })
  })

  it('aucune entrée sélectionnable : AUCUN texte, la trace dit pourquoi (jamais un modèle inventé)', async () => {
    const select = jest.fn().mockResolvedValue({
      selectedId: null,
      reasons: ['aucun modèle approuvé'],
      rejected: [{ id: 'e-2', reason: 'affirmation sans donnée réelle' }],
    })
    const get = jest.fn()
    const out = (await call({ select, get })) as Record<string, unknown>
    expect(get).not.toHaveBeenCalled()
    expect(out.template).toBeNull()
    expect(out.rejected).toEqual([{ id: 'e-2', reason: 'affirmation sans donnée réelle' }])
  })

  it('borne les exemples écartés à 10 et dit le total exact', async () => {
    const rejected = Array.from({ length: 14 }, (_, i) => ({ id: `r-${i}`, reason: 'mode inspiration' }))
    const out = (await call({
      select: jest.fn().mockResolvedValue({ selectedId: null, reasons: [], rejected }),
      get: jest.fn(),
    })) as {
      rejected: unknown[]
      rejectedTotal: number
    }
    expect(out.rejected).toHaveLength(10)
    expect(out.rejectedTotal).toBe(14)
  })

  it('refuse honnêtement sans service câblé', async () => {
    expect(await call(undefined)).toEqual({ error: 'message_library_unavailable' })
  })

  describe('mode inspiration (#3443) — exemples de comportement', () => {
    const behaviorDto = { ...dto, mode: 'inspiration' }
    const callBehavior = (messageLibrary: unknown) =>
      CopilotBridgeController.prototype.messageTemplateSelect.call(
        { workspaceContext, messageLibrary } as never,
        behaviorDto as never,
      )

    it('relaie les exemples marqués « comportement seulement », jamais la sélection verbatim', async () => {
      const selectBehavior = jest.fn().mockResolvedValue({
        examples: [
          {
            id: 'e-9',
            title: 'Appel à froid',
            text: 'COMMERCIAL : …',
            usage: 'behavior_only',
            unverifiedClaims: ['x'],
          },
        ],
        reasons: ['canal=linkedin_draft'],
        rejected: [],
      })
      const select = jest.fn()
      const out = (await callBehavior({ select, selectBehavior })) as Record<string, unknown>
      expect(select).not.toHaveBeenCalled()
      expect(selectBehavior).toHaveBeenCalledWith(
        { userId: 'u-1', workspaceId: 'w-1', role: 'sales' },
        { channel: 'linkedin_draft', scenarioId: 'accepted_connection', persona: 'decideur' },
      )
      expect(out).toMatchObject({ mode: 'inspiration', examples: [{ id: 'e-9', usage: 'behavior_only' }] })
      expect(out).not.toHaveProperty('template')
      expect(String(out.instruction)).toContain('jamais')
    })

    it('aucun exemple : liste vide et motif, jamais un exemple inventé', async () => {
      const selectBehavior = jest.fn().mockResolvedValue({ examples: [], reasons: ['aucun'], rejected: [] })
      const out = (await callBehavior({ selectBehavior })) as { examples: unknown[] }
      expect(out.examples).toEqual([])
    })
  })
})
