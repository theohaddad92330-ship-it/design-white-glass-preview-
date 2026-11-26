import { DEEPEN_RESUME_MESSAGE, runDeepenResumeTurn } from './chat-deepen-resume-turn'

/**
 * #3236 (lot W2) — un tour de reprise passe par LE chemin du chat (`IaProxyController.chat`), écrit la
 * demande puis la réponse, et NE PRÉTEND PAS avoir repris quand le tour n'a rien rendu.
 */
const JOB = { user_id: 'user-1', conversation_id: 'conv-1', label: 'Étude du groupe Thales' }

function setup(stream: (res: { write: (chunk: string) => boolean; end: () => void }) => void) {
  const chat = jest.fn().mockImplementation(async (_user, _dto, res) => {
    stream(res)
    res.end()
  })
  const create = jest.fn().mockResolvedValue({ id: 'm' })
  const runner = {
    run: (job: typeof JOB) => runDeepenResumeTurn(job, { workspaceId: 'ws-1', chat, messages: { create } }),
  }
  return { runner, chat, create }
}

const doneLine = (payload: object) => `data: ${JSON.stringify({ type: 'done', ...payload })}\n\n`

describe('runDeepenResumeTurn', () => {
  it('joue un tour Approfondi de la conversation et écrit la demande puis la réponse', async () => {
    const { runner, chat, create } = setup(res => {
      res.write('data: {"type":"token","text":"Bon"}\n\n')
      res.write(doneLine({ success: true, data: { reply: 'Voici la suite de l’étude.', turn_id: 't-1' } }))
    })
    await runner.run(JOB)
    expect(chat).toHaveBeenCalledWith(
      { userId: 'user-1', email: '' },
      { message: DEEPEN_RESUME_MESSAGE, conversationId: 'conv-1', mode: 'approfondi' },
      expect.anything(),
    )
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ role: 'user', content: DEEPEN_RESUME_MESSAGE, workspaceId: 'ws-1' }),
    )
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        role: 'assistant',
        content: 'Voici la suite de l’étude.',
        turnId: 't-1',
        conversationId: 'conv-1',
      }),
    )
  })

  it('un tour sans réponse lève (la reprise sera NOMMÉE resume_failed) et n’écrit aucune réponse inventée', async () => {
    const { runner, create } = setup(res => res.write(doneLine({ success: false, data: { reply: '' } })))
    await expect(runner.run(JOB)).rejects.toThrow()
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('un flux sans `done` lève aussi', async () => {
    const { runner } = setup(() => undefined)
    await expect(runner.run(JOB)).rejects.toThrow()
  })
})
