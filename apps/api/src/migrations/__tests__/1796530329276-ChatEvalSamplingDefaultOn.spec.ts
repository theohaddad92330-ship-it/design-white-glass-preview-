import type { QueryRunner } from 'typeorm'
import { ChatEvalSamplingDefaultOn1796530329276 } from '../1796530329276-ChatEvalSamplingDefaultOn'

function createRunner(): { runner: QueryRunner; queries: string[] } {
  const queries: string[] = []
  const runner = {
    query: jest.fn(async (sql: string) => {
      queries.push(sql)
      return []
    }),
  } as unknown as QueryRunner
  return { runner, queries }
}

const normalize = (sql: string): string => sql.replace(/\s+/g, ' ').trim()

async function upSql(): Promise<string> {
  const { runner, queries } = createRunner()
  await new ChatEvalSamplingDefaultOn1796530329276().up(runner)
  return queries.map(normalize).join(' ')
}

describe('ChatEvalSamplingDefaultOn1796530329276 (#4173)', () => {
  it('ajoute `chat_eval_sampling_chosen_at`, additif — contrainte élargie AVANT le code qui écrit (GA-11/GA-12)', async () => {
    const flat = await upSql()
    expect(flat).toContain(
      'ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS chat_eval_sampling_chosen_at timestamptz NULL',
    )
  })

  it('bascule le DÉFAUT de la colonne à `true`, pour les espaces neufs', async () => {
    const flat = await upSql()
    expect(flat).toContain('ALTER TABLE workspaces ALTER COLUMN chat_eval_sampling_enabled SET DEFAULT true')
  })

  it('ne bascule QUE les lignes jamais choisies (chosen_at NULL), jamais un refus explicite ni la démo', async () => {
    const flat = await upSql()
    expect(flat).toContain('UPDATE workspaces SET chat_eval_sampling_enabled = true')
    expect(flat).toContain('WHERE chat_eval_sampling_chosen_at IS NULL')
    expect(flat).toContain('AND chat_eval_sampling_enabled = false')
    expect(flat).toContain('AND is_demo = false')
  })

  it("down() rend la colonne d'horodatage et le défaut d'avant, sans prétendre défaire le bascule de données", async () => {
    const { runner, queries } = createRunner()
    await new ChatEvalSamplingDefaultOn1796530329276().down(runner)
    const flat = queries.map(normalize).join(' ')
    expect(flat).toContain('ALTER TABLE workspaces ALTER COLUMN chat_eval_sampling_enabled SET DEFAULT false')
    expect(flat).toContain('ALTER TABLE workspaces DROP COLUMN IF EXISTS chat_eval_sampling_chosen_at')
  })
})
