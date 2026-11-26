import { loadEngagementDraft, saveEngagementDraft } from './engagement-drafts'

describe('engagement-drafts (#3694.7)', () => {
  it("lit le brouillon d'un (utilisateur, contact, canal) borné à son workspace", async () => {
    const query = jest.fn().mockResolvedValue([
      {
        entries: [{ id: 'a1', role: 'user', text: 'Rédige un email' }],
        context: 'Angle : renouvellement',
        parameters: { objective: 'relance' },
      },
    ])
    const snapshot = await loadEngagementDraft(
      { query },
      { contactId: 'c1', workspaceId: 'w1', userId: 'u1', channel: 'email' },
    )
    expect(query.mock.calls[0][0]).toMatch(/user_id = \$2/)
    expect(query.mock.calls[0][0]).toMatch(/contact_id = \$3/)
    expect(query.mock.calls[0][0]).toMatch(/channel = \$4/)
    expect(query.mock.calls[0][1]).toEqual(['w1', 'u1', 'c1', 'email'])
    expect(snapshot).toEqual({
      entries: [{ id: 'a1', role: 'user', text: 'Rédige un email' }],
      context: 'Angle : renouvellement',
      parameters: { objective: 'relance' },
    })
  })

  it('aucun brouillon enregistré ⇒ null, jamais un cliché inventé', async () => {
    expect(
      await loadEngagementDraft(
        { query: jest.fn().mockResolvedValue([]) },
        {
          contactId: 'c1',
          workspaceId: 'w1',
          userId: 'u1',
          channel: 'email',
        },
      ),
    ).toBeNull()
  })

  it('enregistre par UPSERT (une ligne par utilisateur, contact et canal)', async () => {
    const query = jest.fn().mockResolvedValue([])
    await saveEngagementDraft(
      { query },
      {
        contactId: 'c1',
        workspaceId: 'w1',
        userId: 'u1',
        channel: 'linkedin',
        entries: [{ id: 'a1', role: 'assistant', text: 'Bonjour' }],
        context: '',
        parameters: {},
      },
    )
    const [sql, params] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toMatch(/ON CONFLICT \(user_id, contact_id, channel\) DO UPDATE/)
    expect(params[0]).toBe('w1')
    expect(params[1]).toBe('u1')
    expect(params[2]).toBe('c1')
    expect(params[3]).toBe('linkedin')
    expect(JSON.parse(params[4] as string)).toEqual([{ id: 'a1', role: 'assistant', text: 'Bonjour' }])
    expect(params[5]).toBe('')
    expect(JSON.parse(params[6] as string)).toEqual({})
  })
})
